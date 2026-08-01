import { createHash } from "node:crypto";

export function anonymousVoterHash(scope: string, voterId: string) {
  const salt = process.env.ARCADE_VOTER_SALT || "queue-arcade-local-v1";
  return createHash("sha256").update(`${salt}:${scope}:${voterId}`).digest("base64url");
}
