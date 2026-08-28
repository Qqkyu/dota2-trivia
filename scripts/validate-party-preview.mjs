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
const fitRatio = lookCss.match(/\.fit \{[\s\S]*?aspect-ratio:\s*(\d+)\s*\/\s*(\d+)/);
const fitWidth = Number(fitRatio?.[1]);
const fitHeight = Number(fitRatio?.[2]);

record(stageHeight === 704, `Round stage height is ${stageHeight}, expected 704.`);
record(stageWidth === 920, `Preview stage width is ${stageWidth}, expected 920.`);
record(
  fitWidth === stageWidth && fitHeight === stageHeight,
  `Party previews crop the round. Fit box is ${fitWidth}/${fitHeight}; the stage is ${stageWidth}/${stageHeight}.`,
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
