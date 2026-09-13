import { expect, it } from "vitest";
import { claimAudioTab } from "../src/lib/audio-tab.mjs";

it("stops sound on focus loss when storage cannot coordinate game tabs", () => {
  let focused = true;
  const document = Object.assign(new EventTarget(), { hidden: false, hasFocus: () => focused });
  const host = Object.assign(new EventTarget(), {
    document,
    crypto: { randomUUID: () => "tab" },
    localStorage: {
      getItem() {
        throw new Error("Storage blocked");
      },
    },
  });
  let stopped = 0;
  const tab = claimAudioTab(() => {
    stopped++;
  }, host);
  expect(tab.isOwner()).toBe(true);
  focused = false;
  host.dispatchEvent(new Event("blur"));
  expect(tab.isOwner()).toBe(false);
  expect(stopped).toBe(1);
  focused = true;
  host.dispatchEvent(new Event("focus"));
  expect(tab.isOwner()).toBe(true);
  tab.dispose();
  focused = false;
  host.dispatchEvent(new Event("blur"));
  expect(stopped).toBe(1);
});
