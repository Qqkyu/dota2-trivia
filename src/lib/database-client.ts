import { AsyncLocalStorage } from "node:async_hooks";
import postgres, { type Sql } from "postgres";
import { ensureDatabaseSchema } from "@/lib/database-schema.mjs";

const globalDatabase = globalThis as typeof globalThis & {
  __queueArcadePostgres?: Sql;
  __queueArcadeTransactions?: AsyncLocalStorage<Sql>;
};
const transactions = (globalDatabase.__queueArcadeTransactions ??= new AsyncLocalStorage<Sql>());

export function databasePool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL storage.");
  const configuredMax = Number(process.env.DATABASE_POOL_SIZE ?? 5);
  const max = Number.isInteger(configuredMax) && configuredMax > 0 ? configuredMax : 5;
  globalDatabase.__queueArcadePostgres ??= postgres(connectionString, {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    connection: { statement_timeout: 10_000, lock_timeout: 5_000 },
  });
  return globalDatabase.__queueArcadePostgres;
}

export function configuredPostgres() {
  return transactions.getStore() ?? databasePool();
}

export async function databaseTransaction<T>(operation: (sql: Sql) => Promise<T>): Promise<T> {
  const current = transactions.getStore();
  if (current) return operation(current);
  const pool = databasePool();
  await ensureDatabaseSchema(pool);
  return pool.begin((transaction) => {
    const sql = transaction as unknown as Sql;
    return transactions.run(sql, () => operation(sql));
  }) as Promise<T>;
}
