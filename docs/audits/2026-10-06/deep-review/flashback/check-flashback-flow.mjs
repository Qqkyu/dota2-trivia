import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publicQuestionForRound } from "../../../../../src/lib/public-question.mjs";
import {
  flashbackOrderAnswerIndex,
  flashbackOrderCorrectAnswerKey,
  flashbackYearAnswerIndex,
  flashbackYearCorrectAnswerKey,
} from "../../../../../src/lib/flashback.mjs";
import { questionCalibrationRevision } from "../../../../../src/lib/question-revision.mjs";
const questions = JSON.parse(
  await readFile(new URL("../../../../../src/data/flashback-questions.json", import.meta.url), "utf8"),
);
const before = JSON.parse(await readFile(new URL("./flashback-before.json", import.meta.url), "utf8"));
const ledger = JSON.parse(await readFile(new URL("./flashback-ledger.json", import.meta.url), "utf8"));
const now = Date.UTC(2026, 9, 6, 12);
const changes = [];
for (const q of questions) {
  const prior = before.find((x) => x.id === q.id);
  assert.ok(prior, q.id);
  const row = ledger.find((x) => x.id === q.id);
  assert.ok(
    row && row.claimChecked.prompt === q.prompt && row.claimChecked.explanation === q.explanation,
    `${q.id}: ledger must describe the current record`,
  );
  assert.deepEqual(q.answers, prior.answers, `${q.id}: no unintended answer replacement`);
  assert.equal(q.correctIndex, prior.correctIndex);
  assert.equal(q.patch, prior.patch);
  const round = {
    id: "flashback-review",
    game: "flashback",
    phase: "answering",
    answerDeadline: now + 15000,
    answerDuration: 15000,
  };
  const answering = publicQuestionForRound(q, round, now);
  assert.equal(answering.reveal, null);
  assert.equal(answering.prompt, q.prompt);
  assert.ok(!("source" in answering));
  assert.ok(!("explanation" in answering));
  assert.ok(!("correctYear" in (answering.flashback ?? {})));
  assert.ok(!("correctOrder" in (answering.flashback ?? {})));
  const reveal = publicQuestionForRound(q, { ...round, phase: "reveal" }, now);
  assert.equal(reveal.reveal.explanation, q.explanation);
  assert.equal(reveal.reveal.correctIndex, q.correctIndex);
  if (q.kind === "flashback-year") {
    const key = flashbackYearCorrectAnswerKey(q);
    assert.equal(reveal.reveal.correctAnswerKey, key);
    assert.equal(flashbackYearAnswerIndex(q, key, now), q.correctIndex);
    const otherYear = q.flashback.correctYear === 2009 ? 2010 : 2009;
    assert.notEqual(flashbackYearAnswerIndex(q, `year-v1:${otherYear}`, now), q.correctIndex);
  } else if (q.kind === "flashback-order") {
    const key = flashbackOrderCorrectAnswerKey(q);
    assert.equal(reveal.reveal.correctAnswerKey, key);
    assert.equal(flashbackOrderAnswerIndex(q, key), q.correctIndex);
    for (const wrong of q.answers.filter((x) => x !== key))
      assert.notEqual(flashbackOrderAnswerIndex(q, wrong), q.correctIndex);
    assert.deepEqual(
      reveal.flashback.cards.map((c) => c.name),
      q.flashback.cards.map((c) => c.name),
    );
  } else {
    assert.equal(reveal.answers[reveal.reveal.correctIndex], q.answers[q.correctIndex]);
  }
  if (questionCalibrationRevision(q) !== questionCalibrationRevision(prior)) changes.push(q.id);
}
assert.equal(questions.length, 191);
assert.equal(ledger.length, 191);
assert.equal(questions.find((q) => q.id === "flashback:flying-courier-gone").answers[1], "Animal Courier");
assert.deepEqual(
  changes,
  JSON.parse(await readFile(new URL("./flashback-calibration-changes.json", import.meta.url), "utf8")),
);
console.log(
  JSON.stringify({
    checked: questions.length,
    families: Object.fromEntries(
      ["choice", "year", "order"].map((f) => [f, questions.filter((q) => q.flashback.family === f).length]),
    ),
    calibrationChanges: changes.length,
    answerKeysChanged: 0,
    ledgerComplete: true,
  }),
);
