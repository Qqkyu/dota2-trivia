import { describe, expect, it } from "vitest";
import { deckSeedSecret } from "../src/lib/deck-seed.mjs";

describe("deck seed secret", () => {
  it("derives a stable value from the auth secret that does not reveal it", () => {
    const env = { ARCADE_AUTH_SECRET: "a".repeat(64), NODE_ENV: "production" };
    const value = deckSeedSecret(env);
    expect(value).toBe(deckSeedSecret({ ...env }));
    expect(value).not.toContain("aaaa");
    expect(value).not.toBe(deckSeedSecret({ ARCADE_AUTH_SECRET: "b".repeat(64), NODE_ENV: "production" }));
  });

  it("refuses to run production without the secret", () => {
    expect(() => deckSeedSecret({ NODE_ENV: "production" })).toThrow(/ARCADE_AUTH_SECRET/);
    expect(deckSeedSecret({ NODE_ENV: "test" })).toBe("local");
  });
});
