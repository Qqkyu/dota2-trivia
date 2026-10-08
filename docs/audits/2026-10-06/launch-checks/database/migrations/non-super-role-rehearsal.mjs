import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, pbkdf2Sync, createHmac, createHash } from "node:crypto";
import postgres from "/home/kulmisiu/dev/dota2-trivia/node_modules/postgres/src/index.js";
import { migrateDatabase, verifyDatabaseSchema } from "/home/kulmisiu/dev/dota2-trivia/src/lib/database-schema.mjs";
import { grantRuntimeDatabasePrivileges } from "/home/kulmisiu/dev/dota2-trivia/scripts/database-runtime-grants.mjs";
const fixture = JSON.parse(
  await readFile("/tmp/queue-arcade-launch-checks/infrastructure/restore-pg17/connection.json", "utf8"),
);
const url = new URL(fixture.adminUrl);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55823");
const unique = `${Date.now()}_${randomBytes(3).toString("hex")}`;
const owner = `qa_owner_${unique}`,
  runtime = `qa_runtime_${unique}`,
  database = `qa_role_${unique}`;
const literal = (s) => `'${s.replaceAll("'", "''")}'`;
function verifier(password) {
  const salt = randomBytes(16),
    salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
  const client = createHmac("sha256", salted).update("Client Key").digest();
  const stored = createHash("sha256").update(client).digest("base64"),
    server = createHmac("sha256", salted).update("Server Key").digest("base64");
  return `SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored}:${server}`;
}
const ownerPassword = randomBytes(32).toString("base64url"),
  runtimePassword = randomBytes(32).toString("base64url"),
  runtimeVerifier = verifier(runtimePassword);
const sqlOptions = { max: 1, connect_timeout: 3, prepare: false, onnotice: () => {} };
const admin = postgres(fixture.adminUrl, sqlOptions),
  connections = [];
function connect(role, password, dbname = database) {
  const target = new URL(url);
  target.username = role;
  target.password = password;
  target.pathname = `/${dbname}`;
  const sql = postgres(target.toString(), sqlOptions);
  connections.push(sql);
  return sql;
}
const report = { checkedAt: new Date().toISOString(), checks: {} };
let ownerSql, runtimeSql;
async function denied(sql, query, code = "42501") {
  let result;
  try {
    await sql.unsafe(query);
  } catch (e) {
    result = e.code;
  }
  assert.equal(result, code);
  return result;
}
try {
  const [{ version }] = await admin`SELECT current_setting('server_version') AS version`;
  assert.match(version, /^17\./);
  report.serverVersion = version;
  await admin.unsafe(
    `CREATE ROLE "${owner}" LOGIN NOSUPERUSER CREATEDB CREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${literal(verifier(ownerPassword))}`,
  );
  const creator = connect(owner, ownerPassword, url.pathname.slice(1));
  await creator.unsafe(`CREATE DATABASE "${database}"`);
  ownerSql = connect(owner, ownerPassword);
  const [setting] = await ownerSql`SELECT current_setting('createrole_self_grant') AS value`;
  report.creatorSelfGrant = setting.value;
  await ownerSql.unsafe(
    `CREATE ROLE "${runtime}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20 PASSWORD ${literal(runtimeVerifier)}`,
  );
  report.checks.nonSuperuserCreatedExactRuntimeRole = true;
  const [flags] =
    await admin`SELECT rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolcanlogin,rolconnlimit FROM pg_roles WHERE rolname=${runtime}`;
  assert.deepEqual(
    { ...flags },
    {
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolinherit: false,
      rolreplication: false,
      rolbypassrls: false,
      rolcanlogin: true,
      rolconnlimit: 20,
    },
  );
  report.runtimeFlags = flags;
  const memberships =
    await admin`SELECT parent.rolname=${runtime} AS parent_is_runtime, member.rolname=${owner} AS member_is_creator, m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE parent.rolname=${runtime} OR member.rolname=${runtime}`;
  assert.equal(memberships.length, 1);
  assert.deepEqual(
    { ...memberships[0] },
    { parent_is_runtime: true, member_is_creator: true, admin_option: true, inherit_option: false, set_option: false },
  );
  report.memberships = memberships;
  const [passwordRecord] =
    await admin`SELECT rolpassword=${runtimeVerifier} AS exact_verifier FROM pg_authid WHERE rolname=${runtime}`;
  assert.equal(passwordRecord.exact_verifier, true);
  report.checks.scramVerifierStoredUnchanged = true;
  runtimeSql = connect(runtime, runtimePassword);
  const [login] = await runtimeSql`SELECT current_user=${runtime} AS expected_user`;
  assert.equal(login.expected_user, true);
  report.checks.scramPasswordLogin = true;
  const wrong = connect(runtime, randomBytes(32).toString("base64url"));
  report.checks.wrongPasswordDenied = await denied(wrong, "SELECT 1", "28P01");
  await wrong.end();
  const [ownership] =
    await ownerSql`SELECT pg_get_userbyid(n.nspowner) AS schema_owner, has_schema_privilege(current_user,'public','CREATE') AS schema_create, has_database_privilege(current_user,current_database(),'CREATE') AS database_create FROM pg_namespace n WHERE n.nspname='public'`;
  assert.equal(ownership.schema_create, true);
  assert.equal(ownership.database_create, true);
  report.ownership = ownership;
  report.applied = await migrateDatabase(ownerSql);
  await verifyDatabaseSchema(ownerSql);
  const grants = await grantRuntimeDatabasePrivileges(ownerSql, { role: runtime });
  report.grants = { ...grants, role: "synthetic_runtime" };
  assert.equal(grants.tables, 13);
  await verifyDatabaseSchema(runtimeSql);
  await runtimeSql.begin(async (tx) => {
    await tx`INSERT INTO queue_arcade_users(id,created_at,updated_at) VALUES ('role-probe',1,1)`;
    const rows = await tx`SELECT id FROM queue_arcade_users WHERE id='role-probe'`;
    assert.equal(rows.length, 1);
    await tx`UPDATE queue_arcade_users SET updated_at=2 WHERE id='role-probe'`;
    await tx`DELETE FROM queue_arcade_users WHERE id='role-probe'`;
  });
  report.checks.runtimeCrudAndSchemaVerification = true;
  report.checks.runtimeCreateDenied = await denied(runtimeSql, "CREATE TABLE public.role_denied(id integer)");
  report.checks.runtimeTempDenied = await denied(runtimeSql, "CREATE TEMP TABLE role_denied(id integer)");
  report.checks.runtimeLedgerUpdateDenied = await denied(
    runtimeSql,
    "UPDATE queue_arcade_schema_migrations SET name=name",
  );
  report.checks.runtimeSetOwnerDenied = await denied(runtimeSql, `SET ROLE "${owner}"`);
  report.checks.ownerSetRuntimeDeniedByDefault = await denied(ownerSql, `SET ROLE "${runtime}"`);
  await ownerSql.unsafe(`ALTER ROLE "${runtime}" CONNECTION LIMIT 20`);
  report.checks.creatorCanAlterRuntime = true;
  const active = [runtimeSql];
  for (let i = 1; i < 20; i++) {
    const sql = connect(runtime, runtimePassword);
    await sql`SELECT 1`;
    active.push(sql);
  }
  const overflow = connect(runtime, runtimePassword);
  report.checks.connection21Denied = await denied(overflow, "SELECT 1", "53300");
  await overflow.end();
  report.checks.twentyConnectionsAccepted = active.length === 20;
  report.ok = true;
} catch (e) {
  report.ok = false;
  report.failure = {
    name: e.name,
    code: e.code,
    message:
      e instanceof assert.AssertionError ? e.message : "Local role check failed; no query or credentials included.",
  };
  process.exitCode = 1;
} finally {
  await Promise.all(connections.map((sql) => sql.end({ timeout: 2 }).catch(() => {})));
  await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.unsafe(`DROP ROLE IF EXISTS "${runtime}"`);
  await admin.unsafe(`DROP ROLE IF EXISTS "${owner}"`);
  await admin.end({ timeout: 2 });
  report.cleanedUp = true;
  await writeFile(
    "/tmp/queue-arcade-launch-checks/non-super-role-rehearsal.json",
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report, null, 2));
}
