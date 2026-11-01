import { readFile } from "node:fs/promises";
import { checkFileStoreWritable, CommittedFileWriteError, writeJsonAtomically } from "@/lib/atomic-json-file";
import path from "node:path";
import { ALPHA_SESSION_RETENTION_DAYS, summarizeAlphaSessions } from "@/lib/alpha-analytics.mjs";
import { withExistingAccount } from "@/lib/account-store";
import { anonymousVoterHash } from "@/lib/voter-hash";

export interface AlphaSessionIdentity {
  sessionId: string;
  voterId: string;
}

export interface AlphaSessionKey {
  sessionHash: string;
  visitorHash: string;
  userId: string | null;
}

export type AlphaIdentity = AlphaSessionIdentity | AlphaSessionKey;

export interface StoredAlphaSession {
  sessionHash: string;
  visitorHash: string;
  startedAt: number;
  lastSeenAt: number;
  finishedAt: number | null;
  roundsAnswered: number;
  correctAnswers: number;
  roundIds?: string[];
}

interface AlphaFileState {
  version: 1;
  sessions: Record<string, StoredAlphaSession>;
}

interface RuntimeAlphaStore {
  filePath: string;
  statePromise: Promise<AlphaFileState> | null;
  writeQueue: Promise<void>;
}

export interface AlphaStoreHealth {
  backend: "file" | "postgres";
  ok: true;
  retentionDays: number;
}

const globalAlphaStore = globalThis as typeof globalThis & {
  __queueArcadeAlphaStore?: RuntimeAlphaStore;
};

function configuredRetentionDays() {
  return ALPHA_SESSION_RETENTION_DAYS;
}

function configuredFilePath() {
  const configured = process.env.ARCADE_ALPHA_DATA_FILE?.trim();
  if (configured && path.isAbsolute(configured)) return configured;
  return path.join(/* turbopackIgnore: true */ process.cwd(), configured || ".data/queue-arcade-alpha.json");
}

const runtime =
  globalAlphaStore.__queueArcadeAlphaStore ??
  ({
    filePath: configuredFilePath(),
    statePromise: null,
    writeQueue: Promise.resolve(),
  } satisfies RuntimeAlphaStore);

globalAlphaStore.__queueArcadeAlphaStore = runtime;

function emptyState(): AlphaFileState {
  return { version: 1, sessions: {} };
}

function isStoredAlphaSession(value: unknown): value is StoredAlphaSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredAlphaSession>;
  return (
    typeof candidate.sessionHash === "string" &&
    typeof candidate.visitorHash === "string" &&
    typeof candidate.startedAt === "number" &&
    typeof candidate.lastSeenAt === "number" &&
    (candidate.finishedAt === null || typeof candidate.finishedAt === "number") &&
    typeof candidate.roundsAnswered === "number" &&
    typeof candidate.correctAnswers === "number"
  );
}

async function loadState(): Promise<AlphaFileState> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ runtime.filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("Unsupported alpha session format.");
    const candidate = parsed as Partial<AlphaFileState>;
    if (candidate.version !== 1 || !candidate.sessions || typeof candidate.sessions !== "object") {
      throw new Error("Unsupported alpha session format.");
    }
    return {
      version: 1,
      sessions: Object.fromEntries(
        Object.entries(candidate.sessions).filter((entry): entry is [string, StoredAlphaSession] =>
          isStoredAlphaSession(entry[1]),
        ),
      ),
    };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "ENOENT") return emptyState();
    throw error;
  }
}

function stateForRuntime() {
  runtime.statePromise ??= loadState();
  return runtime.statePromise;
}

/**
 * Each visit counts on its own. Its key comes from the random visit ID the page makes
 * in memory, never from the player ID the browser stores: EU rules require consent for
 * analytics that read a stored identifier, and the game needs that ID only to play.
 * So visits are not linked to each other or to an account.
 */
export function alphaSessionKey(identity: AlphaIdentity): AlphaSessionKey {
  if ("sessionHash" in identity) return identity;
  const sessionHash = anonymousVoterHash("alpha-session", identity.sessionId);
  return { userId: null, sessionHash, visitorHash: sessionHash };
}

function newSession(identity: AlphaIdentity, at: number): StoredAlphaSession {
  const { sessionHash, visitorHash } = alphaSessionKey(identity);
  return {
    sessionHash,
    visitorHash,
    startedAt: at,
    lastSeenAt: at,
    finishedAt: null,
    roundsAnswered: 0,
    correctAnswers: 0,
  };
}

async function persist(state: AlphaFileState) {
  await writeJsonAtomically(runtime.filePath, state);
}

async function mutate<T>(operation: (state: AlphaFileState) => T) {
  const task = runtime.writeQueue
    .catch(() => undefined)
    .then(async () => {
      const state = structuredClone(await stateForRuntime());
      const result = operation(state);
      const expiresBefore = Date.now() - configuredRetentionDays() * 24 * 60 * 60 * 1_000;
      for (const [sessionHash, session] of Object.entries(state.sessions)) {
        if (session.lastSeenAt < expiresBefore) delete state.sessions[sessionHash];
      }
      try {
        await persist(state);
      } catch (error) {
        // A completed rename is already visible to readers and must also be visible in memory.
        if (error instanceof CommittedFileWriteError) runtime.statePromise = Promise.resolve(state);
        throw error;
      }
      runtime.statePromise = Promise.resolve(state);
      return result;
    });
  runtime.writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function fileRecordStart(identity: AlphaIdentity, at: number) {
  return mutate((state) => {
    const { sessionHash, visitorHash } = alphaSessionKey(identity);
    const session = state.sessions[sessionHash] ?? newSession(identity, at);
    if (session.visitorHash !== visitorHash) throw new Error("Alpha session identity mismatch.");
    session.startedAt = Math.min(session.startedAt, at);
    session.lastSeenAt = Math.max(session.lastSeenAt, at);
    state.sessions[sessionHash] = session;
    return { ...session };
  });
}

async function fileRecordRound(identity: AlphaIdentity, correct: boolean, at: number, roundId?: string) {
  return mutate((state) => {
    const { sessionHash, visitorHash } = alphaSessionKey(identity);
    const session = state.sessions[sessionHash] ?? newSession(identity, at);
    if (session.visitorHash !== visitorHash) throw new Error("Alpha session identity mismatch.");
    if (roundId && session.roundIds?.includes(roundId)) return { ...session };
    if (roundId) session.roundIds = [...(session.roundIds ?? []), roundId];
    session.lastSeenAt = Math.max(session.lastSeenAt, at);
    session.roundsAnswered += 1;
    session.correctAnswers += Number(correct);
    state.sessions[sessionHash] = session;
    return { ...session };
  });
}

async function fileRecordFinish(identity: AlphaIdentity, at: number) {
  return mutate((state) => {
    const { sessionHash, visitorHash } = alphaSessionKey(identity);
    const session = state.sessions[sessionHash] ?? newSession(identity, at);
    if (session.visitorHash !== visitorHash) throw new Error("Alpha session identity mismatch.");
    session.lastSeenAt = Math.max(session.lastSeenAt, at);
    session.finishedAt = Math.max(session.finishedAt ?? 0, at);
    state.sessions[sessionHash] = session;
    return { ...session };
  });
}

async function fileSessionsSince(since: number) {
  await runtime.writeQueue;
  const state = await stateForRuntime();
  return Object.values(state.sessions)
    .filter((session) => session.startedAt >= since)
    .map((session) => ({ ...session }));
}

async function fileDeleteVisitor(voterId: string) {
  return mutate((state) => {
    const visitorHash = anonymousVoterHash("alpha-visitor", voterId);
    let deleted = 0;
    for (const [sessionHash, session] of Object.entries(state.sessions)) {
      if (session.visitorHash !== visitorHash) continue;
      delete state.sessions[sessionHash];
      deleted += 1;
    }
    return deleted;
  });
}

type PostgresAlphaStore = typeof import("@/lib/alpha-store-postgres");
let postgresStorePromise: Promise<PostgresAlphaStore> | null = null;

function usesPostgres() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function postgresStore() {
  postgresStorePromise ??= import("@/lib/alpha-store-postgres");
  return postgresStorePromise;
}

export async function getAlphaStoreHealth(): Promise<AlphaStoreHealth> {
  if (usesPostgres()) return (await postgresStore()).getPostgresAlphaStoreHealth();
  await runtime.writeQueue;
  await stateForRuntime();
  await checkFileStoreWritable(runtime.filePath);
  return { backend: "file", ok: true, retentionDays: configuredRetentionDays() };
}

export async function recordAlphaSessionStart(identity: AlphaIdentity, at: number) {
  return withSessionOwner(identity, async () => {
    if (usesPostgres()) return (await postgresStore()).recordAlphaSessionStart(identity, at);
    return fileRecordStart(identity, at);
  });
}

export async function recordAlphaSessionRound(identity: AlphaIdentity, correct: boolean, at: number, roundId?: string) {
  return withSessionOwner(identity, async () => {
    if (usesPostgres()) return (await postgresStore()).recordAlphaSessionRound(identity, correct, at, roundId);
    return fileRecordRound(identity, correct, at, roundId);
  });
}

export async function recordAlphaSessionFinish(identity: AlphaIdentity, at: number) {
  return withSessionOwner(identity, async () => {
    if (usesPostgres()) return (await postgresStore()).recordAlphaSessionFinish(identity, at);
    return fileRecordFinish(identity, at);
  });
}

async function withSessionOwner<T>(identity: AlphaIdentity, operation: () => Promise<T>) {
  const { userId } = alphaSessionKey(identity);
  return userId ? withExistingAccount(userId, operation) : operation();
}

export async function getAlphaSummary(now = Date.now()) {
  if (usesPostgres()) return (await postgresStore()).getAlphaSummary(now);
  const sessions = await fileSessionsSince(now - ALPHA_SESSION_RETENTION_DAYS * 86_400_000);
  return summarizeAlphaSessions(sessions, { now, windowDays: ALPHA_SESSION_RETENTION_DAYS, dailyDays: 14 });
}

export async function cleanupAlphaStore() {
  if (usesPostgres()) return;
  await mutate(() => undefined);
}

export async function getAlphaSessionsSince(since: number): Promise<StoredAlphaSession[]> {
  if (usesPostgres()) return (await postgresStore()).getAlphaSessionsSince(since);
  return fileSessionsSince(since);
}

export async function deleteAlphaVisitor(voterId: string) {
  if (usesPostgres()) return (await postgresStore()).deleteAlphaVisitor(voterId);
  return fileDeleteVisitor(voterId);
}
