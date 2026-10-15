import type { PlayerIdentity } from "./arcade-contract";
import { validatedGuestIdentity } from "./guest-identity.mjs";

export function normalizePlayerIdentity(value: unknown): PlayerIdentity | null {
  if (!value || typeof value !== "object" || !("kind" in value) || !("id" in value)) return null;
  const { kind, id } = value;
  if (kind === "guest" && typeof id === "string" && validatedGuestIdentity(id) === id) return { kind, id };
  if (kind === "account" && typeof id === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(id)) return { kind, id };
  return null;
}

export function playerIdentityKey(identity: PlayerIdentity | null | undefined) {
  return identity ? (identity.kind === "account" ? `account:${identity.id}` : identity.id) : null;
}

export function samePlayerIdentity(
  first: PlayerIdentity | null | undefined,
  second: PlayerIdentity | null | undefined,
) {
  return Boolean(first && second && first.kind === second.kind && first.id === second.id);
}
