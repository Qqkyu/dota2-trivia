#!/usr/bin/env node

/**
 * Opens the party picker and fails if a format preview is clipped.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitJson(url, timeout = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Chrome is still binding.
    }
    await delay(100);
  }
  throw new Error(`Chrome debug HTTP did not open at ${url}`);
}

function attachCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let requestId = 0;
  socket.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);
    if (!payload.id) return;
    const request = pending.get(payload.id);
    if (!request) return;
    pending.delete(payload.id);
    if (payload.error) request.reject(new Error(payload.error.message));
    else request.resolve(payload.result);
  });
  function send(method, params = {}) {
    const id = ++requestId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }
  async function waitFor(expression, timeout = 20_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (await evaluate(expression)) return;
      await delay(150);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }
  return {
    socket,
    send,
    evaluate,
    waitFor,
    ready: new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
  };
}

const MEASURE_STAGES = `(() =>
  [...document.querySelectorAll('[data-testid^="format-preview-stage-"]')].map((stage) => {
    const box = stage.getBoundingClientRect();
    return {
      id: stage.getAttribute("data-testid"),
      w: Math.round(box.width),
      h: Math.round(box.height),
    };
  })
)()`;

const port = await freePort();
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-party-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--mute-audio",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-gpu",
    "--window-size=1400,1800",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let page = null;
let browser = null;

async function cleanup() {
  try {
    page?.socket.close();
  } catch {
    // gone
  }
  try {
    browser?.socket.close();
  } catch {
    // gone
  }
  chrome.kill("SIGKILL");
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}

try {
  const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
  browser = attachCdp(version.webSocketDebuggerUrl);
  await browser.ready;
  const created = await browser.send("Target.createTarget", { url: "about:blank" });
  const listed = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = listed.find((entry) => entry.id === created.targetId);
  page = attachCdp(target.webSocketDebuggerUrl);
  await page.ready;
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Page.navigate", { url: `${appUrl}/profile?recordsPreview=short` });
  await page.waitFor(`Boolean(document.querySelector('[data-testid^="format-preview-stage-"]'))`);
  const profileShots = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/profile-previews.png", Buffer.from(profileShots.data, "base64"));
  const profileStages = await page.evaluate(MEASURE_STAGES);
  const profileHeight = profileStages[0]?.h;
  if (!profileHeight) throw new Error("Profile has no format preview stages.");

  await page.send("Page.navigate", { url: appUrl });
  await page.waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`);
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-open"]'))`);
  const box = await page.evaluate(`(() => {
    const play = document.querySelector('[data-testid="start-arcade"]');
    const party = document.querySelector('[data-testid="private-room-open"]');
    if (!play || !party) return null;
    const playBox = play.getBoundingClientRect();
    const partyBox = party.getBoundingClientRect();
    return {
      x: partyBox.x + partyBox.width / 2,
      y: partyBox.y + partyBox.height / 2,
      w: partyBox.width,
      h: Math.round(partyBox.height),
      playH: Math.round(playBox.height),
      playSize: getComputedStyle(play).fontSize,
      partySize: getComputedStyle(party).fontSize,
      playTransform: getComputedStyle(play).textTransform,
      partyTransform: getComputedStyle(party).textTransform,
    };
  })()`);
  if (!box || box.w < 2) throw new Error("Party is not clickable.");
  if (box.h !== box.playH || box.playTransform !== "uppercase" || box.partyTransform !== "uppercase") {
    throw new Error(`Play and Party plaques do not match (${JSON.stringify(box)}).`);
  }
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-setup"]'))`);
  const partyPath = await page.evaluate(`location.pathname + location.search`);
  if (partyPath !== "/party") {
    throw new Error(`Party setup is on ${partyPath}, expected /party.`);
  }
  const createWidth = await page.evaluate(`(() => {
    const button = document.querySelector('[data-testid="private-room-create"]');
    const faces = [...(button?.querySelectorAll("span") ?? [])];
    return {
      faces: faces.length,
      button: button ? Math.round(button.getBoundingClientRect().width) : 0,
      maxFace: faces.reduce((width, face) => Math.max(width, face.getBoundingClientRect().width), 0),
    };
  })()`);
  if (createWidth.faces < 2 || createWidth.button + 1 < Math.round(createWidth.maxFace)) {
    throw new Error(`Create button width jumps (${JSON.stringify(createWidth)}).`);
  }
  await delay(400);
  const shots = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/party-previews.png", Buffer.from(shots.data, "base64"));
  const partyStages = await page.evaluate(MEASURE_STAGES);
  if (!partyStages.length) throw new Error("Party setup rendered no format preview stages.");
  const profileWidth = profileStages[0]?.w;
  const mismatched = partyStages.filter(
    (stage) => Math.abs(stage.h - profileHeight) > 2 || Math.abs(stage.w - profileWidth) > 8,
  );
  if (mismatched.length) {
    console.error(
      mismatched
        .map((stage) => `${stage.id} is ${stage.w}x${stage.h}; profile previews are ${profileWidth}x${profileHeight}.`)
        .join("\n"),
    );
    process.exitCode = 1;
  } else {
    const controls = await page.evaluate(`(() => ({
      join: Boolean(document.querySelector('[data-testid="private-room-join"]')),
      create: Boolean(document.querySelector('[data-testid="private-room-create"]')),
      code: Boolean(document.querySelector('[data-testid="private-room-join-code"]')),
      selected: document.querySelectorAll('[data-on="true"]').length,
    }))()`);
    if (!controls.create || !controls.join || !controls.code) {
      console.error("Party setup must keep Create and Join next to the code field.");
      process.exitCode = 1;
    } else {
      const firstCard = await page.evaluate(`(() => {
        const node = document.querySelector('[data-testid="format-preview-stage-trivia"]')?.closest("button");
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + 24, h: Math.round(rect.height) };
      })()`);
      if (!firstCard) throw new Error("Classic Trivia party card is missing.");
      await page.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: firstCard.x,
        y: firstCard.y,
        button: "left",
        clickCount: 1,
      });
      await page.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: firstCard.x,
        y: firstCard.y,
        button: "left",
        clickCount: 1,
      });
      await delay(200);
      const afterToggle = await page.evaluate(`(() => {
        const node = document.querySelector('[data-testid="format-preview-stage-trivia"]')?.closest("button");
        const rect = node?.getBoundingClientRect();
        return {
          on: node?.getAttribute("data-on"),
          h: rect ? Math.round(rect.height) : 0,
        };
      })()`);
      if (afterToggle.on !== "false") {
        console.error(`Classic Trivia stayed selected after click (data-on=${afterToggle.on}).`);
        process.exitCode = 1;
      } else if (afterToggle.h !== firstCard.h) {
        console.error(`Selecting a game shifted the card from ${firstCard.h}px to ${afterToggle.h}px.`);
        process.exitCode = 1;
      } else {
        const enterBox = await page.evaluate(`(() => {
          const node = document.querySelector('[data-testid="private-room-create"]');
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()`);
        await page.send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x: enterBox.x,
          y: enterBox.y,
          button: "left",
          clickCount: 1,
        });
        await page.send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: enterBox.x,
          y: enterBox.y,
          button: "left",
          clickCount: 1,
        });
        await delay(200);
        const emptyEnter = await page.evaluate(`(() => {
          const input = document.querySelector('[data-testid="private-room-join-code"]');
          const error = document.querySelector('[data-testid="private-room-error"]');
          if (!input || !error) return { ok: false, reason: "missing" };
          const inputBox = input.getBoundingClientRect();
          const errorBox = error.getBoundingClientRect();
          return {
            ok:
              document.activeElement === input &&
              input.getAttribute("data-invalid") === "true" &&
              errorBox.top + 1 >= inputBox.bottom &&
              /type a party code/i.test(error.textContent ?? ""),
            focused: document.activeElement === input,
            invalid: input.getAttribute("data-invalid"),
            error: error.textContent,
            gap: Math.round(errorBox.top - inputBox.bottom),
          };
        })()`);
        if (!emptyEnter.ok) {
          console.error(`Empty Enter did not highlight the code field (${JSON.stringify(emptyEnter)}).`);
          process.exitCode = 1;
        } else {
          const fill = async (testid, value) => {
            await page.evaluate(`(() => {
              const input = document.querySelector('[data-testid="${testid}"]');
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
              setter.call(input, ${JSON.stringify(value)});
              input.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
          };
          const clickEnter = async () => {
            await page.send("Input.dispatchMouseEvent", {
              type: "mousePressed",
              x: enterBox.x,
              y: enterBox.y,
              button: "left",
              clickCount: 1,
            });
            await page.send("Input.dispatchMouseEvent", {
              type: "mouseReleased",
              x: enterBox.x,
              y: enterBox.y,
              button: "left",
              clickCount: 1,
            });
          };
          await page.evaluate(`(() => {
            for (const card of document.querySelectorAll('[data-on="true"]')) card.click();
          })()`);
          await fill("private-room-join-code", "NOCAT");
          await delay(100);
          await clickEnter();
          await delay(250);
          const noGames = await page.evaluate(
            `document.querySelector('[data-testid="private-room-error"]')?.textContent`,
          );
          if (!/pick at least one game/i.test(noGames ?? "")) {
            console.error(`Zero games still entered a party (${noGames}).`);
            process.exitCode = 1;
          } else {
            await page.evaluate(
              `document.querySelector('[data-testid="format-preview-stage-trivia"]')?.closest("button")?.click()`,
            );
            const partyCode = `H${Date.now().toString(36).slice(-5).toUpperCase()}`;
            await fill("private-room-join-code", partyCode);
            await delay(100);
            await clickEnter();
            await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-wait"]'))`);
            await delay(200);
            const autoName = await page.evaluate(`(() => ({
            name: document.querySelector('[data-testid="private-room-name"]')?.value ?? "",
            pen: Boolean(document.querySelector('[data-testid="private-room-name-pen"]')),
            penCursor: document.querySelector('[data-testid="private-room-name-pen"]')
              ? getComputedStyle(document.querySelector('[data-testid="private-room-name-pen"]')).cursor
              : "",
          }))()`);
            if (!autoName.name.trim() || !autoName.pen || autoName.penCursor !== "pointer") {
              console.error(`Wait name is blank or missing a pen cue (${JSON.stringify(autoName)}).`);
              process.exitCode = 1;
            } else {
              await fill("private-room-name", "Loda");
              const keptFocus = await page.evaluate(`(() => {
            const input = document.querySelector('[data-testid="private-room-name"]');
            input.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            setter.call(input, "LodaX");
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return document.activeElement === input && input.value === "LodaX";
          })()`);
              await delay(80);
              const stillFocused = await page.evaluate(
                `document.activeElement === document.querySelector('[data-testid="private-room-name"]')`,
              );
              const copyBox = await page.evaluate(`(() => {
            const button = [...document.querySelectorAll("button")].find((node) => /copy link|copied/i.test(node.textContent ?? ""));
            if (!button) return null;
            const width = Math.round(button.getBoundingClientRect().width);
            button.click();
            return { width, after: Math.round(button.getBoundingClientRect().width) };
          })()`);
              await delay(80);
              await page.evaluate(`document.querySelector('[data-testid="private-room-chat-toggle"]')?.click()`);
              await delay(80);
              const chatHidden = await page.evaluate(`!document.querySelector('[data-testid="private-room-chat"]')`);
              const waitShots = await page.send("Page.captureScreenshot", { format: "png" });
              await writeFile("/tmp/party-wait.png", Buffer.from(waitShots.data, "base64"));
              const entered = await page.evaluate(`(() => {
            const rows = [...document.querySelectorAll('[data-testid="private-room-players"] li')];
            const first = rows[0];
            const start = document.querySelector('[data-testid="private-room-start"]');
            return {
              ticket: document.querySelector('[data-testid="private-room-code"]')?.textContent?.trim(),
              path: location.pathname + location.search,
              firstSelf: first?.getAttribute("data-self") === "true",
              firstEditable: Boolean(first?.querySelector('[data-testid="private-room-name"]')),
              name: first?.querySelector('[data-testid="private-room-name"]')?.value ?? "",
              canStart: Boolean(start),
            };
          })()`);
              if (entered.path !== `/play?room=${partyCode}`) {
                console.error(`Entering opened ${entered.path}, expected /play?room=${partyCode}.`);
                process.exitCode = 1;
              } else if (!keptFocus || !stillFocused) {
                console.error("Typing a party name lost input focus.");
                process.exitCode = 1;
              } else if (!copyBox || copyBox.width !== copyBox.after) {
                console.error(`Copy link changed width (${JSON.stringify(copyBox)}).`);
                process.exitCode = 1;
              } else if (!chatHidden) {
                console.error("Chat did not hide.");
                process.exitCode = 1;
              } else if (!entered.firstSelf || !entered.firstEditable) {
                console.error(`Your name is not the first editable player row (${JSON.stringify(entered)}).`);
                process.exitCode = 1;
              } else if (entered.canStart) {
                await page.evaluate(`document.querySelector('[data-testid="private-room-start"]')?.click()`);
                await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-countdown"]'))`, 4_000);
                const counting = await page.evaluate(
                  `Boolean(document.querySelector('[data-testid="round-entry-wait"]'))`,
                );
                if (counting) {
                  console.error("Private Start opened the public wait-for-next-question screen.");
                  process.exitCode = 1;
                } else {
                  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-ranking"]'))`, 8_000);
                  const afterStart = await page.evaluate(`({
                entryWait: Boolean(document.querySelector('[data-testid="round-entry-wait"]')),
                ranking: Boolean(document.querySelector('[data-testid="private-room-ranking"]')),
                names: [...document.querySelectorAll('[data-testid="private-room-ranking"] strong')].map((node) => node.textContent?.trim() ?? ""),
              })`);
                  if (afterStart.entryWait) {
                    console.error("Private Start opened the public wait-for-next-question screen.");
                    process.exitCode = 1;
                  } else if (!afterStart.ranking || afterStart.names.some((name) => !name)) {
                    console.error("Private play has no named ranking.");
                    process.exitCode = 1;
                  } else {
                    const dock = await page.evaluate(`(() => {
                  const chat = document.querySelector('[data-testid="private-room-chat"]');
                  const toggle = document.querySelector('[data-testid="private-room-chat-toggle"]');
                  if (!chat || !toggle) return { ok: false };
                  const chatBox = chat.getBoundingClientRect();
                  const toggleBox = toggle.getBoundingClientRect();
                  return { ok: toggleBox.top + 1 >= chatBox.bottom, chatTop: chatBox.top, toggleTop: toggleBox.top };
                })()`);
                    if (!dock.ok) {
                      console.error(`Play chat toggle is not under the chat box (${JSON.stringify(dock)}).`);
                      process.exitCode = 1;
                    } else {
                      const answer = await page.evaluate(`(() => {
                    const node = document.querySelector('[data-testid="arcade-answer"]:not([disabled]), [data-testid="hero-picker-hero"], [data-testid="shopkeeper-store-item"], [data-testid="value-order-card"]');
                    if (!node) return null;
                    const rect = node.getBoundingClientRect();
                    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                  })()`);
                      if (answer) {
                        await page.send("Input.dispatchMouseEvent", {
                          type: "mousePressed",
                          x: answer.x,
                          y: answer.y,
                          button: "left",
                          clickCount: 1,
                        });
                        await page.send("Input.dispatchMouseEvent", {
                          type: "mouseReleased",
                          x: answer.x,
                          y: answer.y,
                          button: "left",
                          clickCount: 1,
                        });
                      }
                      await page.waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`, 20_000);
                      const scored = await page.evaluate(`(() => {
                    const names = document.querySelectorAll('[data-testid="private-room-ranking"] strong');
                    const scores = document.querySelectorAll('[data-testid="private-room-ranking"] em');
                    return names.length > 0 && names.length === scores.length;
                  })()`);
                      if (!scored) {
                        console.error("Private ranking has no scores after a round.");
                        process.exitCode = 1;
                      } else {
                        const rematchBefore = await page.evaluate(`(() => {
                    const slot = document.querySelector('[data-testid="private-room-rematch-slot"]');
                    const button = document.querySelector('[data-testid="private-room-rematch"]');
                    const ranking = document.querySelector('[data-testid="private-room-ranking"]');
                    if (!slot || !button || !ranking) return null;
                    const slotBox = slot.getBoundingClientRect();
                    const buttonBox = button.getBoundingClientRect();
                    const rankBox = ranking.getBoundingClientRect();
                    return {
                      slotH: Math.round(slotBox.height),
                      w: Math.round(buttonBox.width),
                      h: Math.round(buttonBox.height),
                      x: buttonBox.x + buttonBox.width / 2,
                      y: buttonBox.y + buttonBox.height / 2,
                      underRank: slotBox.top + 1 >= rankBox.bottom,
                    };
                  })()`);
                        if (!rematchBefore?.underRank || rematchBefore.slotH < 52) {
                          console.error(
                            `Rematch slot is missing or jumps the ranking (${JSON.stringify(rematchBefore)}).`,
                          );
                          process.exitCode = 1;
                        } else {
                          await page.send("Input.dispatchMouseEvent", {
                            type: "mousePressed",
                            x: rematchBefore.x,
                            y: rematchBefore.y,
                            button: "left",
                            clickCount: 1,
                          });
                          await page.send("Input.dispatchMouseEvent", {
                            type: "mouseReleased",
                            x: rematchBefore.x,
                            y: rematchBefore.y,
                            button: "left",
                            clickCount: 1,
                          });
                          await page.waitFor(
                            `Boolean(document.querySelector('[data-testid="private-room-countdown"]'))`,
                            4_000,
                          );
                          await page.waitFor(
                            `Boolean(document.querySelector('[data-testid="private-room-ranking"]'))`,
                            8_000,
                          );
                          const rematchAfter = await page.evaluate(`(() => {
                    const scores = [...document.querySelectorAll('[data-testid="private-room-ranking"] em')].map((node) => node.textContent?.trim() ?? "");
                    const slot = document.querySelector('[data-testid="private-room-rematch-slot"]');
                    const button = document.querySelector('[data-testid="private-room-rematch"]');
                    const ranking = document.querySelector('[data-testid="private-room-ranking"]');
                    if (!slot || !button || !ranking) return { scores };
                    const slotBox = slot.getBoundingClientRect();
                    const buttonBox = button.getBoundingClientRect();
                    const rankBox = ranking.getBoundingClientRect();
                    return {
                      scores,
                      slotH: Math.round(slotBox.height),
                      w: Math.round(buttonBox.width),
                      h: Math.round(buttonBox.height),
                      underRank: slotBox.top + 1 >= rankBox.bottom,
                    };
                  })()`);
                          if (rematchAfter.scores.some((score) => score !== "0")) {
                            console.error(`Rematch did not zero the ranking (${JSON.stringify(rematchAfter.scores)}).`);
                            process.exitCode = 1;
                          } else if (
                            rematchAfter.w !== rematchBefore.w ||
                            rematchAfter.h !== rematchBefore.h ||
                            rematchAfter.slotH !== rematchBefore.slotH ||
                            !rematchAfter.underRank
                          ) {
                            console.error(`Rematch button moved (${JSON.stringify({ rematchBefore, rematchAfter })}).`);
                            process.exitCode = 1;
                          } else {
                            console.log(
                              `Validated ${partyStages.length} party previews match the ${profileWidth}x${profileHeight} profile crop. ${controls.selected} games selected.`,
                            );
                          }
                        }
                      }
                    }
                  }
                }
              } else {
                console.log(
                  `Validated ${partyStages.length} party previews match the ${profileWidth}x${profileHeight} profile crop. ${controls.selected} games selected.`,
                );
              }
            }
          }
        }
      }
    }
  }
} finally {
  await cleanup();
}
