import { cleanupAccountStore } from "@/lib/account-store";
import { cleanupAlphaStore } from "@/lib/alpha-store";
import { cleanupVoteStore } from "@/lib/vote-store";
import { logServerError } from "@/lib/server-diagnostics";

const globalMaintenance = globalThis as typeof globalThis & {
  __queueArcadeMaintenanceTimer?: ReturnType<typeof setInterval>;
  __queueArcadeMaintenanceTask?: Promise<void>;
  __queueArcadeMaintenanceStatus?: {
    lastAttemptAt: number | null;
    lastSucceededAt: number | null;
    lastFailedAt: number | null;
  };
};

export function getStoreMaintenanceStatus() {
  return {
    ...(globalMaintenance.__queueArcadeMaintenanceStatus ?? {
      lastAttemptAt: null,
      lastSucceededAt: null,
      lastFailedAt: null,
    }),
  };
}

async function cleanupStores() {
  if (process.env.DATABASE_URL?.trim()) {
    const { databasePool } = await import("@/lib/database-client");
    const { cleanupDatabase, ensureDatabaseSchema } = await import("@/lib/database-schema.mjs");
    const sql = databasePool();
    await ensureDatabaseSchema(sql);
    await cleanupDatabase(sql);
  } else {
    const results = await Promise.allSettled([cleanupVoteStore(), cleanupAccountStore(), cleanupAlphaStore()]);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Store maintenance failed.",
      );
  }
}

export async function runStoreMaintenance() {
  const status = (globalMaintenance.__queueArcadeMaintenanceStatus ??= {
    lastAttemptAt: null,
    lastSucceededAt: null,
    lastFailedAt: null,
  });
  status.lastAttemptAt = Date.now();
  try {
    await cleanupStores();
    status.lastSucceededAt = Date.now();
  } catch (error) {
    status.lastFailedAt = Date.now();
    throw error;
  }
}

export function startStoreMaintenance() {
  if (globalMaintenance.__queueArcadeMaintenanceTimer) return;
  const run = () => {
    globalMaintenance.__queueArcadeMaintenanceTask ??= runStoreMaintenance()
      .catch((error) => {
        logServerError("storage.maintenance", error);
      })
      .finally(() => {
        globalMaintenance.__queueArcadeMaintenanceTask = undefined;
      });
  };
  run();
  const timer = setInterval(run, 60_000);
  timer.unref();
  globalMaintenance.__queueArcadeMaintenanceTimer = timer;
}
