import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { checkFileStoreWritable, CommittedFileWriteError, writeJsonAtomically } from "@/lib/atomic-json-file";
import path from "node:path";
import type { AccountProfile, AccountUser, StoredPlayerRoundRecord } from "@/lib/account-contract";
import type { GameId } from "@/lib/game-identity";
import { summarizePlayerRounds } from "@/lib/player-profile.mjs";
import { withAccountDataLock } from "@/lib/account-data-lock";

export interface SteamIdentityInput {
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  authenticatedAt: number;
}

export interface AccountSessionInput {
  tokenHash: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface AccountStoreHealth {
  backend: "file" | "postgres";
  ok: true;
}

interface StoredUser extends AccountUser {
  updatedAt: number;
}

interface StoredSession {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

interface AccountState {
  version: 1;
  users: Record<string, StoredUser>;
  identities: Record<string, string>;
  sessions: Record<string, StoredSession>;
  rounds: Record<string, StoredPlayerRoundRecord & { userId: string }>;
  consumedNonces?: Record<string, number>;
}

interface RuntimeAccountStore {
  filePath: string;
  statePromise: Promise<AccountState> | null;
  writeQueue: Promise<void>;
}

const globalAccountStore = globalThis as typeof globalThis & {
  __queueArcadeAccounts?: RuntimeAccountStore;
};

function configuredFilePath() {
  const configured = process.env.ARCADE_ACCOUNT_DATA_FILE?.trim();
  if (configured && path.isAbsolute(configured)) return configured;
  return path.join(/* turbopackIgnore: true */ process.cwd(), configured || ".data/queue-arcade-accounts.json");
}

const runtime =
  globalAccountStore.__queueArcadeAccounts ??
  ({
    filePath: configuredFilePath(),
    statePromise: null,
    writeQueue: Promise.resolve(),
  } satisfies RuntimeAccountStore);

globalAccountStore.__queueArcadeAccounts = runtime;

function emptyState(): AccountState {
  return { version: 1, users: {}, identities: {}, sessions: {}, rounds: {} };
}

function validState(value: unknown): value is AccountState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AccountState>;
  return (
    candidate.version === 1 &&
    Boolean(candidate.users) &&
    Boolean(candidate.identities) &&
    Boolean(candidate.sessions) &&
    Boolean(candidate.rounds)
  );
}

async function loadState() {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ runtime.filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!validState(parsed)) throw new Error("Unsupported persistent account format.");
    return parsed;
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

async function persist(state: AccountState) {
  await writeJsonAtomically(runtime.filePath, state);
}

async function mutate<T>(operation: (state: AccountState) => T) {
  const task = runtime.writeQueue
    .catch(() => undefined)
    .then(async () => {
      const state = structuredClone(await stateForRuntime());
      const result = operation(state);
      const now = Date.now();
      for (const [tokenHash, session] of Object.entries(state.sessions)) {
        if (session.expiresAt <= now) delete state.sessions[tokenHash];
      }
      for (const [hash, expiresAt] of Object.entries(state.consumedNonces ?? {})) {
        if (expiresAt <= now) delete state.consumedNonces?.[hash];
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

function identityKey(steamId: string) {
  return `steam:${steamId}`;
}

function playerRoundKey(userId: string, roundId: string) {
  return `${userId}:${roundId}`;
}

function publicUser(user: StoredUser): AccountUser {
  return {
    id: user.id,
    steamId: user.steamId,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    profileUrl: user.profileUrl,
    createdAt: user.createdAt,
  };
}

async function fileUpsertSteamUser(input: SteamIdentityInput) {
  return mutate((state) => {
    const key = identityKey(input.steamId);
    const existingUserId = state.identities[key];
    const userId = existingUserId ?? `usr_${randomBytes(18).toString("base64url")}`;
    const existing = state.users[userId];
    const user: StoredUser = {
      id: userId,
      steamId: input.steamId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      profileUrl: input.profileUrl,
      createdAt: existing?.createdAt ?? input.authenticatedAt,
      updatedAt: input.authenticatedAt,
    };
    state.users[userId] = user;
    state.identities[key] = userId;
    return publicUser(user);
  });
}

async function fileCreateAccountSession(input: AccountSessionInput) {
  return mutate((state) => {
    if (!state.users[input.userId]) throw new Error("Cannot create a session for an unknown Queue Arcade user.");
    state.sessions[input.tokenHash] = {
      userId: input.userId,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    };
  });
}

async function fileGetUserBySession(tokenHash: string, now: number) {
  await runtime.writeQueue;
  const state = await stateForRuntime();
  const session = state.sessions[tokenHash];
  if (!session || session.expiresAt <= now) return null;
  const user = state.users[session.userId];
  return user ? publicUser(user) : null;
}

async function fileDeleteAccountSession(tokenHash: string) {
  return mutate((state) => {
    delete state.sessions[tokenHash];
  });
}

async function fileDeleteAccount(userId: string) {
  return mutate((state) => {
    const user = state.users[userId];
    if (!user) return;
    delete state.identities[identityKey(user.steamId)];
    delete state.users[userId];
    for (const [tokenHash, session] of Object.entries(state.sessions)) {
      if (session.userId === userId) delete state.sessions[tokenHash];
    }
    for (const [key, round] of Object.entries(state.rounds)) {
      if (round.userId === userId) delete state.rounds[key];
    }
  });
}

async function fileRecordPlayerRound(userId: string, round: StoredPlayerRoundRecord) {
  return mutate((state) => {
    if (!state.users[userId]) throw new Error("Cannot record a result for an unknown Queue Arcade user.");
    const key = playerRoundKey(userId, round.roundId);
    state.rounds[key] ??= { ...round, userId };
  });
}

async function fileGetAccountProfile(userId: string, gameId: GameId, now: number): Promise<AccountProfile | null> {
  await runtime.writeQueue;
  const state = await stateForRuntime();
  const user = state.users[userId];
  if (!user) return null;
  const rounds = Object.values(state.rounds).filter(
    (round) => round.userId === userId && round.gameId === gameId && (round.revealAt ?? 0) <= now,
  );
  return {
    user: publicUser(user),
    stats: summarizePlayerRounds(rounds) as AccountProfile["stats"],
  };
}

type PostgresAccountStore = typeof import("@/lib/account-store-postgres");
let postgresStorePromise: Promise<PostgresAccountStore> | null = null;

function usesPostgres() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function postgresStore() {
  postgresStorePromise ??= import("@/lib/account-store-postgres");
  return postgresStorePromise;
}

export async function getAccountStoreHealth(): Promise<AccountStoreHealth> {
  if (usesPostgres()) return (await postgresStore()).getPostgresAccountStoreHealth();
  await runtime.writeQueue;
  await stateForRuntime();
  await checkFileStoreWritable(runtime.filePath);
  return { backend: "file", ok: true };
}

export async function upsertSteamUser(input: SteamIdentityInput) {
  if (usesPostgres()) return (await postgresStore()).upsertSteamUser(input);
  return fileUpsertSteamUser(input);
}

export async function createAccountSession(input: AccountSessionInput) {
  if (usesPostgres()) return (await postgresStore()).createAccountSession(input);
  return fileCreateAccountSession(input);
}

export async function getUserBySession(tokenHash: string, now = Date.now()) {
  if (usesPostgres()) return (await postgresStore()).getUserBySession(tokenHash, now);
  return fileGetUserBySession(tokenHash, now);
}

export async function deleteAccountSession(tokenHash: string) {
  if (usesPostgres()) return (await postgresStore()).deleteAccountSession(tokenHash);
  return fileDeleteAccountSession(tokenHash);
}

export async function deleteAccount(userId: string) {
  return deleteAccountData(userId);
}

export async function accountExists(userId: string) {
  if (usesPostgres()) return (await postgresStore()).accountExists(userId);
  await runtime.writeQueue;
  return Boolean((await stateForRuntime()).users[userId]);
}

export async function withExistingAccount<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  if (usesPostgres()) return (await postgresStore()).withExistingAccount(userId, operation);
  return withAccountDataLock(userId, async () => {
    if (!(await accountExists(userId))) throw new Error("Queue Arcade account no longer exists.");
    return operation();
  });
}

export async function deleteAccountData(userId: string) {
  const { deleteAlphaVisitor } = await import("@/lib/alpha-store");
  if (usesPostgres()) {
    const { databaseTransaction } = await import("@/lib/database-client");
    return databaseTransaction(async () => {
      const store = await postgresStore();
      if (!(await store.accountExists(userId))) return;
      return store.withExistingAccount(userId, async () => {
        await deleteAlphaVisitor(`account:${userId}`);
        await store.deleteAccount(userId);
      });
    });
  }
  return withAccountDataLock(userId, async () => {
    const { deleteAccountPendingOutcomes } = await import("@/lib/vote-store");
    await deleteAccountPendingOutcomes(userId);
    await deleteAlphaVisitor(`account:${userId}`);
    await fileDeleteAccount(userId);
  });
}

export async function updateSteamUser(userId: string, input: SteamIdentityInput): Promise<AccountUser | null> {
  if (usesPostgres()) return (await postgresStore()).updateSteamUser(userId, input);
  return withAccountDataLock(userId, () =>
    mutate((state) => {
      const user = state.users[userId];
      if (!user || user.steamId !== input.steamId) return null;
      user.displayName = input.displayName;
      user.avatarUrl = input.avatarUrl;
      user.profileUrl = input.profileUrl;
      user.updatedAt = input.authenticatedAt;
      return publicUser(user);
    }),
  );
}

export async function cleanupAccountStore() {
  if (usesPostgres()) return;
  await mutate(() => undefined);
}

export async function consumeSteamLoginNonce(nonceHash: string, expiresAt: number): Promise<boolean> {
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  if (usesPostgres()) return (await postgresStore()).consumeSteamLoginNonce(nonceHash, expiresAt);
  return mutate((state) => {
    state.consumedNonces ??= {};
    if ((state.consumedNonces[nonceHash] ?? 0) > Date.now()) return false;
    state.consumedNonces[nonceHash] = expiresAt;
    return true;
  });
}

export async function recordPlayerRound(userId: string, round: StoredPlayerRoundRecord) {
  if (usesPostgres()) return (await postgresStore()).recordPlayerRound(userId, round);
  return fileRecordPlayerRound(userId, round);
}

export async function getAccountProfile(userId: string, gameId: GameId, now = Date.now()) {
  if (usesPostgres()) return (await postgresStore()).getAccountProfile(userId, gameId, now);
  return fileGetAccountProfile(userId, gameId, now);
}
