import { describe, expect, it } from "vitest";
import { canonicalRedirectUrl } from "../src/lib/canonical-host.mjs";

const custom = "https://queuearcade.com";
const render = "https://queue-arcade.onrender.com";

describe("canonicalRedirectUrl", () => {
  it("sends onrender.com page requests to the custom domain, keeping path and query", () => {
    expect(canonicalRedirectUrl("/play?audio-debug=1", "queue-arcade.onrender.com", custom)).toBe(
      "https://queuearcade.com/play?audio-debug=1",
    );
    expect(canonicalRedirectUrl("/", "Queue-Arcade.onrender.com:443", custom)).toBe("https://queuearcade.com/");
    expect(canonicalRedirectUrl("/profile", "queue-arcade.onrender.com, proxy.internal", custom)).toBe(
      "https://queuearcade.com/profile",
    );
  });

  it("does nothing while the configured origin is the onrender.com address", () => {
    expect(canonicalRedirectUrl("/play", "queue-arcade.onrender.com", render)).toBeNull();
  });

  it("never touches the canonical host, local hosts, or a missing configuration", () => {
    expect(canonicalRedirectUrl("/play", "queuearcade.com", custom)).toBeNull();
    expect(canonicalRedirectUrl("/play", "www.queuearcade.com", custom)).toBeNull();
    expect(canonicalRedirectUrl("/play", "127.0.0.1:3451", "http://127.0.0.1:3451")).toBeNull();
    expect(canonicalRedirectUrl("/play", "localhost:3000", custom)).toBeNull();
    expect(canonicalRedirectUrl("/play", "queue-arcade.onrender.com", undefined)).toBeNull();
    expect(canonicalRedirectUrl("/play", "queue-arcade.onrender.com", "not a url")).toBeNull();
    expect(canonicalRedirectUrl("/play", null, custom)).toBeNull();
  });

  it("falls back to the root for a malformed path", () => {
    expect(canonicalRedirectUrl("//evil.example/x", "queue-arcade.onrender.com", custom)).toBe(
      "https://queuearcade.com//evil.example/x",
    );
    expect(canonicalRedirectUrl("javascript:alert(1)", "queue-arcade.onrender.com", custom)).toBe(
      "https://queuearcade.com/",
    );
  });
});
