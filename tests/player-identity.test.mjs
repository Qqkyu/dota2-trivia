import { describe, expect, it } from "vitest";
import { normalizePlayerIdentity, playerIdentityKey, samePlayerIdentity } from "../src/lib/player-identity";

describe("authoritative response identity", () => {
  it("keeps guest and account identity namespaces separate", () => {
    const guest = normalizePlayerIdentity({ kind: "guest", id: "fixture-player" });
    const account = normalizePlayerIdentity({ kind: "account", id: "fixture-player" });
    expect(playerIdentityKey(guest)).toBe("fixture-player");
    expect(playerIdentityKey(account)).toBe("account:fixture-player");
    expect(samePlayerIdentity(guest, account)).toBe(false);
    expect(samePlayerIdentity(account, { ...account })).toBe(true);
  });
  it.each([
    undefined,
    null,
    {},
    { kind: "guest", id: "account:claimed" },
    { kind: "guest", id: "trim-me " },
    { kind: "account", id: "bad value" },
    { kind: "other", id: "fixture-player" },
  ])("rejects invalid metadata without inferring guest ownership: %j", (value) => {
    expect(normalizePlayerIdentity(value)).toBeNull();
    expect(playerIdentityKey(normalizePlayerIdentity(value))).toBeNull();
  });
  it("does not treat two missing identities as proof of ownership", () => {
    expect(samePlayerIdentity(null, null)).toBe(false);
  });
});
