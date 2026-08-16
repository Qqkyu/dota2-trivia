#!/usr/bin/env node

import generatedQuestions from "../src/data/questions.generated.json" with { type: "json" };
import aghanimQuestions from "../src/data/aghanim-questions.json" with { type: "json" };
import shopkeeperQuestions from "../src/data/shopkeeper-questions.json" with { type: "json" };
import soundcheckQuestions from "../src/data/soundcheck-questions.json" with { type: "json" };
import valueOrderQuestions from "../src/data/value-order-questions.json" with { type: "json" };
import flashbackQuestions from "../src/data/flashback-questions.json" with { type: "json" };
import { questionCalibrationRevision } from "../src/lib/question-revision.mjs";

const questions = [
  ...generatedQuestions,
  ...aghanimQuestions,
  ...shopkeeperQuestions,
  ...soundcheckQuestions,
  ...valueOrderQuestions,
  ...flashbackQuestions,
];
const revisions = new Map();
const failures = [];

for (const question of questions) {
  const revision = questionCalibrationRevision(question);
  if (!/^q1_[A-Za-z0-9_-]{22}$/.test(revision)) {
    failures.push(`${question.id} produced an invalid calibration revision.`);
  }
  const previous = revisions.get(revision);
  if (previous && previous !== question.id) {
    failures.push(`${question.id} and ${previous} share a calibration revision.`);
  }
  revisions.set(revision, question.id);
}

const sample = questions[0];
const baseline = questionCalibrationRevision(sample);
const metadataEdit = questionCalibrationRevision({
  ...sample,
  difficulty: sample.difficulty === 1 ? 2 : 1,
  explanation: `${sample.explanation} Editorial clarification.`,
  patch: "future-patch",
  source: { label: "Another audit", url: "https://example.com" },
});
const answerEdit = questionCalibrationRevision({
  ...sample,
  answers: sample.answers.map((answer, index) => (index === 0 ? `${answer} changed` : answer)),
});
const visibleClueEdit = questionCalibrationRevision({
  ...sample,
  eyebrow: `${sample.eyebrow} changed`,
});
const assetCacheBaseline = questionCalibrationRevision({
  id: "asset-cache-test",
  kind: "fogged-hero",
  prompt: "Who is this?",
  answers: ["A", "B", "C", "D"],
  correctIndex: 0,
  image: { src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/hero.png?t=1" },
});
const assetCacheRefresh = questionCalibrationRevision({
  id: "asset-cache-test",
  kind: "fogged-hero",
  prompt: "Who is this?",
  answers: ["A", "B", "C", "D"],
  correctIndex: 0,
  image: { src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/hero.png?t=2" },
});

if (metadataEdit !== baseline) {
  failures.push("Non-playable metadata unexpectedly resets calibration history.");
}
if (answerEdit === baseline) {
  failures.push("A playable answer change did not create a new calibration revision.");
}
if (visibleClueEdit === baseline) {
  failures.push("A visible question clue did not create a new calibration revision.");
}
if (assetCacheBaseline !== assetCacheRefresh) {
  failures.push("A Steam asset cache timestamp unexpectedly resets calibration history.");
}

if (failures.length) throw new Error(failures.join("\n"));

console.log(`Validated ${revisions.size} stable question calibration revisions.`);
