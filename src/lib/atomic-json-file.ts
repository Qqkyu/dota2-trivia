import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Rename committed the new file, but its durability could not be confirmed. */
export class CommittedFileWriteError extends Error {
  constructor(cause: unknown) {
    super("The store file was replaced, but its directory could not be synchronized.", { cause });
    this.name = "CommittedFileWriteError";
  }
}

export async function writeJsonAtomically(filePath: string, state: unknown) {
  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true });
  let renamed = false;
  try {
    const file = await open(temporaryPath, "w", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(state)}\n`, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, filePath);
    renamed = true;
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    if (renamed) throw new CommittedFileWriteError(error);
    throw error;
  }
}

/** Checks the same directory, write, sync, and rename operations used by the store. */
export async function checkFileStoreWritable(filePath: string) {
  const probe = path.join(path.dirname(filePath), `.queue-arcade-health-${process.pid}-${randomUUID()}`);
  try {
    await writeJsonAtomically(probe, { ok: true });
  } finally {
    await unlink(probe).catch(() => undefined);
    await unlink(`${probe}.${process.pid}.tmp`).catch(() => undefined);
  }
}
