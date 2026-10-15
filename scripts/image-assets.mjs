import { readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// These local drawings contain only basic geometry and plain text. Remote SVGs
// stay outside the media allowlist, as do SVGs with executable or external content.
export function isStaticLocalSvg(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  return (
    /^<svg\s[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>/.test(text) &&
    /<\/svg>\s*$/.test(text) &&
    !/<(?:script|foreignObject|image|use|style|animate|set)\b|\bhref\s*=|\bon[\w-]+\s*=|url\s*\(|<!|<\?/i.test(text) &&
    [...text.matchAll(/<\/?([A-Za-z][\w:-]*)\b/g)].every((match) =>
      [
        "svg",
        "title",
        "desc",
        "g",
        "rect",
        "path",
        "circle",
        "ellipse",
        "line",
        "polyline",
        "polygon",
        "text",
        "tspan",
      ].includes(match[1]),
    )
  );
}

export function questionImageUrls(question) {
  return [
    question.image?.src,
    ...(question.answerImages ?? []),
    ...(question.answerImagePairs?.flat() ?? []),
    ...(question.shopkeeper?.promptItems?.map((item) => item.image) ?? []),
    ...(question.shopkeeper?.answerGroups?.flat().map((item) => item.image) ?? []),
    ...(question.valueOrder?.cards?.map((card) => card.image) ?? []),
    ...(question.flashback?.cards?.map((card) => card.image) ?? []),
    question.flashback?.revealMedia?.src,
  ].filter(Boolean);
}

export function questionAudioUrls(question) {
  return question.audio?.clips ?? (question.audio?.src ? [question.audio.src] : []);
}

function hasMediaHeader(bytes, kind) {
  const text = Buffer.from(bytes).toString("latin1");
  if (kind === "image") {
    return (
      text.startsWith("\x89PNG\r\n\x1a\n") ||
      text.startsWith("\xff\xd8\xff") ||
      /^GIF8[79]a/.test(text) ||
      (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") ||
      (text.slice(4, 8) === "ftyp" && /avif|avis/.test(text.slice(8, 32)))
    );
  }
  return (
    text.startsWith("ID3") ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ||
    text.startsWith("OggS") ||
    (text.startsWith("RIFF") && text.slice(8, 12) === "WAVE")
  );
}

async function probeAsset(url, kind, attempt = 0) {
  if (url.startsWith("/")) {
    try {
      const publicRoot = resolve(root, "public");
      const path = resolve(publicRoot, `.${url}`);
      if (!path.startsWith(`${publicRoot}${sep}`)) return false;
      const bytes = await readFile(path);
      if (kind === "image" && url.endsWith(".svg")) return isStaticLocalSvg(bytes);
      return hasMediaHeader(bytes.subarray(0, 32), kind);
    } catch {
      return false;
    }
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "queue-arcade-asset-check/1.0",
        range: "bytes=0-31",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      const reader = response.body?.getReader();
      if (!reader) return false;
      try {
        const contentType = response.headers.get("content-type")?.split(";", 1)[0];
        if (!contentType?.startsWith(`${kind}/`) && contentType !== "application/octet-stream") return false;
        const chunks = [];
        let length = 0;
        while (length < 32) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value.subarray(0, 32 - length));
          length += value.byteLength;
        }
        return hasMediaHeader(Buffer.concat(chunks), kind);
      } finally {
        await reader.cancel();
      }
    }
    await response.body?.cancel();
    if (response.status === 404) return false;

    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < 2) {
      await delay(250 * 2 ** attempt);
      return probeAsset(url, kind, attempt + 1);
    }

    throw new Error(`Asset check failed for ${url}: HTTP ${response.status}`);
  } catch (error) {
    if (attempt < 2 && error instanceof TypeError) {
      await delay(250 * 2 ** attempt);
      return probeAsset(url, kind, attempt + 1);
    }

    throw error;
  }
}

async function auditUrls(urls, concurrency, kind) {
  const availability = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      availability.set(url, await probeAsset(url, kind));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));

  return {
    availability,
    checkedCount: urls.length,
  };
}

export async function auditImageAssets(questions, concurrency = 12) {
  return auditUrls([...new Set(questions.flatMap(questionImageUrls))], concurrency, "image");
}

export async function auditAudioAssets(questions, concurrency = 8) {
  return auditUrls([...new Set(questions.flatMap(questionAudioUrls))], concurrency, "audio");
}
