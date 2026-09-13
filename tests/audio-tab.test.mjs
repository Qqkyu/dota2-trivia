import { expect, it } from "vitest";
import { claimAudioTab } from "../src/lib/audio-tab.mjs";

function hostWithStorage({ focused = true, token = "tab" } = {}) {
  const store = new Map();
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    hasFocus: () => focused,
  });
  const host = Object.assign(new EventTarget(), {
    document,
    crypto: { randomUUID: () => token },
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
      removeItem: (key) => {
        store.delete(key);
      },
    },
  });
  return {
    host,
    document,
    setFocused(value) {
      focused = value;
    },
    store,
  };
}

function trusted(type) {
  const event = new Event(type);
  Object.defineProperty(event, "isTrusted", { value: true });
  return event;
}

it("takes audio on the first trusted click even when the window is not focused yet", () => {
  const { host } = hostWithStorage({ focused: false });
  const tab = claimAudioTab(() => {}, host);
  expect(tab.isOwner()).toBe(false);
  host.dispatchEvent(trusted("pointerdown"));
  expect(tab.isOwner()).toBe(true);
  tab.dispose();
});

it("takes audio on that first click when storage cannot coordinate game tabs", () => {
  let focused = false;
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
  const tab = claimAudioTab(() => {}, host);
  expect(tab.isOwner()).toBe(false);
  host.dispatchEvent(trusted("pointerdown"));
  expect(tab.isOwner()).toBe(true);
  tab.dispose();
});

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
