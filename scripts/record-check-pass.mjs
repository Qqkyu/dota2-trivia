#!/usr/bin/env node
// The last step of `pnpm check`: remember which tree passed, so `pnpm run deploy:production`
// can refuse a commit nobody tested. Untracked files do not count as changes.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const tree = git("rev-parse", "HEAD^{tree}");
const dirty = git("status", "--porcelain", "--untracked-files=no").length > 0;
writeFileSync(
  ".check-pass.json",
  `${JSON.stringify({ commit, tree, dirty, at: new Date().toISOString() }, null, 2)}\n`,
);
console.log(
  dirty
    ? `The gate passed with uncommitted changes, so ${commit.slice(0, 7)} is not recorded as tested.`
    : `Recorded the passing gate for ${commit.slice(0, 7)}.`,
);
