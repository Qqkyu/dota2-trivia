import { describe, expect, it } from "vitest";
import {
  getRoomPresence,
  presenceRoomCount,
  ROOM_PRESENCE_TTL_MS,
  touchRoomPresence,
} from "../src/lib/room-presence.mjs";

describe("room presence", () => {
  it("drops expired rooms that nobody reads again, such as closed parties", () => {
    const start = 5_000_000_000_000;
    touchRoomPresence("dota2:test:private:CLOSED", "guest-closed-0001", start);
    expect(getRoomPresence("dota2:test:private:CLOSED", start)).toBe(1);
    const later = start + ROOM_PRESENCE_TTL_MS + 60_000;
    touchRoomPresence("dota2:test:public", "guest-public-0001", later);
    expect(presenceRoomCount()).toBe(1);
    expect(getRoomPresence("dota2:test:public", later)).toBe(1);
  });
});
