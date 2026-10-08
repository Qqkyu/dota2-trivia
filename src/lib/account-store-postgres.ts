import { randomUUID } from "node:crypto";
import type { AccountProfile, AccountUser, StoredPlayerRoundRecord } from "@/lib/account-contract";
import type { AccountSessionInput, AccountStoreHealth, SteamIdentityInput } from "@/lib/account-store";
import type { GameId } from "@/lib/game-identity";
import { summarizePlayerRounds } from "@/lib/player-profile.mjs";
import { configuredPostgres, databasePool, databaseTransaction } from "@/lib/database-client";
import { ensureDatabaseSchema } from "@/lib/database-schema.mjs";

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
  round_game: StoredPlayerRoundRecord["roundGame"];
  round_format: string;
  correct: boolean;
  answer_stage: 1 | 2 | 3 | null;
  submitted_at: number | string;
  reveal_at: number | string;
}

function ensureAccountSchema() {
  return ensureDatabaseSchema(databasePool());
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

function playerRoundFrom(row: PlayerRoundRow): StoredPlayerRoundRecord {
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
    revealAt: Number(row.reveal_at),
  };
}

export async function getPostgresAccountStoreHealth(): Promise<AccountStoreHealth> {
  await ensureAccountSchema();
  await configuredPostgres()`SELECT 1 AS healthy`;
  return { backend: "postgres", ok: true };
}

export async function upsertSteamUser(input: SteamIdentityInput) {
  await ensureAccountSchema();
  return databaseTransaction(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(hashtext(${`steam:${input.steamId}`}))`;
    const identities = await transaction<Array<{ user_id: string }>>`
      SELECT user_id
      FROM queue_arcade_user_identities
      WHERE provider = 'steam' AND provider_user_id = ${input.steamId}
    `;
    // Deletion locks the user before cascading to the identity. Use the same order here.
    const existing = identities[0]
      ? await transaction<Array<{ id: string }>>`
          SELECT id FROM queue_arcade_users WHERE id = ${identities[0].user_id} FOR UPDATE
        `
      : [];
    const userId = existing[0]?.id ?? `usr_${randomUUID().replaceAll("-", "")}`;
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

export async function consumeSteamLoginNonce(nonceHash: string, expiresAt: number): Promise<boolean> {
  return databaseTransaction(async (sql) => {
    await sql`DELETE FROM queue_arcade_steam_nonces WHERE expires_at <= ${Date.now()}`;
    const rows = await sql`
      INSERT INTO queue_arcade_steam_nonces (nonce_hash, expires_at)
      VALUES (${nonceHash}, ${expiresAt})
      ON CONFLICT DO NOTHING RETURNING nonce_hash
    `;
    return rows.length === 1;
  });
}

export async function deleteAccount(userId: string) {
  await ensureAccountSchema();
  await configuredPostgres()`DELETE FROM queue_arcade_users WHERE id = ${userId}`;
}

export async function accountExists(userId: string) {
  await ensureAccountSchema();
  const rows = await configuredPostgres()`SELECT id FROM queue_arcade_users WHERE id = ${userId}`;
  return rows.length > 0;
}

export async function withExistingAccount<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  return databaseTransaction(async (sql) => {
    const rows = await sql`SELECT id FROM queue_arcade_users WHERE id = ${userId} FOR UPDATE`;
    if (!rows.length) throw new Error("Queue Arcade account no longer exists.");
    return operation();
  });
}

export async function updateSteamUser(userId: string, input: SteamIdentityInput): Promise<AccountUser | null> {
  await ensureAccountSchema();
  const rows = await configuredPostgres()<UserRow[]>`
    UPDATE queue_arcade_user_identities AS identity
    SET display_name = ${input.displayName}, avatar_url = ${input.avatarUrl},
      profile_url = ${input.profileUrl}, updated_at = ${input.authenticatedAt}
    FROM queue_arcade_users AS users
    WHERE identity.user_id = users.id AND users.id = ${userId}
      AND identity.provider = 'steam' AND identity.provider_user_id = ${input.steamId}
    RETURNING users.id, identity.provider_user_id AS steam_id, identity.display_name,
      identity.avatar_url, identity.profile_url, users.created_at
  `;
  return rows[0] ? accountUserFrom(rows[0]) : null;
}

export async function recordPlayerRound(userId: string, round: StoredPlayerRoundRecord) {
  await ensureAccountSchema();
  await configuredPostgres()`
    INSERT INTO queue_arcade_player_rounds (
      user_id, game_id, round_id, round_number, question_id, question_revision,
      round_game, round_format, correct, answer_stage, submitted_at, reveal_at
    )
    VALUES (
      ${userId}, ${round.gameId}, ${round.roundId}, ${round.roundNumber}, ${round.questionId},
      ${round.questionRevision}, ${round.roundGame}, ${round.roundFormat}, ${round.correct},
      ${round.answerStage}, ${round.submittedAt}, ${round.revealAt ?? 0}
    )
    ON CONFLICT (user_id, round_id) DO NOTHING
  `;
}

export async function getAccountProfile(
  userId: string,
  gameId: GameId,
  now = Date.now(),
): Promise<AccountProfile | null> {
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
        round_format, correct, answer_stage, submitted_at, reveal_at
      FROM queue_arcade_player_rounds
      WHERE user_id = ${userId} AND game_id = ${gameId} AND reveal_at <= ${now}
      ORDER BY round_number ASC, submitted_at ASC
    `,
  ]);
  if (!users[0]) return null;
  return {
    user: accountUserFrom(users[0]),
    stats: summarizePlayerRounds(rows.map(playerRoundFrom)) as AccountProfile["stats"],
  };
}
