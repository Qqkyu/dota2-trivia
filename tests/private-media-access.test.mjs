import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrivateRoom, resetPrivateRoomsForTests } from "../src/lib/private-rooms.mjs";
import { ACCOUNT_SESSION_COOKIE } from "../src/lib/steam-auth.mjs";

const { sessionUser, loggedError } = vi.hoisted(() => ({ sessionUser: vi.fn(), loggedError: vi.fn() }));
vi.mock("../src/lib/account-store", () => ({
  getUserBySession: sessionUser,
  createAccountSession: vi.fn(),
  deleteAccountSession: vi.fn(),
}));
vi.mock("../src/lib/server-diagnostics", () => ({ logServerError: loggedError }));
import { privateMediaAccessResponse } from "../src/lib/private-media-access.ts";

const roundId = "dota2:media-test:private:MEDIATEST:round:1:1000";
const guestId = "media-guest-player";
function createRoom(hostId = guestId) {
  createPrivateRoom({ hostId, gameId: "dota2", contentVersion: "media-test", games: ["echo-hunt"], code: "MEDIATEST" });
}
function request(playerId, authenticated = false) {
  const url = new URL("http://localhost/api/round-audio");
  if (playerId) url.searchParams.set("playerId", playerId);
  return new Request(url, {
    headers: authenticated ? { cookie: `${ACCOUNT_SESSION_COOKIE}=${"a".repeat(43)}` } : {},
  });
}
beforeEach(() => {
  resetPrivateRoomsForTests();
  sessionUser.mockReset().mockResolvedValue(null);
  loggedError.mockReset();
});
afterEach(() => resetPrivateRoomsForTests());

describe("private clue membership", () => {
  it("does not require account storage for public clues", async () => {
    sessionUser.mockRejectedValue(new Error("offline"));
    expect(await privateMediaAccessResponse(request(undefined, true), "dota2:media-test:public:round:1")).toBeNull();
    expect(sessionUser).not.toHaveBeenCalled();
  });

  it("permits a joined guest", async () => {
    createRoom();
    expect(await privateMediaAccessResponse(request(guestId), roundId)).toBeNull();
  });

  it.each([undefined, "stranger-player", "account:known-user"])("rejects an unjoined identity %s", async (playerId) => {
    createRoom();
    const response = await privateMediaAccessResponse(request(playerId), roundId);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("uses the account identity for a joined Steam player", async () => {
    createRoom("account:known-user");
    sessionUser.mockResolvedValue({ id: "known-user", displayName: "Player" });
    expect(await privateMediaAccessResponse(request(guestId, true), roundId)).toBeNull();
  });

  it("fails closed on account storage failure", async () => {
    createRoom();
    sessionUser.mockRejectedValue(new Error("offline"));
    expect((await privateMediaAccessResponse(request(guestId, true), roundId)).status).toBe(503);
    expect(loggedError).toHaveBeenCalledOnce();
  });
});
