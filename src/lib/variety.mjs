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
 * Builds a deterministic fixed cycle. Because the same shuffled order repeats,
 * every sliding window the size of the input contains every value exactly once.
 *
 * @template T
 * @param {readonly T[]} values
 * @param {string} seed
 * @param {number} length
 * @param {number} [offset]
 * @returns {T[]}
 */
export function fixedCycleRotation(values, seed, length, offset = 0) {
  if (!values.length || length <= 0) return [];

  const order = seededShuffle(values, `${seed}:fixed-cycle`);
  return Array.from({ length }, (_, index) => order[(offset + index) % order.length]);
}

/**
 * Deterministically rotates question templates while each template still has
 * candidates. Optional variety keys also balance variants inside one template.
 * Large pools therefore cannot drown out smaller, more distinctive round types
 * at the front of a public-room batch.
 *
 * When a template has no explicit variety key, hidden difficulty tiers become
 * its variants. This keeps approachable and demanding questions moving without
 * exposing separate player queues.
 *
 * @template {{ kind: string, varietyKey?: string, difficulty?: number }} T
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
    const variantBuckets = new Map();
    for (const value of bucket) {
      const variant = value.varietyKey ?? (value.difficulty ? `${kind}:difficulty:${value.difficulty}` : kind);
      const variants = variantBuckets.get(variant) ?? [];
      variants.push(value);
      variantBuckets.set(variant, variants);
    }
    for (const [variant, variants] of variantBuckets) {
      variantBuckets.set(variant, seededShuffle(variants, `${seed}:kind:${kind}:variant:${variant}`));
    }

    let variantOrder = seededShuffle([...variantBuckets.keys()], `${seed}:kind:${kind}:variant-order`);
    const balancedBucket = [];
    let previousVariant = "";
    while (balancedBucket.length < bucket.length) {
      const nextVariant =
        variantOrder.find((variant) => variant !== previousVariant && variantBuckets.get(variant)?.length) ??
        variantOrder.find((variant) => variantBuckets.get(variant)?.length);
      if (!nextVariant) break;

      balancedBucket.push(variantBuckets.get(nextVariant).shift());
      previousVariant = nextVariant;
      variantOrder = [...variantOrder.filter((variant) => variant !== nextVariant), nextVariant];
    }
    buckets.set(kind, balancedBucket);
  }

  let kindOrder = seededShuffle([...buckets.keys()], `${seed}:kind-order`);
  const result = [];
  let previousKind = "";
  let previousDifficulty;
  let difficultyStreak = 0;

  while (result.length < values.length) {
    const hasQuestions = (kind) => Boolean(buckets.get(kind)?.length);
    const changesDifficulty = (kind) => {
      const nextDifficulty = buckets.get(kind)?.[0]?.difficulty;
      return (
        difficultyStreak < 2 ||
        nextDifficulty === undefined ||
        previousDifficulty === undefined ||
        nextDifficulty !== previousDifficulty
      );
    };
    const nextKind =
      kindOrder.find((kind) => kind !== previousKind && hasQuestions(kind) && changesDifficulty(kind)) ??
      kindOrder.find((kind) => hasQuestions(kind) && changesDifficulty(kind)) ??
      kindOrder.find((kind) => kind !== previousKind && hasQuestions(kind)) ??
      kindOrder.find(hasQuestions);

    if (!nextKind) break;

    const nextValue = buckets.get(nextKind).shift();
    result.push(nextValue);
    previousKind = nextKind;
    if (nextValue.difficulty === undefined) {
      previousDifficulty = undefined;
      difficultyStreak = 0;
    } else if (nextValue.difficulty === previousDifficulty) {
      difficultyStreak += 1;
    } else {
      previousDifficulty = nextValue.difficulty;
      difficultyStreak = 1;
    }
    kindOrder = [...kindOrder.filter((kind) => kind !== nextKind), nextKind];

    if (kindOrder.every((kind) => !buckets.get(kind)?.length)) break;
  }

  return result;
}
