import { mkdtemp, readdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cutAudioWithFfmpeg } from "../src/lib/cut-round-audio.mjs";

const silentMp3 = Uint8Array.from([
  0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

async function leftoverAudioDirs(before) {
  return (await readdir(tmpdir())).filter((name) => name.startsWith("qa-audio-") && !before.has(name));
}

describe("cutAudioWithFfmpeg", () => {
  it("removes the work directory when ffmpeg is missing", async () => {
    const previousPath = process.env.PATH;
    const emptyPath = await mkdtemp(join(tmpdir(), "qa-empty-path-"));
    const before = new Set(await readdir(tmpdir()));
    process.env.PATH = emptyPath;
    try {
      await expect(cutAudioWithFfmpeg(silentMp3.buffer, 0.2, "audio/mpeg")).rejects.toThrow();
    } finally {
      process.env.PATH = previousPath;
    }
    expect(await leftoverAudioDirs(before)).toEqual([]);
  });

  it("removes the work directory when ffmpeg exits with an error", async () => {
    const previousPath = process.env.PATH;
    const bin = await mkdtemp(join(tmpdir(), "qa-fake-ffmpeg-"));
    const fake = join(bin, "ffmpeg");
    await writeFile(fake, "#!/bin/sh\nexit 1\n");
    await chmod(fake, 0o755);
    const before = new Set(await readdir(tmpdir()));
    process.env.PATH = `${bin}:${previousPath}`;
    try {
      await expect(cutAudioWithFfmpeg(silentMp3.buffer, 0.2, "audio/mpeg")).rejects.toThrow(/ffmpeg exited 1/);
    } finally {
      process.env.PATH = previousPath;
    }
    expect(await leftoverAudioDirs(before)).toEqual([]);
  });
});
