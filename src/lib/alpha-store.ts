import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ALPHA_SESSION_RETENTION_DAYS, isAlphaFeedback } from "@/lib/alpha-analytics.mjs";
import { anonymousVoterHash } from "@/lib/voter-hash";

export type AlphaFeedback = "fun" | "too-easy" | "repetitive" | "confusing";

export interface AlphaSessionIdentity {
  sessionId: string;
  voterId: string;
}

export interface StoredAlphaSession {
  sessionHash: string;
  visitorHash: string;
  startedAt: number;
  lastSeenAt: number;
  finishedAt: number | null;
  roundsAnswered: number;
  correctAnswers: number;
  feedback: AlphaFeedback | null;
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
    typeof candidate.correctAnswers === "number" &&
    (candidate.feedback === null || isAlphaFeedback(candidate.feedback))
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

function hashesFor(identity: AlphaSessionIdentity) {
  return {
    sessionHash: anonymousVoterHash("alpha-session", `${identity.voterId}:${identity.sessionId}`),
    visitorHash: anonymousVoterHash("alpha-visitor", identity.voterId),
  };
}

function newSession(identity: AlphaSessionIdentity, at: number): StoredAlphaSession {
  const hashes = hashesFor(identity);
  return {
    ...hashes,
    startedAt: at,
    lastSeenAt: at,
    finishedAt: null,
    roundsAnswered: 0,
    correctAnswers: 0,
    feedback: null,
  };
}

async function persist(state: AlphaFileState) {
  const directory = path.dirname(runtime.filePath);
  const temporaryPath = `${runtime.filePath}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, runtime.filePath);
}

async function mutate<T>(operation: (state: AlphaFileState) => T) {
  const task = runtime.writeQueue
    .catch(() => undefined)
    .then(async () => {
      const state = await stateForRuntime();
      const result = operation(state);
      const expiresBefore = Date.now() - configuredRetentionDays() * 24 * 60 * 60 * 1_000;
      for (const [sessionHash, session] of Object.entries(state.sessions)) {
        if (session.lastSeenAt < expiresBefore) delete state.sessions[sessionHash];
      }
      await persist(state);
      return result;
    });
  runtime.writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function fileRecordStart(identity: AlphaSessionIdentity, at: number) {
  return mutate((state) => {
    const { sessionHash, visitorHash } = hashesFor(identity);
    const session = state.sessions[sessionHash] ?? newSession(identity, at);
    if (session.visitorHash !== visitorHash) throw new Error("Alpha session identity mismatch.");
    session.startedAt = Math.min(session.startedAt, at);
    session.lastSeenAt = Math.max(session.lastSeenAt, at);
    state.sessions[sessionHash] = session;
    return { ...session };
  });
}

async function fileRecordRound(identity: AlphaSessionIdentity, correct: boolean, at: number) {
  return mutate((state) => {
    const { sessionHash, visitorHash } = hashesFor(identity);
    const session = state.sessions[sessionHash] ?? newSession(identity, at);
    if (session.visitorHash !== visitorHash) throw new Error("Alpha session identity mismatch.");
    session.lastSeenAt = Math.max(session.lastSeenAt, at);
    session.roundsAnswered += 1;
    session.correctAnswers += Number(correct);
    state.sessions[sessionHash] = session;
    return { ...session };
  });
}

async function fileRecordFinish(identity: AlphaSessionIdentity, at: number) {
  return mutate((state) => {
    const { sessionHash, visitorHash } = hashesFor(identity);
    const session = state.sessions[sessionHash] ?? newSession(identity, at);
    if (session.visitorHash !== visitorHash) throw new Error("Alpha session identity mismatch.");
    session.lastSeenAt = Math.max(session.lastSeenAt, at);
    session.finishedAt = Math.max(session.finishedAt ?? 0, at);
    state.sessions[sessionHash] = session;
    return { ...session };
  });
}

async function fileRecordFeedback(identity: AlphaSessionIdentity, feedback: AlphaFeedback, at: number) {
  return mutate((state) => {
    const { sessionHash, visitorHash } = hashesFor(identity);
    const session = state.sessions[sessionHash] ?? newSession(identity, at);
    if (session.visitorHash !== visitorHash) throw new Error("Alpha session identity mismatch.");
    session.lastSeenAt = Math.max(session.lastSeenAt, at);
    session.feedback = feedback;
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
  return { backend: "file", ok: true, retentionDays: configuredRetentionDays() };
}

export async function recordAlphaSessionStart(identity: AlphaSessionIdentity, at: number) {
  if (usesPostgres()) return (await postgresStore()).recordAlphaSessionStart(identity, at);
  return fileRecordStart(identity, at);
}

export async function recordAlphaSessionRound(identity: AlphaSessionIdentity, correct: boolean, at: number) {
  if (usesPostgres()) return (await postgresStore()).recordAlphaSessionRound(identity, correct, at);
  return fileRecordRound(identity, correct, at);
}

export async function recordAlphaSessionFinish(identity: AlphaSessionIdentity, at: number) {
  if (usesPostgres()) return (await postgresStore()).recordAlphaSessionFinish(identity, at);
  return fileRecordFinish(identity, at);
}

export async function recordAlphaSessionFeedback(identity: AlphaSessionIdentity, feedback: AlphaFeedback, at: number) {
  if (usesPostgres()) return (await postgresStore()).recordAlphaSessionFeedback(identity, feedback, at);
  return fileRecordFeedback(identity, feedback, at);
}

export async function getAlphaSessionsSince(since: number): Promise<StoredAlphaSession[]> {
  if (usesPostgres()) return (await postgresStore()).getAlphaSessionsSince(since);
  return fileSessionsSince(since);
}

export async function deleteAlphaVisitor(voterId: string) {
  if (usesPostgres()) return (await postgresStore()).deleteAlphaVisitor(voterId);
  return fileDeleteVisitor(voterId);
}
