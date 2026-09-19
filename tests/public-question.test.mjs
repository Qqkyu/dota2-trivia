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

  it("puts the full Echo Hunt cut on the source URL with seven seconds left", () => {
    const echoRound = { ...soundcheckRound, id: "echo-round-1", game: "echo-hunt" };
    expect(publicQuestionRevision(echoRound, 7_999)).toBe("echo-round-1:answering:clue-2");
    expect(publicQuestionRevision(echoRound, 8_000)).toBe("echo-round-1:answering:clue-3");
  });
});

describe("flashback order cards", () => {
  const question = {
    id: "flashback:season-events-order",
    kind: "flashback-order",
    category: "History",
    difficulty: 3,
    eyebrow: "Seasonal calendar",
    prompt: "Put these events in the order they first ran.",
    answers: ["a", "b", "c", "d"],
    correctIndex: 0,
    explanation: "First Frostivus in 2012.",
    flashback: {
      family: "order",
      correctOrder: ["frostivus", "underhollow", "morokai", "diretide_return"],
      cards: [
        { key: "morokai", name: "Wrath of the Mo'rokai", context: "2019", image: "/m.png" },
        { key: "diretide_return", name: "Diretide returns", context: "2020", image: "/d.png" },
        { key: "frostivus", name: "First Frostivus", context: "2012", image: "/f.png" },
        { key: "underhollow", name: "The Underhollow", context: "2018", image: "/u.png" },
      ],
    },
  };

  it("hides years while answers are open and restores them on reveal", () => {
    const answeringRound = {
      id: "flash-order-1",
      phase: "answering",
      game: "flashback",
      answerDeadline: 15_000,
      answerDuration: 15_000,
    };
    const answering = publicQuestionForRound(question, answeringRound, 1_000);
    expect(answering.flashback.cards.map((card) => card.context)).toEqual([undefined, undefined, undefined, undefined]);
    expect(JSON.stringify(answering)).not.toMatch(/2012|2018|2019|2020/);

    const revealRound = { ...answeringRound, phase: "reveal" };
    const reveal = publicQuestionForRound(question, revealRound, 16_000);
    expect(reveal.flashback.cards.map((card) => card.context)).toEqual(["2019", "2020", "2012", "2018"]);
  });
});

describe("flashback order keys", () => {
  it("does not encode TI edition numbers in the answering keys", async () => {
    const { readFile } = await import("node:fs/promises");
    const questions = JSON.parse(
      await readFile(new URL("../src/data/flashback-questions.json", import.meta.url), "utf8"),
    );
    const question = questions.find((entry) => entry.id === "flashback:ti-year-gaps-order");
    const round = {
      id: "flash-ti-order-1",
      phase: "answering",
      game: "flashback",
      answerDeadline: 15_000,
      answerDuration: 15_000,
    };
    const answering = publicQuestionForRound(question, round, 1_000);
    const keys = answering.flashback.cards.map((card) => card.key);
    expect(keys.join(",")).not.toMatch(/ti\d/i);
    const byNumber = [...keys].sort();
    expect(byNumber.join(",")).not.toBe(question.flashback.correctOrder.join(","));
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
