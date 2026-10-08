import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { soundcheckEventDetails, soundcheckPcmPreviewAudit } from "../scripts/soundcheck-audit.mjs";
import { isSingleItemSoundPickerQuestion } from "../src/lib/item-picker.mjs";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";
import { soundcheckClipTiming } from "../src/lib/soundcheck.mjs";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const fixture = readJson("./fixtures/soundcheck-shared-cues.json");
const nearDuplicates = readJson("./fixtures/soundcheck-near-duplicate-cues.json");
const official = readJson("./fixtures/soundcheck-official-names.json");
const questions = readJson("../src/data/soundcheck-questions.json");
const catalog = readJson("../src/data/shopkeeper-catalog.json");
const shopKeys = catalog.groups.flatMap((group) => group.items.map((item) => item.key));
const round = {
  id: "soundcheck-facts",
  game: "soundcheck",
  phase: "answering",
  answerDeadline: 15_000,
  answerDuration: 15_000,
};

describe("Soundcheck source facts", () => {
  it.each(nearDuplicates.pairs)("excludes $alternative when its PCM matches $subject", (pair) => {
    const decode = (base64) => {
      const bytes = Buffer.from(base64, "base64");
      return Array.from({ length: bytes.length / 2 }, (_, index) => bytes.readInt16LE(index * 2));
    };
    const left = decode(pair.pcm);
    const right = decode(pair.alternativePcm);
    expect(left).toHaveLength(pair.samples);
    expect(right).toHaveLength(pair.samples);
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const leftMean = mean(left);
    const rightMean = mean(right);
    const a = left.map((value) => value - leftMean);
    const b = right.map((value) => value - rightMean);
    const dot = (x, y) => x.reduce((sum, value, index) => sum + value * y[index], 0);
    expect(dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b))).toBeGreaterThan(0.98);
    const question = questions.find((entry) => entry.id === `soundcheck-item:${pair.subject}`);
    expect(shopKeys).toContain(pair.alternative);
    expect(isSingleItemSoundPickerQuestion(question)).toBe(false);
    for (const now of [1_000, 6_000, 8_000]) {
      const visible = publicQuestionForRound(question, round, now);
      expect(visible.answerMode).toBeUndefined();
      expect(visible.answers).toHaveLength(4);
      const keys = visible.answerImages.map((image) => image.split("/").at(-1).replace(".png", ""));
      expect(keys).not.toContain(pair.alternative);
      expect(keys[question.correctIndex]).toBe(pair.subject);
    }
  });
  it.each([
    ["muerta", "muerta_dead_shot", "Hero_Muerta.DeadShot.Cast", "Hero_Muerta.SpectralBlast.Cast", "Spectral Slug"],
    ["kez", "kez_echo_slash", "Hero_Kez.EchoSlash.Katana.Start", "Hero_Kez.FalconRush.Sai.Target", "Falcon Rush"],
  ])(
    "does not offer another owner of %s's exact base WAV as a wrong answer",
    (hero, subject, event, otherEvent, formerAnswer) => {
      const source = fixture.heroEvents.find((entry) => entry.hero === hero);
      expect(soundcheckEventDetails(source.events, event).audioPaths).toEqual(
        soundcheckEventDetails(source.events, otherEvent).audioPaths,
      );
      const question = questions.find((entry) => entry.id === `soundcheck-ability:${subject}`);
      expect(question.answers).not.toContain(formerAnswer);
      expect(question.answers).toContain(source.replacement.name);
      // Valve's behavior bit mask confirms an active target, point, no-target,
      // or toggle ability. This avoids replacing the removed cue with a passive.
      expect(BigInt(source.replacement.behavior) & (4n | 8n | 16n | 512n)).not.toBe(0n);
      expect(source.replacement.key.startsWith(`${hero}_`)).toBe(true);
    },
  );
  it("detects a silent preview in real PCM samples and checks the reviewed offset", () => {
    const wav = Buffer.alloc(2_044);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(2_036, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(1_000, 24);
    wav.writeUInt32LE(2_000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(2_000, 40);
    for (let frame = 600; frame < 1_000; frame += 1) wav.writeInt16LE(5_000, 44 + frame * 2);
    expect(
      soundcheckPcmPreviewAudit(wav, { duration: 1 })
        .stages.slice(0, 2)
        .map((stage) => stage.rms),
    ).toEqual([0, 0]);
    expect(
      soundcheckPcmPreviewAudit(wav, { duration: 1, startSeconds: 0.6 }).stages.every((stage) => stage.rms > 0.1),
    ).toBe(true);
  });
  it("matches all answer labels and explanations to Valve's named abilities and items", () => {
    for (const question of questions) {
      const family = question.soundcheck.family;
      const nameForImage = (image) => official.names[family][image.split("/").at(-1).replace(".png", "")];
      const expected = question.answerImagePairs
        ? question.answerImagePairs.map((pair) => pair.map(nameForImage).join(" → "))
        : question.answerImages.map(nameForImage);
      expect(question.answers, question.id).toEqual(expected);
      const clipNames = question.soundcheck.clips.map((clip) => official.names[family][clip.subject]);
      expect(question.answers[question.correctIndex], question.id).toBe(clipNames.join(" → "));
      expect(question.explanation, question.id).toBe(
        clipNames.length === 2
          ? `The sequence was ${clipNames[0]}, then ${clipNames[1]}.`
          : `That was the gameplay sound for ${clipNames[0]}.`,
      );
    }
  });
  it.each([
    [
      "blink",
      "DOTA_Item.BlinkDagger.Activate",
      ["DOTA_Item.Arcane_Blink.Activate", "DOTA_Item.Swift_Blink.Activate", "DOTA_Item.Overwhelming_Blink.Activate"],
      ["arcane_blink", "swift_blink", "overwhelming_blink"],
    ],
    ["diffusal_blade", "DOTA_Item.DiffusalBlade.Activate", ["Item.Disperser.Cast"], ["disperser"]],
  ])(
    "does not reject another source-confirmed owner of the %s base cue",
    (subject, event, otherEvents, alternatives) => {
      const source = soundcheckEventDetails(fixture.events, event);
      for (const other of otherEvents) {
        expect(soundcheckEventDetails(fixture.events, other).audioPaths).toEqual(source.audioPaths);
      }
      const question = questions.find((entry) => entry.id === `soundcheck-item:${subject}`);
      // Before the fix, every single-item round used the whole shop. These valid
      // base-cue owners were offered and marked wrong because their keys differ.
      expect(question.soundcheck.format).toBe("single");
      for (const alternative of alternatives) expect(shopKeys).toContain(alternative);
      expect(isSingleItemSoundPickerQuestion(question)).toBe(false);
      const publicQuestion = publicQuestionForRound(question, round, 1_000);
      expect(publicQuestion.answerMode).toBeUndefined();
      expect(publicQuestion.answers).toHaveLength(4);
      const offeredKeys = question.answerImages.map((image) => image.split("/").at(-1).replace(".png", ""));
      expect(offeredKeys[question.correctIndex]).toBe(subject);
      for (const alternative of alternatives) expect(offeredKeys).not.toContain(alternative);
    },
  );

  it("keeps the original Reincarnation source and exposes the audible duration", () => {
    const question = questions.find((entry) => entry.id === "soundcheck-ability:skeleton_king_reincarnation");
    const clip = question.soundcheck.clips[0];
    expect(clip.event).toBe("Hero_SkeletonKing.Reincarnate");
    expect(clip.duration).toBe(6.183356);
    expect(clip.startSeconds).toBe(0.6);
    expect(question.audio.src.endsWith("sounds/weapons/hero/skeleton_king/reincarnate.wav")).toBe(true);
    expect(publicQuestionForRound(question, round, 1_000).soundcheck.clips).toEqual([{ duration: 5.583356 }]);
  });

  it.each([-1, NaN, Infinity, 3, 4])("rejects an invalid trusted start offset %s", (startSeconds) => {
    expect(() => soundcheckClipTiming({ duration: 3, startSeconds })).toThrow("Invalid Soundcheck clip timing");
  });

  it("leaves untrimmed source duration unchanged", () => {
    expect(soundcheckClipTiming({ duration: 3 })).toEqual({ startSeconds: 0, duration: 3 });
  });

  it("keeps Wind Waker out of the reviewed Eul's choices while its runtime cue is unverified", () => {
    const question = questions.find((entry) => entry.id === "soundcheck-item:cyclone");
    expect(shopKeys).toContain("wind_waker");
    expect(isSingleItemSoundPickerQuestion(question)).toBe(false);
    expect(publicQuestionForRound(question, round, 1_000).answers).toEqual([
      "Force Staff",
      "Glimmer Cape",
      "Rod of Atos",
      "Eul's Scepter of Divinity",
    ]);
  });
});
