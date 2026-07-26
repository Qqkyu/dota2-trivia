function hash(input) {
  let value = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }

  return value >>> 0;
}

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @template T
 * @param {readonly T[]} values
 * @param {string} seed
 * @returns {T[]}
 */
export function seededShuffle(values, seed) {
  const random = mulberry32(hash(seed));
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }

  return shuffled;
}

/**
 * Deterministically rotates question templates while each template still has
 * candidates. Large pools therefore cannot drown out smaller, more distinctive
 * round types at the front of a public-room batch.
 *
 * @template {{ kind: string }} T
 * @param {readonly T[]} values
 * @param {string} seed
 * @returns {T[]}
 */
export function varietyShuffle(values, seed) {
  const buckets = new Map();

  for (const value of values) {
    const bucket = buckets.get(value.kind) ?? [];
    bucket.push(value);
    buckets.set(value.kind, bucket);
  }

  for (const [kind, bucket] of buckets) {
    buckets.set(kind, seededShuffle(bucket, `${seed}:kind:${kind}`));
  }

  let kindOrder = seededShuffle([...buckets.keys()], `${seed}:kind-order`);
  const result = [];
  let previousKind = "";

  while (result.length < values.length) {
    const nextKind =
      kindOrder.find((kind) => kind !== previousKind && buckets.get(kind)?.length) ??
      kindOrder.find((kind) => buckets.get(kind)?.length);

    if (!nextKind) break;

    result.push(buckets.get(nextKind).shift());
    previousKind = nextKind;
    kindOrder = [...kindOrder.filter((kind) => kind !== nextKind), nextKind];

    if (kindOrder.every((kind) => !buckets.get(kind)?.length)) break;
  }

  return result;
}
