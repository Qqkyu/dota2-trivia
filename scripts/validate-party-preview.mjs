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
const [partySource, cardSource, profileRecordsSource, profileCss] = await Promise.all([
  readFile(path.join(root, "src/components/private-room-panel.tsx"), "utf8"),
  readFile(path.join(root, "src/components/format-preview-card.tsx"), "utf8"),
  readFile(path.join(root, "src/components/profile-records.tsx"), "utf8"),
  readFile(path.join(root, "src/app/profile/profile.module.css"), "utf8"),
]);

record(stageHeight === 704, `Round stage height is ${stageHeight}, expected 704.`);
record(stageWidth === 920, `Preview stage width is ${stageWidth}, expected 920.`);
record(
  cardSource.includes('from "../app/profile/profile.module.css"') &&
    cardSource.includes("styles.previewStage") &&
    cardSource.includes("<FormatLook"),
  "Format preview cards must keep the profile crop.",
);
record(
  partySource.includes("FormatPreviewCard") &&
    partySource.includes("@/components/format-preview-card") &&
    !partySource.includes("fit") &&
    !partySource.includes("FormatLook"),
  "Party game cards must use FormatPreviewCard, not a custom scaler.",
);
record(
  profileRecordsSource.includes("FormatPreviewCard") &&
    profileRecordsSource.includes("@/components/format-preview-card"),
  "Profile records must use the same FormatPreviewCard as party setup.",
);
record(/\.previewStage \{[\s\S]*?height:\s*132px/.test(profileCss), "Profile preview crop is no longer 132px.");

const idleCard = partyCss.match(/\.gameCard \{([\s\S]*?)\}/)?.[1] ?? "";
const selected = partyCss.match(/\.gameCard\[data-on="true"\] \{([\s\S]*?)\}/)?.[1] ?? "";
record(
  /border:\s*2px solid/.test(idleCard) && /border:\s*2px solid\s*#c4a46a/.test(selected),
  "Idle and selected game cards must both use a 2px border so the card does not shift.",
);
record(
  partySource.includes('data-testid="private-room-enter"') &&
    !partySource.includes("Create party") &&
    !/data-testid="private-room-create"/.test(partySource) &&
    !/data-testid="private-room-join"(?!-code)/.test(partySource),
  "Party setup must use one Enter action, not Create party plus Join.",
);
record(
  partySource.includes('data-testid="private-room-error"') &&
    partySource.includes("data-invalid") &&
    partySource.indexOf("private-room-join-code") < partySource.indexOf("private-room-enter") &&
    partySource.indexOf("private-room-enter") < partySource.indexOf("private-room-error"),
  "Code errors must sit on the code field under the games, not above a Create party button.",
);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Validated party game previews fit the round stage and selected cards read clearly.");
