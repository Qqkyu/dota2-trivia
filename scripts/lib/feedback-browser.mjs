import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      // Chrome is still binding the port.
    }
    await delay(100);
  }
  throw new Error(`Chrome debug HTTP did not open at ${url}`);
}

function attachCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  const eventWaiters = new Map();
  let requestId = 0;

  socket.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);
    if (payload.id) {
      const request = pending.get(payload.id);
      if (!request) return;
      pending.delete(payload.id);
      if (payload.error) request.reject(new Error(payload.error.message));
      else request.resolve(payload.result);
      return;
    }
    const waiters = eventWaiters.get(payload.method);
    if (waiters?.length) {
      eventWaiters.delete(payload.method);
      for (const resolve of waiters) resolve(payload.params);
    }
  });

  function send(method, params = {}) {
    const id = ++requestId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  function once(method) {
    return new Promise((resolve) => {
      const waiters = eventWaiters.get(method) ?? [];
      waiters.push(resolve);
      eventWaiters.set(method, waiters);
    });
  }

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async function waitFor(expression, timeout = 30_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (await evaluate(expression)) return;
      await delay(20);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }

  return {
    socket,
    send,
    once,
    evaluate,
    waitFor,
    ready: new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
  };
}

export async function soundBrowser({ muteAudio = true, env = process.env } = {}) {
  const port = await freePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-sounds-"));
  const chrome = spawn(
    process.env.CHROME_BIN ?? "google-chrome",
    [
      "--headless=new",
      ...(muteAudio ? ["--mute-audio"] : []),
      `--remote-debugging-port=${port}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--disable-gpu",
      "--window-size=1400,1000",
      "about:blank",
    ],
    { stdio: "ignore", env },
  );
  let launchError;
  chrome.on("error", (error) => {
    launchError = error;
  });
  let browser, page;
  const pages = [];
  async function close() {
    for (const tab of pages) tab.socket.close();
    browser?.socket.close();
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    if (chrome.exitCode === null && !launchError) {
      chrome.kill("SIGKILL");
      await exited;
    }
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  try {
    const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
    browser = attachCdp(version.webSocketDebuggerUrl);
    await browser.ready;
    async function newPage() {
      const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
      const targets = await waitJson(`http://127.0.0.1:${port}/json/list`);
      const tab = attachCdp(targets.find((target) => target.id === targetId).webSocketDebuggerUrl);
      pages.push(tab);
      await tab.ready;
      await tab.send("Page.enable");
      await tab.send("Runtime.enable");
      await tab.send("Network.enable");
      // Block all real API traffic, including writes and beacons.
      await tab.send("Network.setBlockedURLs", { urls: ["*/api/*"] });
      return { page: tab, targetId };
    }
    const first = await newPage();
    page = first.page;
    return { browser, page, targetId: first.targetId, newPage, close };
  } catch (error) {
    await close();
    throw launchError ?? error;
  }
}

export async function click(page, selector, index = 0) {
  const box = await page.evaluate(`(() => {
    const node = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!node || node.disabled) throw new Error("Missing/enabled control: " + ${JSON.stringify(selector)});
    node.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...box, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...box, button: "left", clickCount: 1 });
}

export async function press(page, key, code = key, windowsVirtualKeyCode = 13) {
  const params = { key, code, windowsVirtualKeyCode };
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", ...params });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
}
