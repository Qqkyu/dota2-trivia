import { createHmac } from "node:crypto";

let cachedSecret;

/**
 * A server-only value mixed into every deck seed. The deck code and catalog are
 * public, so without it anyone could compute the upcoming questions from the room
 * clock. Derived from ARCADE_AUTH_SECRET; local runs use a fixed value.
 */
export function deckSeedSecret(env = process.env) {
  if (env === process.env && cachedSecret !== undefined) return cachedSecret;
  const secret = env.ARCADE_AUTH_SECRET?.trim();
  if (!secret && env.NODE_ENV === "production") throw new Error("ARCADE_AUTH_SECRET is required in production.");
  const value = secret ? createHmac("sha256", secret).update("queue-arcade:deck-seed:v1").digest("base64url") : "local";
  if (env === process.env) cachedSecret = value;
  return value;
}
