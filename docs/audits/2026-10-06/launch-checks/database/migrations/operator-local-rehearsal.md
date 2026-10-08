# Private operator transition rehearsal

All three cases passed on the isolated local PostgreSQL 17 server. No remote database call was made. Each case used a new disposable database and a nonsuperuser owner with LOGIN, CREATEDB, and CREATEROLE. The supplied private export was restored with PostgreSQL 17 tools. Only schema metadata, row counts, and hashes enter the evidence.

The successful transition preserved all 58 original rows across ten tables, applied migrations 1 and 2, and added two migration-ledger rows. The final schema has 13 tables. The new runtime role authenticated successfully. Its verification transaction was read-only, and it had no schema/database CREATE, temporary-table, or ledger-write rights. The helper renamed its pending credential file to the verified file only after those checks. Both the private output directory and credential file had the required permissions, 0700 and 0600.

The data-mismatch case changed one value in its local restored copy. The helper rejected the changed hash with `BEFORE_DATA_MISMATCH`. It left that copy unchanged, created no migration ledger or runtime role, and published no verified credential.

The late-failure case used a local event trigger that rejected a GRANT only after the runtime role existed. The helper had already applied both migrations and verified the original hashes when the trigger failed. PostgreSQL rolled back the new schema, grants, and role. All old table hashes and the database, schema, and table access lists matched their pre-call values. No verified credential was published.

Each case removed its copied database, nonsuperuser owner, and newly created runtime role. The fixed runtime role name was absent before the test. Cleanup dropped it only after checking its recorded OID and the test owner's role-creation membership. Generated pending and verified credential files were removed after their checks. The original private export remains in its protected input location.

`operator-local-rehearsal.json` records the safe results, reference-file SHA-256, and private helper SHA-256. The executable rehearsal and private restore diagnostics remain under `/tmp/queue-arcade-launch-checks/`. These checks validate the helper against local PostgreSQL 17. They do not perform or authorize the remote transition.
