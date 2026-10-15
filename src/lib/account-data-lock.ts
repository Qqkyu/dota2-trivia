import { AsyncLocalStorage } from "node:async_hooks";

const globalLocks = globalThis as typeof globalThis & {
  __queueArcadeAccountLocks?: {
    queues: Map<string, Promise<void>>;
    held: AsyncLocalStorage<ReadonlySet<string>>;
  };
};
const locks = (globalLocks.__queueArcadeAccountLocks ??= {
  queues: new Map<string, Promise<void>>(),
  held: new AsyncLocalStorage<ReadonlySet<string>>(),
});
const { queues, held: heldLocks } = locks;

/** Coordinates account deletion and its writes in the single-process file store. */
export async function withAccountDataLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const held = heldLocks.getStore();
  if (held?.has(userId)) return operation();
  const previous = queues.get(userId) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(() => heldLocks.run(new Set([...(held ?? []), userId]), operation));
  const settled = task.then(
    () => undefined,
    () => undefined,
  );
  queues.set(userId, settled);
  try {
    return await task;
  } finally {
    if (queues.get(userId) === settled) queues.delete(userId);
  }
}
