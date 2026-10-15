import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildResponseTextOwners,
  isSubstantialResponseText,
  quoteResponseIsUnambiguous,
  responseSelectionAllowed,
  responseTextsAreNearDuplicates,
} from "../scripts/hero-response-quality.mjs";

describe("hero response text quality", () => {
  it("rejects laugh-only quotes and repeated-word clips but preserves complete dialogue", () => {
    expect(isSubstantialResponseText("Hee hee hee hee hee hee hee hee hee hee!", 28, 5)).toBe(false);
    expect(isSubstantialResponseText("Chop chop chop chop chop chop chop!", 18, 3)).toBe(false);
    expect(isSubstantialResponseText("Trees? Why did it have to be trees?", 18, 3)).toBe(true);
    expect(isSubstantialResponseText("You're too slow. Too... Soft.", 28, 5)).toBe(true);
  });

  it("treats the two Techies first-blood variants as the same clue", () => {
    expect(
      responseTextsAreNearDuplicates(
        "First blood? Uh, I only see a crater. Awww.. No blood?",
        "First blood? Uh, I only see a crater. Awwww.. No blood? Nope.",
      ),
    ).toBe(true);
    expect(
      responseTextsAreNearDuplicates(
        "First blood? Uh, I only see a crater. Awww.. No blood?",
        "My mind is exploding with ideas. Not literally I hope!",
      ),
    ).toBe(false);
  });

  it("rejects a text quote spoken by another hero even when only one version is selected", () => {
    const lich = { hero_id: 31, text: "You'll be looking up at the grass." };
    const disruptor = { hero_id: 87, text: "You'll be looking up at the grass." };
    const replacement = { hero_id: 31, text: "Those who disturb my peace shall be left in pieces." };
    const owners = buildResponseTextOwners([lich, disruptor, replacement, { ...replacement }]);
    expect(quoteResponseIsUnambiguous(lich, owners)).toBe(false);
    expect(quoteResponseIsUnambiguous(replacement, owners)).toBe(true);
    expect(quoteResponseIsUnambiguous({ hero_id: 31, text: "An unchecked line" }, owners)).toBe(false);
  });

  it("does not reselect the six clues rejected in the source and audio review", () => {
    for (const name of ["lich_kill_06", "snip_kill_12", "tech_firstblood_03"]) {
      expect(responseSelectionAllowed({ name }, "quote")).toBe(false);
    }
    for (const name of ["timb_attack_03", "jak_kill_06", "appa_kill_06"]) {
      expect(responseSelectionAllowed({ name }, "echo")).toBe(false);
    }
    expect(responseSelectionAllowed({ name: "lich_rare_02" }, "quote")).toBe(true);
    expect(responseSelectionAllowed({ name: "timb_respawn_02" }, "echo")).toBe(true);
  });

  it("retains the reviewed Troll Echo choice without changing its available text quotes", () => {
    expect(responseSelectionAllowed({ name: "troll_kill_06", hero_id: 95 }, "echo")).toBe(false);
    expect(responseSelectionAllowed({ name: "troll_respawn_02", hero_id: 95 }, "echo")).toBe(false);
    expect(responseSelectionAllowed({ name: "troll_respawn_10", hero_id: 95 }, "echo")).toBe(true);
    expect(responseSelectionAllowed({ name: "troll_respawn_02", heroKey: "npc_dota_hero_troll_warlord" }, "echo")).toBe(
      false,
    );
    expect(responseSelectionAllowed({ name: "troll_kill_06", hero_id: 95 }, "quote")).toBe(true);
  });

  it("keeps the playable Troll clip and explanation bound to the reviewed source record", () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/echo-troll-reviewed.json", import.meta.url)));
    const questions = JSON.parse(readFileSync(new URL("../src/data/questions.generated.json", import.meta.url)));
    const matches = questions.filter(
      (question) => question.kind === "hero-voice" && question.varietyKey === fixture.heroKey,
    );
    expect(matches).toHaveLength(1);
    const question = matches[0];
    expect(question.id).toBe(fixture.questionId);
    expect(question.audio.src).toBe(fixture.audioUrl);
    expect(question.answers[question.correctIndex]).toBe(fixture.heroName);
    expect(question.explanation).toBe(`“${fixture.response.text}” is spoken by ${fixture.heroName}.`);
    expect(fixture.response.hero_id).toBe(95);
    expect(fixture.response.voice_id).toBe(95);
    expect(fixture.audioUrl).toBe(`https://dotabase.dillerm.io/vpk${fixture.response.mp3}`);
  });
});
