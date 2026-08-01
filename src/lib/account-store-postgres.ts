import { randomUUID } from "node:crypto";
import type { AccountProfile, AccountUser, PlayerRoundRecord } from "@/lib/account-contract";
import type { AccountSessionInput, AccountStoreHealth, SteamIdentityInput } from "@/lib/account-store";
import type { GameId } from "@/lib/game-catalogs";
import { summarizePlayerRounds } from "@/lib/player-profile.mjs";
import { configuredPostgres } from "@/lib/vote-store-postgres";

interface UserRow {
  id: string;
  steam_id: string;
  display_name: string;
  avatar_url: string | null;
  profile_url: string;
  created_at: number | string;
}

interface PlayerRoundRow {
  round_id: string;
  round_number: number | string;
  game_id: string;
  question_id: string;
  question_revision: string;
  round_game: PlayerRoundRecord["roundGame"];
  round_format: string;
  correct: boolean;
  answer_stage: 1 | 2 | 3 | null;
  submitted_at: number | string;
}

const globalAccountPostgres = globalThis as typeof globalThis & {
  __queueArcadeAccountSchema?: Promise<void>;
};

async function ensureAccountSchema() {
  if (globalAccountPostgres.__queueArcadeAccountSchema) return globalAccountPostgres.__queueArcadeAccountSchema;
  const schemaPromise = (async () => {
    const sql = configuredPostgres();
    await sql.begin(async (transaction) => {
      await transaction`
        CREATE TABLE IF NOT EXISTS queue_arcade_users (
          id TEXT PRIMARY KEY,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS queue_arcade_user_identities (
          provider TEXT NOT NULL,
          provider_user_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES queue_arcade_users(id) ON DELETE CASCADE,
          display_name TEXT NOT NULL,
          avatar_url TEXT,
          profile_url TEXT NOT NULL,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (provider, provider_user_id),
          UNIQUE (user_id, provider)
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS queue_arcade_user_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES queue_arcade_users(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL,
          expires_at BIGINT NOT NULL
        )
      `;
      await transaction`
        CREATE INDEX IF NOT EXISTS queue_arcade_user_sessions_expires_at_idx
        ON queue_arcade_user_sessions(expires_at)
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS queue_arcade_player_rounds (
          user_id TEXT NOT NULL REFERENCES queue_arcade_users(id) ON DELETE CASCADE,
          game_id TEXT NOT NULL,
          round_id TEXT NOT NULL,
          round_number BIGINT NOT NULL,
          question_id TEXT NOT NULL,
          question_revision TEXT NOT NULL,
          round_game TEXT NOT NULL,
          round_format TEXT NOT NULL,
          correct BOOLEAN NOT NULL,
          answer_stage SMALLINT CHECK (answer_stage BETWEEN 1 AND 3),
          submitted_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, round_id)
        )
      `;
      await transaction`
        CREATE INDEX IF NOT EXISTS queue_arcade_player_rounds_profile_idx
        ON queue_arcade_player_rounds(user_id, game_id, round_number)
      `;
    });
  })();
  globalAccountPostgres.__queueArcadeAccountSchema = schemaPromise.catch((error) => {
    globalAccountPostgres.__queueArcadeAccountSchema = undefined;
    throw error;
  });
  return globalAccountPostgres.__queueArcadeAccountSchema;
}

function accountUserFrom(row: UserRow): AccountUser {
  return {
    id: row.id,
    steamId: row.steam_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    profileUrl: row.profile_url,
    createdAt: Number(row.created_at),
  };
}

function playerRoundFrom(row: PlayerRoundRow): PlayerRoundRecord {
  return {
    roundId: row.round_id,
    roundNumber: Number(row.round_number),
    gameId: row.game_id as GameId,
    questionId: row.question_id,
    questionRevision: row.question_revision,
    roundGame: row.round_game,
    roundFormat: row.round_format,
    correct: row.correct,
    answerStage: row.answer_stage,
    submittedAt: Number(row.submitted_at),
  };
}

export async function getPostgresAccountStoreHealth(): Promise<AccountStoreHealth> {
  await ensureAccountSchema();
  await configuredPostgres()`SELECT 1 AS healthy`;
  return { backend: "postgres", ok: true };
}

export async function upsertSteamUser(input: SteamIdentityInput) {
  await ensureAccountSchema();
  const sql = configuredPostgres();
  return sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(hashtext(${`steam:${input.steamId}`}))`;
    const existing = await transaction<Array<{ user_id: string }>>`
      SELECT user_id
      FROM queue_arcade_user_identities
      WHERE provider = 'steam' AND provider_user_id = ${input.steamId}
      FOR UPDATE
    `;
    const userId = existing[0]?.user_id ?? `usr_${randomUUID().replaceAll("-", "")}`;
    if (!existing.length) {
      await transaction`
        INSERT INTO queue_arcade_users (id, created_at, updated_at)
        VALUES (${userId}, ${input.authenticatedAt}, ${input.authenticatedAt})
      `;
      await transaction`
        INSERT INTO queue_arcade_user_identities (
          provider, provider_user_id, user_id, display_name, avatar_url, profile_url, updated_at
        )
        VALUES (
          'steam', ${input.steamId}, ${userId}, ${input.displayName}, ${input.avatarUrl},
          ${input.profileUrl}, ${input.authenticatedAt}
        )
      `;
    } else {
      await transaction`
        UPDATE queue_arcade_user_identities
        SET display_name = ${input.displayName}, avatar_url = ${input.avatarUrl},
          profile_url = ${input.profileUrl}, updated_at = ${input.authenticatedAt}
        WHERE provider = 'steam' AND provider_user_id = ${input.steamId}
      `;
      await transaction`
        UPDATE queue_arcade_users SET updated_at = ${input.authenticatedAt} WHERE id = ${userId}
      `;
    }
    const rows = await transaction<UserRow[]>`
      SELECT users.id, identity.provider_user_id AS steam_id, identity.display_name,
        identity.avatar_url, identity.profile_url, users.created_at
      FROM queue_arcade_users AS users
      JOIN queue_arcade_user_identities AS identity ON identity.user_id = users.id AND identity.provider = 'steam'
      WHERE users.id = ${userId}
      LIMIT 1
    `;
    if (!rows[0]) throw new Error("Steam identity upsert did not return a Queue Arcade user.");
    return accountUserFrom(rows[0]);
  });
}

export async function createAccountSession(input: AccountSessionInput) {
  await ensureAccountSchema();
  await configuredPostgres()`
    INSERT INTO queue_arcade_user_sessions (token_hash, user_id, created_at, expires_at)
    VALUES (${input.tokenHash}, ${input.userId}, ${input.createdAt}, ${input.expiresAt})
    ON CONFLICT (token_hash) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      created_at = EXCLUDED.created_at,
      expires_at = EXCLUDED.expires_at
  `;
  await configuredPostgres()`DELETE FROM queue_arcade_user_sessions WHERE expires_at <= ${input.createdAt}`;
}

export async function getUserBySession(tokenHash: string, now: number) {
  await ensureAccountSchema();
  const rows = await configuredPostgres()<UserRow[]>`
    SELECT users.id, identity.provider_user_id AS steam_id, identity.display_name,
      identity.avatar_url, identity.profile_url, users.created_at
    FROM queue_arcade_user_sessions AS session
    JOIN queue_arcade_users AS users ON users.id = session.user_id
    JOIN queue_arcade_user_identities AS identity ON identity.user_id = users.id AND identity.provider = 'steam'
    WHERE session.token_hash = ${tokenHash} AND session.expires_at > ${now}
    LIMIT 1
  `;
  return rows[0] ? accountUserFrom(rows[0]) : null;
}

export async function deleteAccountSession(tokenHash: string) {
  await ensureAccountSchema();
  await configuredPostgres()`DELETE FROM queue_arcade_user_sessions WHERE token_hash = ${tokenHash}`;
}

export async function deleteAccount(userId: string) {
  await ensureAccountSchema();
  await configuredPostgres()`DELETE FROM queue_arcade_users WHERE id = ${userId}`;
}

export async function recordPlayerRound(userId: string, round: PlayerRoundRecord) {
  await ensureAccountSchema();
  await configuredPostgres()`
    INSERT INTO queue_arcade_player_rounds (
      user_id, game_id, round_id, round_number, question_id, question_revision,
      round_game, round_format, correct, answer_stage, submitted_at
    )
    VALUES (
      ${userId}, ${round.gameId}, ${round.roundId}, ${round.roundNumber}, ${round.questionId},
      ${round.questionRevision}, ${round.roundGame}, ${round.roundFormat}, ${round.correct},
      ${round.answerStage}, ${round.submittedAt}
    )
    ON CONFLICT (user_id, round_id) DO NOTHING
  `;
}

export async function getAccountProfile(userId: string, gameId: GameId): Promise<AccountProfile | null> {
  await ensureAccountSchema();
  const sql = configuredPostgres();
  const [users, rows] = await Promise.all([
    sql<UserRow[]>`
      SELECT users.id, identity.provider_user_id AS steam_id, identity.display_name,
        identity.avatar_url, identity.profile_url, users.created_at
      FROM queue_arcade_users AS users
      JOIN queue_arcade_user_identities AS identity ON identity.user_id = users.id AND identity.provider = 'steam'
      WHERE users.id = ${userId}
      LIMIT 1
    `,
    sql<PlayerRoundRow[]>`
      SELECT round_id, round_number, game_id, question_id, question_revision, round_game,
        round_format, correct, answer_stage, submitted_at
      FROM queue_arcade_player_rounds
      WHERE user_id = ${userId} AND game_id = ${gameId}
      ORDER BY round_number ASC, submitted_at ASC
    `,
  ]);
  if (!users[0]) return null;
  return {
    user: accountUserFrom(users[0]),
    stats: summarizePlayerRounds(rows.map(playerRoundFrom)) as AccountProfile["stats"],
  };
}
