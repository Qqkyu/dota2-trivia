/** Apply the documented runtime grants in a dedicated application database. */
export async function grantRuntimeDatabasePrivileges(sql, { role, schema = "public" }) {
  if (!role || !schema) throw new Error("Runtime role and schema names are required.");
  return sql.begin(async (transaction) => {
    const [runtime] = await transaction`
      SELECT oid, rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = ${role}
    `;
    if (!runtime) throw new Error("The runtime role must exist before grants are applied.");
    if (
      runtime.rolsuper ||
      runtime.rolcreatedb ||
      runtime.rolcreaterole ||
      runtime.rolreplication ||
      runtime.rolbypassrls
    ) {
      throw new Error("The runtime role has administrative privileges.");
    }
    const [ownership] = await transaction`
      SELECT
        EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = ${runtime.oid}) AS database_owner,
        EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ${schema} AND nspowner = ${runtime.oid}) AS schema_owner,
        EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = ${schema} AND c.relowner = ${runtime.oid}
        ) AS relation_owner,
        EXISTS (
          SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = ${schema} AND p.proowner = ${runtime.oid}
        ) AS function_owner,
        EXISTS (SELECT 1 FROM pg_auth_members WHERE member = ${runtime.oid}) AS role_member
    `;
    if (Object.values(ownership).some(Boolean)) {
      throw new Error("The runtime role must not own database objects or belong to another role.");
    }
    const [database] = await transaction`SELECT current_database() AS name`;
    // The application database is dedicated. PUBLIC grants otherwise bypass role-specific revokes.
    await transaction`REVOKE CREATE, TEMPORARY ON DATABASE ${transaction(database.name)} FROM PUBLIC`;
    await transaction`REVOKE CREATE, TEMPORARY ON DATABASE ${transaction(database.name)} FROM ${transaction(role)}`;
    await transaction`GRANT CONNECT ON DATABASE ${transaction(database.name)} TO ${transaction(role)}`;
    await transaction`REVOKE CREATE ON SCHEMA ${transaction(schema)} FROM PUBLIC`;
    await transaction`REVOKE ALL ON SCHEMA ${transaction(schema)} FROM ${transaction(role)}`;
    await transaction`GRANT USAGE ON SCHEMA ${transaction(schema)} TO ${transaction(role)}`;
    const tables = await transaction`
      SELECT tablename FROM pg_tables
      WHERE schemaname = ${schema} AND left(tablename, 13) = 'queue_arcade_'
      ORDER BY tablename
    `;
    if (!tables.some((table) => table.tablename === "queue_arcade_schema_migrations")) {
      throw new Error("Run the database migrations before applying runtime grants.");
    }
    for (const { tablename } of tables) {
      const table = transaction`${transaction(schema)}.${transaction(tablename)}`;
      await transaction`REVOKE ALL ON TABLE ${table} FROM PUBLIC`;
      await transaction`REVOKE ALL ON TABLE ${table} FROM ${transaction(role)}`;
      if (tablename === "queue_arcade_schema_migrations") {
        await transaction`GRANT SELECT ON TABLE ${table} TO ${transaction(role)}`;
      } else {
        await transaction`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${table} TO ${transaction(role)}`;
      }
    }
    return {
      role,
      schema,
      tables: tables.length,
      ledger: "SELECT",
      applicationTables: "SELECT, INSERT, UPDATE, DELETE",
    };
  });
}
