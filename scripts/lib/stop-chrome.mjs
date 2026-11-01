import { rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

/**
 * Stops a headless Chrome and deletes its profile folder.
 *
 * Chrome's helper processes keep writing to the profile for a moment after the
 * browser process is killed. A delete that runs at once fails on the files they
 * add, and the folder stays in /tmp (about 15 folders per gate run before this
 * helper). So wait for the exit, then let `rm` retry.
 *
 * @param {import("node:child_process").ChildProcess} chrome
 * @param {string} userDataDir
 */
export async function stopChrome(chrome, userDataDir) {
  if (chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill("SIGKILL");
    await Promise.race([exited, delay(5_000, undefined, { ref: false })]);
  }
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => undefined);
}
