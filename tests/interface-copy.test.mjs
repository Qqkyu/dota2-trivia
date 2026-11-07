import { describe, expect, it } from "vitest";
import { splitAccent } from "../src/i18n/format.mjs";
import { en } from "../src/i18n/messages/en";
import { createTranslator } from "../src/i18n/translator";
import { accuracyRate, revealCallout, revealCalloutKey, streakBannerParts } from "../src/lib/dota-flavor.mjs";
import { ENTRY_WAIT_TIPS, shuffleEntryWaitTips } from "../src/lib/entry-wait-tips.mjs";
import { preventQuestionClipboard, shouldBlockQuestionClipboard } from "../src/lib/question-guard.mjs";
import { formatPreviewLeaksAnswer, formatPreviewsFromQuestions } from "../src/lib/format-preview.mjs";
import { LIVE_ROUND_GAMES } from "../src/lib/arcade-games.mjs";
import generatedQuestions from "../src/data/questions.generated.json" with { type: "json" };
import flashbackQuestions from "../src/data/flashback-questions.json" with { type: "json" };

const t = createTranslator("en", null);

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

  it("read the same in English as their ids", () => {
    for (const callout of ["Correct", "Incorrect", "Time expired"]) expect(t(revealCalloutKey(callout))).toBe(callout);
  });

  it("build kill-feed sentences from the client strings", () => {
    expect(streakBannerParts("Unstoppable", "", t).accent).toBe("unstoppable");
    expect(streakBannerParts("Killing Spree", "", t).before).toBe("You are on a ");
    expect(streakBannerParts("Beyond Godlike", "", t)).toEqual({
      before: "You are beyond ",
      accent: "GODLIKE, someone kill them!!",
      after: "",
    });
    expect(streakBannerParts("Mega Kill", "", t)).toEqual({
      before: "You are on a ",
      accent: "mega kill",
      after: " streak",
    });
    expect(streakBannerParts("Killing Spree", "Aui_2000", t).before).toBe("Aui_2000 is on a ");
    expect(streakBannerParts("First Blood", "Aui_2000", t).before).toBe("Aui_2000 drew ");
    expect(streakBannerParts("Dominating", "{accent} $& name", t)).toEqual({
      before: "{accent} $& name is ",
      accent: "dominating",
      after: "",
    });
    expect(accuracyRate(3, 4)).toBe(75);
    expect(accuracyRate(0, 0)).toBe(0);
  });
});

describe("entry wait tips", () => {
  it("keep the reviewed copy and shuffle deterministically", () => {
    expect(en["wait.hint"]).toBe("Waiting for the next full question.");
    expect(en["wait.tipLabel"]).toBe("Hint");
    expect(en["round.shop.searchPlaceholder"]).toBe("Search Items");
    expect(ENTRY_WAIT_TIPS).toContainEqual({ id: "keys", body: "wait.tip.keys" });
    expect(ENTRY_WAIT_TIPS).toContainEqual({ id: "heroes", body: "wait.tip.heroes" });
    expect(ENTRY_WAIT_TIPS).toContainEqual({ id: "shop", body: "wait.tip.shop" });
    expect(t("wait.tip.keys")).toBe("Use A–D shortcut to pick an answer");
    expect(t("wait.tip.heroes")).toBe("Start typing to filter heroes");
    expect(splitAccent(t("wait.tip.shop", { field: t("round.shop.searchPlaceholder") }))).toEqual({
      before: "Use ",
      accent: "Search Items",
      after: " to filter",
    });
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
