import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMediaQueue } from "./media-work.mjs";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const encoderQueue = createMediaQueue(2, 8);

/**
 * Cut answering audio to a short prefix. Always delete the work directory,
 * including when the encoder is missing or the cut fails.
 */
export function cutAudioWithFfmpeg(bytes, seconds, contentType, { signal, timeoutMs = 5_000, startSeconds = 0 } = {}) {
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > 60 ||
    bytes.byteLength > MAX_AUDIO_BYTES ||
    !Number.isFinite(startSeconds) ||
    startSeconds < 0 ||
    startSeconds >= 60
  ) {
    return Promise.reject(new Error("Invalid audio cut."));
  }
  if (!["audio/wav", "audio/mpeg"].includes(contentType)) {
    return Promise.reject(new Error("Unsupported audio cut format."));
  }
  return encoderQueue(() => encodeAudio(bytes, seconds, contentType, signal, timeoutMs, startSeconds));
}

/** Fast path for canonical PCM WAV files. Other WAV layouts use ffmpeg. */
export function trimPcmWav(bytes, seconds, startSeconds = 0) {
  const buf = Buffer.from(bytes);
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > 60 ||
    !Number.isFinite(startSeconds) ||
    startSeconds < 0 ||
    startSeconds >= 60 ||
    buf.length < 44 ||
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 16) !== "WAVEfmt " ||
    buf.readUInt32LE(16) !== 16 ||
    buf.readUInt16LE(20) !== 1 ||
    buf.toString("ascii", 36, 40) !== "data"
  )
    return null;
  const sampleRate = buf.readUInt32LE(24);
  const blockAlign = buf.readUInt16LE(32);
  const dataLength = buf.readUInt32LE(40);
  if (!sampleRate || !blockAlign || dataLength > buf.length - 44 || dataLength % blockAlign) return null;
  const start = Math.floor(startSeconds * sampleRate) * blockAlign;
  if (start >= dataLength) return null;
  const keep = Math.min(dataLength - start, Math.max(blockAlign, Math.ceil(seconds * sampleRate) * blockAlign));
  const out = Buffer.alloc(44 + keep);
  buf.copy(out, 0, 0, 44);
  buf.copy(out, 44, 44 + start, 44 + start + keep);
  out.writeUInt32LE(36 + keep, 4);
  out.writeUInt32LE(keep, 40);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

async function encodeAudio(bytes, seconds, contentType, signal, timeoutMs, startSeconds) {
  signal?.throwIfAborted();
  const dir = await mkdtemp(join(tmpdir(), "qa-audio-"));
  try {
    const ext = contentType === "audio/wav" ? "wav" : "mp3";
    const input = join(dir, `in.${ext}`);
    const output = join(dir, `out.${ext}`);
    await writeFile(input, Buffer.from(bytes));
    signal?.throwIfAborted();
    await new Promise((resolve, reject) => {
      const child = spawn(
        "ffmpeg",
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-max_alloc",
          "16777216",
          "-y",
          "-protocol_whitelist",
          "file,pipe",
          "-threads",
          "1",
          "-filter_threads",
          "1",
          "-f",
          ext === "mp3" ? "mp3" : "wav",
          "-i",
          input,
          "-ss",
          String(startSeconds),
          "-t",
          String(seconds),
          "-vn",
          "-map_metadata",
          "-1",
          "-threads",
          "1",
          "-fs",
          String(MAX_AUDIO_BYTES),
          output,
        ],
        {
          stdio: "ignore",
        },
      );
      let failure;
      const stop = (error) => {
        failure ??= error;
        child.kill("SIGKILL");
      };
      const abort = () => stop(signal.reason ?? new Error("Audio cut aborted."));
      const timer = setTimeout(() => stop(new Error("Audio encoder timed out.")), timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      child.on("error", (error) => {
        failure ??= error;
      });
      // Wait for close before releasing capacity or removing the child's files.
      child.on("close", (code) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (failure) reject(failure);
        else if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}`));
      });
    });
    const file = await stat(output);
    if (!file.size || file.size > MAX_AUDIO_BYTES) throw new Error("Audio cut exceeds the size limit.");
    const out = await readFile(output);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
