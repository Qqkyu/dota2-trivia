import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Cut answering audio to a short prefix. Always delete the work directory,
 * including when the encoder is missing or the cut fails.
 */
export async function cutAudioWithFfmpeg(bytes, seconds, contentType) {
  const dir = await mkdtemp(join(tmpdir(), "qa-audio-"));
  try {
    const ext = contentType.includes("wav")
      ? "wav"
      : contentType.includes("mpeg") || contentType.includes("mp3")
        ? "mp3"
        : "bin";
    const input = join(dir, `in.${ext}`);
    const output = join(dir, `out.${ext === "bin" ? "mp3" : ext}`);
    await writeFile(input, Buffer.from(bytes));
    await new Promise((resolve, reject) => {
      const child = spawn(
        "ffmpeg",
        ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-t", String(seconds), output],
        {
          stdio: "ignore",
        },
      );
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    });
    const out = await readFile(output);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
