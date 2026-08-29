#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const [lookCss, arcadeCss, partyCss] = await Promise.all([
  readFile(path.join(root, "src/components/format-look.module.css"), "utf8"),
  readFile(path.join(root, "src/components/queue-arcade.module.css"), "utf8"),
  readFile(path.join(root, "src/components/private-room-panel.module.css"), "utf8"),
]);

const failures = [];
const record = (ok, message) => {
  if (!ok) failures.push(message);
};

const stageHeight = Number(arcadeCss.match(/\.gameStage \{[\s\S]*?min-height:\s*(\d+)px/)?.[1]);
const stageWidth = Number(lookCss.match(/\.scale \{[\s\S]*?width:\s*(\d+)px/)?.[1]);
const lookSource = await readFile(path.join(root, "src/components/format-look.tsx"), "utf8");

record(stageHeight === 704, `Round stage height is ${stageHeight}, expected 704.`);
record(stageWidth === 920, `Preview stage width is ${stageWidth}, expected 920.`);
record(
  lookSource.includes("ResizeObserver") && lookSource.includes("PREVIEW_STAGE_HEIGHT * scale"),
  "Party previews still use a fixed CSS scale, so the question is clipped.",
);
record(
  /\.fit \.stage \{[\s\S]*?min-height:\s*704px/.test(lookCss),
  "Fit previews still collapse the round stage, so the question is clipped.",
);

const selected = partyCss.match(/\.gameCard\[data-on="true"\] \{([\s\S]*?)\}/)?.[1] ?? "";
record(
  /border:\s*2px solid\s*#c4a46a/.test(selected),
  "Selected game cards still use a faint border. Use a solid 2px gold edge.",
);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Validated party game previews fit the round stage and selected cards read clearly.");
