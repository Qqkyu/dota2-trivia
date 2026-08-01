import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AccountProfile, AccountUser, PlayerRoundRecord } from "@/lib/account-contract";
import type { GameId } from "@/lib/game-catalogs";
import { summarizePlayerRounds } from "@/lib/player-profile.mjs";

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
  rounds: Record<string, PlayerRoundRecord & { userId: string }>;
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
  const directory = path.dirname(runtime.filePath);
  const temporaryPath = `${runtime.filePath}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, runtime.filePath);
}

async function mutate<T>(operation: (state: AccountState) => T) {
  const task = runtime.writeQueue
    .catch(() => undefined)
    .then(async () => {
      const state = await stateForRuntime();
      const result = operation(state);
      const now = Date.now();
      for (const [tokenHash, session] of Object.entries(state.sessions)) {
        if (session.expiresAt <= now) delete state.sessions[tokenHash];
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

async function fileRecordPlayerRound(userId: string, round: PlayerRoundRecord) {
  return mutate((state) => {
    if (!state.users[userId]) throw new Error("Cannot record a result for an unknown Queue Arcade user.");
    const key = playerRoundKey(userId, round.roundId);
    state.rounds[key] ??= { ...round, userId };
  });
}

async function fileGetAccountProfile(userId: string, gameId: GameId): Promise<AccountProfile | null> {
  await runtime.writeQueue;
  const state = await stateForRuntime();
  const user = state.users[userId];
  if (!user) return null;
  const rounds = Object.values(state.rounds).filter((round) => round.userId === userId && round.gameId === gameId);
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
  if (usesPostgres()) return (await postgresStore()).deleteAccount(userId);
  return fileDeleteAccount(userId);
}

export async function recordPlayerRound(userId: string, round: PlayerRoundRecord) {
  if (usesPostgres()) return (await postgresStore()).recordPlayerRound(userId, round);
  return fileRecordPlayerRound(userId, round);
}

export async function getAccountProfile(userId: string, gameId: GameId) {
  if (usesPostgres()) return (await postgresStore()).getAccountProfile(userId, gameId);
  return fileGetAccountProfile(userId, gameId);
}
