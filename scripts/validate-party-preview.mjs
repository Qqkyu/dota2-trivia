#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const [lookCss, arcadeCss, partyCss, arcadeSource] = await Promise.all([
  readFile(path.join(root, "src/components/format-look.module.css"), "utf8"),
  readFile(path.join(root, "src/components/queue-arcade.module.css"), "utf8"),
  readFile(path.join(root, "src/components/private-room-panel.module.css"), "utf8"),
  readFile(path.join(root, "src/components/queue-arcade.tsx"), "utf8"),
]);

const failures = [];
const record = (ok, message) => {
  if (!ok) failures.push(message);
};

const stageHeight = Number(arcadeCss.match(/\.gameStage \{[\s\S]*?min-height:\s*(\d+)px/)?.[1]);
const stageWidth = Number(lookCss.match(/\.scale \{[\s\S]*?width:\s*(\d+)px/)?.[1]);
const [partySource, cardSource, profileRecordsSource, profileCss, roomsSource] = await Promise.all([
  readFile(path.join(root, "src/components/private-room-panel.tsx"), "utf8"),
  readFile(path.join(root, "src/components/format-preview-card.tsx"), "utf8"),
  readFile(path.join(root, "src/components/profile-records.tsx"), "utf8"),
  readFile(path.join(root, "src/app/profile/profile.module.css"), "utf8"),
  readFile(path.join(root, "src/lib/private-rooms.mjs"), "utf8"),
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
  partySource.includes('data-testid="private-room-create"') &&
    /data-testid="private-room-join"(?!-code)/.test(partySource) &&
    !partySource.includes("Create party") &&
    !partySource.includes('data-testid="private-room-enter"') &&
    !partySource.includes("canJoin") &&
    partySource.includes("That code is taken.") &&
    partySource.includes("No party with that code.") &&
    partySource.includes("peek=1"),
  "Create and Join are two doors. Create cannot join. Join cannot create.",
);
const setupSource = partySource.slice(partySource.indexOf("private-room-setup"));
record(
  partySource.includes('data-testid="private-room-error"') &&
    partySource.includes("data-invalid") &&
    setupSource.indexOf("private-room-join-code") < setupSource.indexOf("private-room-create") &&
    setupSource.indexOf("private-room-create") < setupSource.indexOf('data-testid="private-room-join"') &&
    setupSource.indexOf('data-testid="private-room-join"') < setupSource.indexOf("private-room-error"),
  "Code errors must sit on the code field under Create and Join.",
);
record(
  partySource.includes("enterFace") &&
    partyCss.includes(".enterFace") &&
    /visibility:\s*hidden/.test(partyCss) &&
    partySource.includes("Creating") &&
    partySource.includes("Joining"),
  "Create and Join must keep idle and busy labels stacked so the button width does not jump.",
);
record(
  partySource.includes('data-testid="private-room-name"') &&
    partySource.includes("data-self") &&
    partySource.includes('data-testid="private-room-players"') &&
    partySource.includes("Pencil") &&
    partySource.includes("partyNameInputValue") &&
    !partySource.includes("styles.topbar") &&
    !partySource.includes("styles.nameField") &&
    !partySource.includes("styles.ticket"),
  "Your name must be the first editable row, show the auto name, and carry a pen cue.",
);
record(/justify-items:\s*center/.test(partyCss) && /\.lobby \{/.test(partyCss), "The wait lobby must be centered.");
record(
  partySource.includes("beforeunload") &&
    partySource.includes("sendBeacon") &&
    partySource.includes("PRIVATE_ROOM_POLL_MS"),
  "Closing a tab must send leave at once, and the wait list must poll faster than 4s.",
);
record(
  partySource.includes('? "self"') &&
    partySource.includes("nameRef") &&
    !partySource.includes("requestRoom, shownName, trackedCode"),
  "Typing a name must not remount the input or restart the room poll.",
);
record(
  /cursor:\s*pointer/.test(partyCss) && partySource.includes("private-room-name-pen"),
  "The name pen must use a pointer cursor.",
);
record(
  partySource.includes("copied ?") &&
    partySource.includes("<Check") &&
    partySource.includes("private-room-copied") &&
    !partySource.includes("Copied</"),
  "Copy link must swap to a checkmark, not a Copied label.",
);
const chatToggleCss = partyCss.match(/\.chatToggle \{([\s\S]*?)\}/)?.[1] ?? "";
record(
  partySource.includes("private-room-chat-toggle") &&
    partySource.includes("private-room-ranking") &&
    partySource.includes("chatToggleFace") &&
    partySource.includes("MessageSquare") &&
    partySource.includes("chatSlot") &&
    partyCss.includes(".chatToggleFace") &&
    partyCss.includes(".chatSlot") &&
    /visibility:\s*hidden/.test(partyCss) &&
    /border:\s*1px solid/.test(chatToggleCss) &&
    !/border:\s*0/.test(chatToggleCss) &&
    /!room.waiting/.test(partySource),
  "Hide chat must keep one width, keep an icon, and not move ranking or the button in play.",
);
record(
  partySource.includes("private-room-countdown") &&
    !partySource.includes("Starting…") &&
    partyCss.includes(".countdown"),
  "Start must show a 3s countdown, not a fake Starting label.",
);
const chatPanelSource = partySource.slice(partySource.indexOf("const chatPanel"));
record(
  chatPanelSource.indexOf("chatSlot") < chatPanelSource.indexOf("private-room-chat-toggle"),
  "Hide chat must sit under the chat box, not above ranking.",
);
record(
  !roomsSource.includes("function pruneMembers") &&
    !roomsSource.includes("function pruneStaleMembers") &&
    roomsSource.includes("function markAwayMembers"),
  "Idle or background tabs must not prune party members. Only Leave removes them; silence marks a player away.",
);
record(
  arcadeSource.includes("if (!privateCode)") &&
    arcadeSource.includes("entryWaitRoundIdRef.current = result.snapshot.round.id"),
  "Private Start must skip the public wait-for-next-question screen.",
);
record(
  arcadeSource.includes("sessionStorage") && partySource.includes("storedPartyNameDraft"),
  "Each tab must be its own guest, and an empty saved nick must not hide the host seed name.",
);
record(
  partySource.includes("syncName") &&
    partySource.includes("onBlur") &&
    partySource.includes("committedNameRef") &&
    partySource.includes("nameEditingRef") &&
    partySource.includes("partyNameSeed") &&
    partySource.includes("adoptServerName") &&
    !partySource.includes("&name=${encodeURIComponent(committedNameRef"),
  "The room owns the nick. A taken name must revert. Presence polls must not send the old nick while typing.",
);
const nameErrorCss = partyCss.match(/\.nameError \{([\s\S]*?)\}/)?.[1] ?? "";
record(
  partySource.includes("private-room-name-error") &&
    partySource.includes("PRIVATE_ROOM_NAME_NOTICE_MS") &&
    partySource.includes("flashNameNotice") &&
    /position:\s*absolute/.test(nameErrorCss) &&
    !/position:\s*relative/.test(nameErrorCss) &&
    !partySource.includes('data-invalid={errorField === "name"'),
  "That name is taken must overlay the name row, fade out, and not mark the reverted nick as wrong.",
);
record(
  !arcadeSource.includes("initialCode={roomCode || activePrivateCode") &&
    arcadeSource.includes("partyInviteCode") &&
    arcadeSource.includes("setPartyInviteCode"),
  "Leave and Play with friends must open a fresh party setup, not the last room code from the page props.",
);
record(
  partySource.includes("chatShell") && partySource.includes("private-room-host-wait"),
  "Chat toggle must sit on the chat box, and guest wait must use the Start slot.",
);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Validated party game previews fit the round stage and selected cards read clearly.");
