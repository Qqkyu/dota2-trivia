import { mkdtemp, readdir, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { cutAudioWithFfmpeg, trimPcmWav } from "../src/lib/cut-round-audio.mjs";

const silentMp3 = Uint8Array.from([
  0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

async function leftoverAudioDirs(before) {
  return (await readdir(tmpdir())).filter((name) => name.startsWith("qa-audio-") && !before.has(name));
}

function pcmWav(seconds = 1) {
  const sampleRate = 44_100;
  const bytes = Buffer.alloc(44 + sampleRate * seconds * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes.buffer;
}

describe("cutAudioWithFfmpeg", () => {
  it("cuts past a silent prefix while leaving the default prefix unchanged", async () => {
    const bytes = pcmWav();
    const buffer = Buffer.from(bytes);
    for (let frame = 26_460; frame < 44_100; frame += 1) buffer.writeInt16LE(5_000, 44 + frame * 2);
    for (const seconds of [0.12, 0.2]) {
      const prefix = Buffer.from(await cutAudioWithFfmpeg(bytes, seconds, "audio/wav"));
      const shifted = Buffer.from(await cutAudioWithFfmpeg(bytes, seconds, "audio/wav", { startSeconds: 0.6 }));
      const data = (wav) => wav.subarray(wav.indexOf(Buffer.from("data")) + 8);
      expect(data(prefix).every((byte) => byte === 0)).toBe(true);
      expect(data(shifted).readInt16LE(0)).toBe(5_000);
      expect(data(shifted).length).toBe(44_100 * 2 * seconds);
      expect(Buffer.from(trimPcmWav(bytes, seconds, 0.6)).subarray(44)).toEqual(data(shifted));
    }
  });

  it("rejects invalid cut offsets and avoids the fast path for noncanonical WAV headers", async () => {
    for (const startSeconds of [-1, NaN, Infinity, 60]) {
      await expect(cutAudioWithFfmpeg(pcmWav(), 0.1, "audio/wav", { startSeconds })).rejects.toThrow(
        "Invalid audio cut",
      );
    }
    const bytes = Buffer.from(pcmWav());
    bytes.write("LIST", 36);
    expect(trimPcmWav(bytes, 0.1)).toBeNull();
  });
  it("removes the work directory when ffmpeg is missing", async () => {
    const previousPath = process.env.PATH;
    const emptyPath = await mkdtemp(join(tmpdir(), "qa-empty-path-"));
    const before = new Set(await readdir(tmpdir()));
    process.env.PATH = emptyPath;
    try {
      await expect(cutAudioWithFfmpeg(silentMp3.buffer, 0.2, "audio/mpeg")).rejects.toThrow();
    } finally {
      process.env.PATH = previousPath;
      await rm(emptyPath, { recursive: true, force: true });
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
      await rm(bin, { recursive: true, force: true });
    }
    expect(await leftoverAudioDirs(before)).toEqual([]);
  });

  it("cuts a real WAV to the requested prefix and removes its work directory", async () => {
    const before = new Set(await readdir(tmpdir()));
    const result = Buffer.from(await cutAudioWithFfmpeg(pcmWav(), 0.2, "audio/wav"));
    expect(result.toString("ascii", 0, 4)).toBe("RIFF");
    const data = result.indexOf(Buffer.from("data"));
    expect(data).toBeGreaterThan(0);
    expect(result.readUInt32LE(data + 4)).toBe(44_100 * 2 * 0.2);
    expect(await leftoverAudioDirs(before)).toEqual([]);
  });

  it("kills a real encoder at its deadline and removes its work directory", async () => {
    const before = new Set(await readdir(tmpdir()));
    await expect(cutAudioWithFfmpeg(pcmWav(30), 20, "audio/wav", { timeoutMs: 1 })).rejects.toThrow("timed out");
    expect(await leftoverAudioDirs(before)).toEqual([]);
    await expect(cutAudioWithFfmpeg(pcmWav(), 0.1, "audio/wav")).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it("cuts a real MPEG clip with the restricted input format and allocation limit", async () => {
    const { stdout } = await promisify(execFile)(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=mono",
        "-t",
        "1",
        "-f",
        "mp3",
        "pipe:1",
      ],
      { encoding: "buffer" },
    );
    const before = new Set(await readdir(tmpdir()));
    const result = Buffer.from(await cutAudioWithFfmpeg(stdout, 0.12, "audio/mpeg"));
    expect(result.toString("ascii", 0, 3)).toBe("ID3");
    expect(result.length).toBeGreaterThan(100);
    expect(result.length).toBeLessThan(stdout.length);
    expect(await leftoverAudioDirs(before)).toEqual([]);
  });

  it("kills an aborted child before cleanup and releases the encoder slot", async () => {
    const previousPath = process.env.PATH;
    const bin = await mkdtemp(join(tmpdir(), "qa-fake-ffmpeg-"));
    const fake = join(bin, "ffmpeg");
    await writeFile(fake, "#!/bin/sh\nexec sleep 30\n");
    await chmod(fake, 0o755);
    const before = new Set(await readdir(tmpdir()));
    const controller = new AbortController();
    process.env.PATH = `${bin}:${previousPath}`;
    try {
      const promise = cutAudioWithFfmpeg(pcmWav(), 0.2, "audio/wav", { signal: controller.signal });
      setTimeout(() => controller.abort(new Error("client disconnected")), 30);
      await expect(promise).rejects.toThrow("client disconnected");
    } finally {
      process.env.PATH = previousPath;
      await rm(bin, { recursive: true, force: true });
    }
    expect(await leftoverAudioDirs(before)).toEqual([]);
  });
});
