#!/usr/bin/env node
// Check a real Orca run captured by the isolated assistive session.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const evidence = process.argv[2];
assert.ok(evidence, "Usage: node scripts/check-orca-round.mjs <session-directory> [--external]");
const [resultText, debug] = await Promise.all([
  readFile(join(evidence, "app-results.json"), "utf8"),
  readFile(join(evidence, "orca-debug.log"), "utf8"),
]);
const result = JSON.parse(resultText);
assert.equal(result.completed, true, "The reader scenario must finish");
assert.deepEqual(result.errors, [], "The reader scenario must have no page or driver errors");
const event = (label) => {
  const found = result.events.find((entry) => entry.label === label);
  assert.ok(found, `Missing scenario event: ${label}`);
  return found;
};
const before = event("classic before next round");
const after = event("classic next round");
const prompt = after.state.prompt;
assert.ok(prompt, "The next round must have a question prompt");
const date = result.startedAt.slice(0, 10);
const spoken = debug.split("\n").flatMap((line) => {
  const match = line.match(/^(\d{2}:\d{2}:\d{2}\.\d+) - SPEECH OUTPUT: (['"])(.*?)\2 \{/);
  if (!match) return [];
  const at = Date.parse(`${date}T${match[1]}Z`);
  return at >= before.at && at <= after.at ? [match[3]] : [];
});
assert.equal(
  spoken.filter((text) => text.includes(prompt)).length,
  1,
  `Orca must request the new prompt exactly once. Captured speech: ${JSON.stringify(spoken)}`,
);
const expectedFocus = process.argv.includes("--external") ? "game-volume" : "round-heading";
assert.equal(after.state.focus.testid, expectedFocus, "The round must preserve or recover the expected focus");
assert.equal(event("next round first Tab").state.focus.testid, "flashback-year-slider");
console.log(`PASS Orca prompt once, ${expectedFocus} focus, and native Tab to Year in ${result.browser}`);
