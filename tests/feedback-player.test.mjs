import { describe, expect, it } from "vitest";
import { createFeedbackPlayer } from "../src/lib/feedback-player.mjs";

// Media playback starts asynchronously, even when the WAV is in the HTTP cache.
// A pause before `start()` rejects play and produces no samples.
function mediaHarness() {
  const nodes = [];
  class Audio extends EventTarget {
    constructor(src) {
      super();
      this.src = src;
      this.paused = true;
      this.ended = false;
      this.volume = 1;
      this.plays = 0;
      nodes.push(this);
    }
    play() {
      this.plays += 1;
      this.paused = false;
      return new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
    }
    start() {
      if (this.paused) throw new Error("Silent cue: paused before the first sample");
      this.resolve();
    }
    pause() {
      this.paused = true;
      this.reject?.(new DOMException("Interrupted before playback", "AbortError"));
    }
    finish() {
      this.ended = true;
      this.paused = true;
      this.dispatchEvent(new Event("ended"));
    }
    block() {
      this.paused = true;
      this.reject(new DOMException("User gesture required", "NotAllowedError"));
    }
  }
  const player = createFeedbackPlayer({ AudioCtor: Audio, isHidden: () => false });
  const cue = (needle) => nodes.findLast((node) => node.plays && node.src.includes(needle));
  return { player, nodes, cue };
}

describe("feedback playback across real round transitions", () => {
  it("keeps a late pick alive when its result arrives before audio starts", () => {
    const { player, cue } = mediaHarness();
    player.play("lock");
    const lock = cue("button_click");
    player.play("wrong");
    expect(() => lock.start()).not.toThrow();
    expect(() => cue("magic_immune").start()).not.toThrow();
  });

  it("keeps a delayed wrong result alive when the next round is picked", () => {
    const { player, cue } = mediaHarness();
    player.play("wrong");
    const wrong = cue("magic_immune");
    player.clearPending();
    player.play("lock");
    expect(() => wrong.start()).not.toThrow();
    expect(() => cue("button_click").start()).not.toThrow();
  });

  it("lets separate recipe picks finish without replaying any node", () => {
    const { player, nodes } = mediaHarness();
    for (let index = 0; index < 3; index += 1) player.play("lock");
    const picks = nodes.filter((node) => node.plays);
    expect(picks).toHaveLength(3);
    for (const pick of picks) {
      expect(pick.plays).toBe(1);
      expect(() => pick.start()).not.toThrow();
    }
  });

  it("cancels the entry cue when picking, with no aborted-cue retry", async () => {
    const { player, nodes, cue } = mediaHarness();
    player.play("start");
    const entry = nodes.filter((node) => node.plays);
    player.play("lock");
    expect(entry.every((node) => node.paused)).toBe(true);
    cue("button_click").start();
    await Promise.resolve();
    expect(entry.every((node) => node.plays === 1)).toBe(true);
  });

  it("does not report a rejected request as started", async () => {
    const { player, cue } = mediaHarness();
    const request = player.play("wrong");
    cue("magic_immune").block();
    expect(await request.started).toBe(false);
  });

  it("retries a blocked result once, and never repeats a finished result on focus", async () => {
    const { player, cue } = mediaHarness();
    const request = player.play("wrong");
    cue("magic_immune").block();
    await request.started;
    const recovery = player.resumeIfNeeded();
    cue("magic_immune").start();
    expect(await recovery.started).toBe(true);
    cue("magic_immune").finish();
    expect(player.resumeIfNeeded().requested).toBe(false);
  });

  it("mute cancels a blocked result instead of replaying it on focus", async () => {
    const { player, cue } = mediaHarness();
    const request = player.play("wrong");
    cue("magic_immune").block();
    await request.started;
    player.pauseAll();
    expect(player.resumeIfNeeded().requested).toBe(false);
  });

  it("does not replay a clip that ends before the play acknowledgement is handled", async () => {
    const { player, cue } = mediaHarness();
    const request = player.play("wrong");
    cue("magic_immune").start();
    cue("magic_immune").finish();
    expect(await request.started).toBe(true);
    expect(player.resumeIfNeeded().requested).toBe(false);
  });

  it("does not create voices when sound is disabled or volume is zero", async () => {
    const { player, nodes } = mediaHarness();
    expect(await player.play("lock", { enabled: false }).started).toBe(false);
    expect(await player.play("wrong", { volume: 0 }).started).toBe(false);
    expect(nodes).toHaveLength(0);
  });

  it("releases ended voices and changes volume only on live voices", async () => {
    const { player, cue } = mediaHarness();
    const request = player.play("wrong", { volume: 0.7 });
    const wrong = cue("magic_immune");
    wrong.start();
    await request.started;
    wrong.finish();
    player.setVolume(0.3);
    expect(wrong.volume).toBe(0.7);
  });
});
