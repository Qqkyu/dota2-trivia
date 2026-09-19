import { describe, expect, it } from "vitest";
import { publicQuestionForRound, publicQuestionRevision } from "../src/lib/public-question.mjs";

const soundcheckRound = {
  id: "sound-round-1",
  phase: "answering",
  game: "soundcheck",
  answerDeadline: 15_000,
  answerDuration: 15_000,
};

describe("soundcheck public stage clock", () => {
  it("puts the full cut on the source URL with seven seconds left", () => {
    expect(publicQuestionRevision(soundcheckRound, 7_999)).toBe("sound-round-1:answering:clue-2");
    expect(publicQuestionRevision(soundcheckRound, 8_000)).toBe("sound-round-1:answering:clue-3");
  });

  it("keeps echo hunt on equal thirds", () => {
    const echoRound = { ...soundcheckRound, id: "echo-round-1", game: "echo-hunt" };
    expect(publicQuestionRevision(echoRound, 9_999)).toBe("echo-round-1:answering:clue-2");
    expect(publicQuestionRevision(echoRound, 10_000)).toBe("echo-round-1:answering:clue-3");
  });
});

describe("spell-link public clues", () => {
  it("keeps the ability name out of the answering eyebrow", () => {
    const question = {
      id: "ability-owner:huskar_burning_spear",
      kind: "spell-owner",
      category: "Abilities",
      difficulty: 2,
      eyebrow: "Burning Spear",
      prompt: "Which hero owns this ability?",
      answers: ["Huskar", "Axe", "Drow Ranger", "Lina"],
      correctIndex: 0,
      explanation: "Burning Spear belongs to Huskar.",
      image: { src: "/ability.png", alt: "Burning Spear", kind: "ability" },
      answerImages: [
        "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/huskar.png",
        "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/axe.png",
        "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/drow_ranger.png",
        "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/lina.png",
      ],
    };
    const round = {
      id: "spell-round-1",
      phase: "answering",
      game: "spell-link",
      answerDeadline: 15_000,
      answerDuration: 15_000,
    };
    const early = publicQuestionForRound(question, round, 1_000);
    expect(early.eyebrow).toBe("Spell Link");
    expect(early.clueStage).toBe(1);
  });
});
