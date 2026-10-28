import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { AUDIO_HOSTS, AUDIO_TYPES, fetchMedia } from "../src/lib/media-fetch.mjs";

/**
 * Measure every round clip once (EBU R128 integrated loudness via ffmpeg) and
 * record the gain that brings it down to the feedback cues' level. Game sounds
 * from the VPK sit around -17 LUFS at 0 dBFS peaks; the cues sit near -23 LUFS.
 * The client multiplies its volume by the gain, so a clip is only ever made
 * quieter, never louder. Reuses stored values unless --refresh is given.
 */
const TARGET_LUFS = -23;
const OUTPUT = "src/data/audio-loudness.json";
const refresh = process.argv.includes("--refresh");

const sources = new Set();
const soundcheck = JSON.parse(await readFile("src/data/soundcheck-questions.json", "utf8"));
for (const question of soundcheck) {
  if (question.audio?.src) sources.add(question.audio.src);
  for (const clip of question.audio?.clips ?? []) sources.add(typeof clip === "string" ? clip : clip?.src);
}
const generated = JSON.parse(await readFile("src/data/questions.generated.json", "utf8"));
for (const question of Array.isArray(generated) ? generated : generated.questions) {
  if (question.audio?.src) sources.add(question.audio.src);
}
sources.delete(undefined);
sources.delete(null);

const existing = await readFile(OUTPUT, "utf8")
  .then((text) => JSON.parse(text))
  .catch(() => ({ clips: {} }));

function measureLufs(buffer, contentType) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-nostats",
        "-hide_banner",
        "-f",
        contentType === "audio/mpeg" ? "mp3" : "wav",
        "-i",
        "pipe:0",
        "-af",
        "ebur128",
        "-f",
        "null",
        "-",
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", () => {
      const matches = [...stderr.matchAll(/I:\s+(-?[\d.]+)\s+LUFS/g)];
      const last = matches.length ? Number(matches[matches.length - 1][1]) : NaN;
      if (Number.isFinite(last)) resolve(last);
      else reject(new Error("ffmpeg reported no loudness"));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(buffer);
  });
}

const queue = [...sources].sort();
const clips = {};
const failed = [];
let measured = 0;
let reused = 0;

async function worker() {
  while (queue.length) {
    const source = queue.shift();
    if (!refresh && existing.clips?.[source]) {
      clips[source] = existing.clips[source];
      reused += 1;
      continue;
    }
    try {
      const { bytes, contentType } = await fetchMedia(source, {
        hosts: AUDIO_HOSTS,
        types: AUDIO_TYPES,
        maxBytes: 4 * 1024 * 1024,
      });
      const lufs = await measureLufs(Buffer.from(bytes), contentType);
      const gain = Math.min(1, Math.round(10 ** ((TARGET_LUFS - lufs) / 20) * 1000) / 1000);
      clips[source] = { lufs: Math.round(lufs * 10) / 10, gain };
      measured += 1;
    } catch (error) {
      failed.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

await Promise.all([worker(), worker(), worker()]);

const sorted = Object.fromEntries(
  Object.keys(clips)
    .sort()
    .map((key) => [key, clips[key]]),
);
await writeFile(OUTPUT, `${JSON.stringify({ targetLufs: TARGET_LUFS, clips: sorted }, null, 2)}\n`);
console.log(
  `Audio loudness: ${Object.keys(sorted).length} clips (${measured} measured, ${reused} reused, ${failed.length} failed) → ${OUTPUT}`,
);
for (const line of failed) console.warn(`  ${line}`);
if (failed.length) process.exitCode = 1;
