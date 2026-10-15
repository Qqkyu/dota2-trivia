# PostgreSQL 17 role creation rehearsal

The local PostgreSQL 17.11 check passed on 2026-10-06. It created a fresh database and two synthetic roles, then removed them. It made no remote database changes. The repeatable script and safe JSON evidence are beside this report.

A non-superuser database owner with CREATEDB and CREATEROLE created a runtime role with LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION, NOBYPASSRLS, CONNECTION LIMIT 20 and a locally generated SCRAM-SHA-256 verifier. The verifier remained unchanged in the password catalog. The generated plaintext password authenticated; a wrong password failed with 28P01. PostgreSQL accepts an existing SCRAM verifier as documented in [CREATE ROLE](https://www.postgresql.org/docs/17/sql-createrole.html).

The default createrole_self_grant setting was empty. PostgreSQL granted the creator membership in the runtime role with ADMIN true, INHERIT false and SET false. The runtime role had no memberships. The grants helper correctly accepts this direction of membership. The creator could alter the runtime role, but could not SET ROLE to it without another membership grant. PostgreSQL documents the automatic ADMIN grant and the optional inheritance and SET behavior in [client connection defaults](https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-CREATEROLE-SELF-GRANT).

The public schema owner was pg_database_owner. The non-superuser database owner ran both migrations, applied grants to all 13 app tables, and removed database and schema PUBLIC privileges. The runtime then passed schema verification and actual table INSERT, SELECT, UPDATE and DELETE operations. CREATE TABLE, CREATE TEMP TABLE, migration ledger UPDATE and SET ROLE to the owner all failed with 42501. Twenty runtime connections succeeded; connection 21 failed with 53300.

The production preflight must confirm actual database, schema and app table ownership. These tests cover the ordinary dedicated database whose public schema belongs to pg_database_owner. A hosted database with another schema or table owner needs the appropriate owner to apply the grants. Keep the creator membership directed toward the runtime role; never add the runtime role to the creator role. NOINHERIT alone does not prevent SET ROLE when a membership allows SET.

Evidence: non-super-role-rehearsal.json. Reproduction: node /tmp/queue-arcade-launch-checks/non-super-role-rehearsal.mjs. The script reads only the disposable PostgreSQL 17 fixture and asserts its loopback address and port before connecting.
