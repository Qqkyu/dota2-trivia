import { open, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fetchMedia, IMAGE_HOSTS, IMAGE_TYPES } from "./media-fetch.mjs";
import { createMediaCache, createMediaQueue } from "./media-work.mjs";

const MAX_IMAGE_BYTES = 1_500_000;
const imageJobs = createMediaQueue(2, 8);
const imageSources = createMediaCache({ maxEntries: 16, maxBytes: 8 * 1024 * 1024, maxPending: 10, ttlMs: 60_000 });
const imageCuts = createMediaCache({ maxEntries: 32, maxBytes: 8 * 1024 * 1024, maxPending: 10, ttlMs: 60_000 });

async function loadRoundImage(source) {
  if (!source.startsWith("/")) {
    return fetchMedia(source, { hosts: IMAGE_HOSTS, types: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES });
  }
  const publicRoot = await realpath(path.resolve(process.cwd(), "public"));
  const resolved = await realpath(path.resolve(publicRoot, source.replace(/^\/+/, "")));
  if (!resolved.startsWith(`${publicRoot}${path.sep}`)) throw new Error("Round image path is outside public assets.");
  const file = await open(resolved, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > MAX_IMAGE_BYTES) throw new Error("Round image exceeds the size limit.");
    // Read at most the byte cap even if the local file changes after stat.
    const bytes = Buffer.alloc(Math.min(info.size + 1, MAX_IMAGE_BYTES + 1));
    let offset = 0;
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, null);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    if (offset > MAX_IMAGE_BYTES) throw new Error("Round image exceeds the size limit.");
    return { bytes: bytes.subarray(0, offset) };
  } finally {
    await file.close();
  }
}

export function cachedRoundImage(source, stage) {
  if (![1, 2, 3].includes(stage)) return Promise.reject(new Error("Invalid portrait clue stage."));
  return imageCuts.load(JSON.stringify([source, stage]), () =>
    imageJobs(async () => {
      const original = await imageSources.load(source, () => loadRoundImage(source));
      const blur = stage <= 1 ? 21 : stage === 2 ? 14 : 8;
      const brightness = stage <= 1 ? 0.5 : stage === 2 ? 0.56 : 0.65;
      const saturation = stage <= 1 ? 0.44 : 0.6;
      const bytes = await sharp(Buffer.from(original.bytes), { limitInputPixels: 16_777_216, animated: false })
        .resize(512, 288, { fit: "cover" })
        .blur(blur)
        .modulate({ brightness, saturation })
        .greyscale()
        .png()
        .timeout({ seconds: 5 })
        .toBuffer();
      if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Portrait clue exceeds the size limit.");
      return { bytes, contentType: "image/png" };
    }),
  );
}
