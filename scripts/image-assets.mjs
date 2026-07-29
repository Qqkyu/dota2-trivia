const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function questionImageUrls(question) {
  return [
    question.image?.src,
    ...(question.answerImages ?? []),
    ...(question.answerImagePairs?.flat() ?? []),
    ...(question.counterplay?.toolImages?.map((image) => image.src) ?? []),
  ].filter(Boolean);
}

export function questionAudioUrls(question) {
  return question.audio?.clips ?? (question.audio?.src ? [question.audio.src] : []);
}

async function probeAsset(url, attempt = 0) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "user-agent": "queue-arcade-asset-check/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) return true;
    if (response.status === 404) return false;

    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < 2) {
      await delay(250 * 2 ** attempt);
      return probeAsset(url, attempt + 1);
    }

    throw new Error(`Asset check failed for ${url}: HTTP ${response.status}`);
  } catch (error) {
    if (attempt < 2 && error instanceof TypeError) {
      await delay(250 * 2 ** attempt);
      return probeAsset(url, attempt + 1);
    }

    throw error;
  }
}

async function auditUrls(urls, concurrency) {
  const availability = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      availability.set(url, await probeAsset(url));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));

  return {
    availability,
    checkedCount: urls.length,
  };
}

export async function auditImageAssets(questions, concurrency = 12) {
  return auditUrls([...new Set(questions.flatMap(questionImageUrls))], concurrency);
}

export async function auditAudioAssets(questions, concurrency = 8) {
  return auditUrls([...new Set(questions.flatMap(questionAudioUrls))], concurrency);
}
