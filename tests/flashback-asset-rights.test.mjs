import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { auditImageAssets, isStaticLocalSvg } from "../scripts/image-assets.mjs";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";
import { isPlayableFlashbackQuestion } from "../src/lib/flashback.mjs";

const questions = JSON.parse(readFileSync("src/data/flashback-questions.json", "utf8"));
const quarantine = JSON.parse(
  readFileSync("docs/audits/2026-10-06/launch-checks/rights/quarantine-manifest.json", "utf8"),
);
const winners = questions.filter(
  (question) =>
    question.id.endsWith("-winner") || ["flashback:back-to-back", "flashback:four-majors"].includes(question.id),
);

describe("Flashback assets with no recorded reuse permission", () => {
  it("keeps all 191 questions playable after local card replacement", () => {
    expect(questions).toHaveLength(191);
    expect(
      questions.filter((question) => !isPlayableFlashbackQuestion(question)).map((question) => question.id),
    ).toEqual([]);
  });

  it("keeps all 23 retired assets outside public output and catalog references", () => {
    expect(quarantine.assets).toHaveLength(23);
    const catalog = JSON.stringify(questions);
    for (const asset of quarantine.assets) {
      expect(existsSync(asset.oldPublicPath), asset.oldPublicPath).toBe(false);
      expect(catalog.includes(asset.oldPublicUrl), asset.oldPublicUrl).toBe(false);
    }
    expect(catalog.includes("/team_logos/")).toBe(false);
  });

  it("shows original winner cards only after the answer deadline", async () => {
    expect(winners).toHaveLength(21);
    for (const question of winners) {
      const media = question.flashback.revealMedia;
      expect(media.kind).toBe("mark");
      expect(media.src).toMatch(/^\/arcade\/flashback\/originals\/winner-[a-z-]+\.svg$/);
      const round = {
        id: `rights:${question.id}`,
        game: "flashback",
        phase: "answering",
        answerDeadline: 15_000,
        answerDuration: 15_000,
      };
      const answering = publicQuestionForRound(question, round, 1_000);
      const revealed = publicQuestionForRound(question, { ...round, phase: "reveal" }, 16_000);
      expect(answering.reveal).toBeNull();
      expect(JSON.stringify(answering)).not.toContain(media.src);
      expect(revealed.reveal.media).toEqual(media);
      const source = readFileSync(resolve("public", `.${media.src}`), "utf8");
      expect(source).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(source).not.toMatch(/<script|<foreignObject|<image|\bhref=|\bon\w+=|url\(/i);
    }
    const audit = await auditImageAssets(winners.map((question) => ({ image: question.flashback.revealMedia })));
    expect([...audit.availability.values()].every(Boolean)).toBe(true);
  });

  it("keeps replacement tournament art free of years, cities and winner names", async () => {
    const source = readFileSync("public/arcade/flashback/originals/international.svg", "utf8");
    const text = [...source.matchAll(/<(?:text|title)\b[^>]*>([^<]*)<\//g)].map((match) => match[1]).join(" ");
    expect(text).not.toMatch(
      /20\d\d|Cologne|Seattle|Vancouver|Alliance|Liquid|Natus|Invictus|Newbee|Wings|Falcons|Tundra|Spirit/i,
    );
    expect(source).toContain("THE INTERNATIONAL");
    const audit = await auditImageAssets([{ image: { src: "/arcade/flashback/originals/international.svg" } }]);
    expect(audit.availability.get("/arcade/flashback/originals/international.svg")).toBe(true);
  });

  it.each([
    "<script>alert(1)</script>",
    '<image href="https://example.com/photo.jpg"/>',
    "<foreignObject><p>external content</p></foreignObject>",
    '<rect onload="alert(1)"/>',
    '<path style="fill:url(https://example.com/image)"/>',
    '<animate attributeName="href" to="https://example.com/image"/>',
  ])("rejects executable or external SVG content: %s", (content) => {
    expect(isStaticLocalSvg(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`))).toBe(false);
  });
});
