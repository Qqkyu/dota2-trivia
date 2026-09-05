import { describe, expect, it } from "vitest";
import { accuracyRate, revealCallout, streakBannerParts } from "../src/lib/dota-flavor.mjs";
import {
  DOTA_SHOP_SEARCH_PLACEHOLDER,
  ENTRY_WAIT_HINT,
  ENTRY_WAIT_TIP_LABEL,
  ENTRY_WAIT_TIPS,
  shuffleEntryWaitTips,
} from "../src/lib/entry-wait-tips.mjs";
import { preventQuestionClipboard, shouldBlockQuestionClipboard } from "../src/lib/question-guard.mjs";
import { formatPreviewLeaksAnswer, formatPreviewsFromQuestions } from "../src/lib/format-preview.mjs";
import { LIVE_ROUND_GAMES } from "../src/lib/arcade-games.mjs";
import generatedQuestions from "../src/data/questions.generated.json" with { type: "json" };
import flashbackQuestions from "../src/data/flashback-questions.json" with { type: "json" };

describe("reveal callouts", () => {
  it("follow the Dota kill-streak ladder", () => {
    expect(revealCallout({ correct: true, timedOut: false, firstBlood: true, streak: 1 })).toBe("First Blood");
    expect(revealCallout({ correct: true, timedOut: false, firstBlood: false, streak: 2 })).toBe("Correct");
    expect(revealCallout({ correct: true, timedOut: false, firstBlood: false, streak: 3 })).toBe("Killing Spree");
    expect(revealCallout({ correct: true, timedOut: false, firstBlood: false, streak: 5 })).toBe("Mega Kill");
    expect(revealCallout({ correct: true, timedOut: false, firstBlood: false, streak: 9 })).toBe("Godlike");
    expect(revealCallout({ correct: false, timedOut: false, firstBlood: false, streak: 0 })).toBe("Incorrect");
    expect(revealCallout({ correct: false, timedOut: true, firstBlood: false, streak: 0 })).toBe("Time expired");
  });

  it("build kill-feed sentences from the client strings", () => {
    expect(streakBannerParts("Unstoppable").accent).toBe("unstoppable");
    expect(streakBannerParts("Killing Spree").before).toBe("You are on a ");
    expect(streakBannerParts("Beyond Godlike").accent).toBe("GODLIKE, someone kill them!!");
    expect(streakBannerParts("Killing Spree", "Aui_2000").before).toBe("Aui_2000 is on a ");
    expect(streakBannerParts("First Blood", "Aui_2000").before).toBe("Aui_2000 drew ");
    expect(accuracyRate(3, 4)).toBe(75);
    expect(accuracyRate(0, 0)).toBe(0);
  });
});

describe("entry wait tips", () => {
  it("keep the reviewed copy and shuffle deterministically", () => {
    expect(ENTRY_WAIT_HINT).toBe("Waiting for the next full question.");
    expect(ENTRY_WAIT_TIP_LABEL).toBe("Hint");
    expect(DOTA_SHOP_SEARCH_PLACEHOLDER).toBe("Search Items");
    expect(ENTRY_WAIT_TIPS).toContainEqual({ id: "keys", body: "Use A–D shortcut to pick an answer" });
    expect(ENTRY_WAIT_TIPS).toContainEqual({ id: "heroes", body: "Start typing to filter heroes" });
    expect(ENTRY_WAIT_TIPS).toContainEqual({ id: "shop", body: "Use Search Items to filter", mark: "Search Items" });
    expect(shuffleEntryWaitTips(ENTRY_WAIT_TIPS, () => 0).map((tip) => tip.id)).toEqual(["heroes", "shop", "keys"]);
  });
});

describe("question clipboard guard", () => {
  it("blocks copying only while answering", () => {
    expect(shouldBlockQuestionClipboard("answering")).toBe(true);
    expect(shouldBlockQuestionClipboard("reveal")).toBe(false);
    expect(shouldBlockQuestionClipboard("lobby")).toBe(false);
    expect(shouldBlockQuestionClipboard("waiting")).toBe(false);
    let prevented = false;
    preventQuestionClipboard({ preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
  });
});

describe("format previews", () => {
  it("cover every live game without leaking an answer", () => {
    const previews = formatPreviewsFromQuestions([...generatedQuestions, ...flashbackQuestions]);
    for (const game of LIVE_ROUND_GAMES) {
      expect(previews[game]).toBeDefined();
      expect(formatPreviewLeaksAnswer(previews[game])).toBe(false);
    }
    expect(formatPreviewLeaksAnswer({ id: "ability-owner:axe_culling_blade", prompt: "x" })).toBe(true);
    expect(formatPreviewLeaksAnswer({ prompt: "x", correctIndex: 1 })).toBe(true);
  });
});
