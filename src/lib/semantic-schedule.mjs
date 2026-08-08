import { seededShuffle, varietyShuffle } from "./variety.mjs";

/**
 * A subject may return after eleven rounds, but never inside the previous ten.
 * Eleven is coprime with the ten-format public rotation, so every format gets
 * an opportunity to use every subject slot.
 */
export const SEMANTIC_REPEAT_GAP_ROUNDS = 10;
export const SEMANTIC_SLOT_COUNT = SEMANTIC_REPEAT_GAP_ROUNDS + 1;

const HERO_ANSWER_KINDS = new Set(["fogged-hero", "hero-quote", "hero-stat-duel", "hero-voice", "spell-owner"]);
const ABILITY_VALUE_KINDS = new Set(["ability-damage", "cooldown", "mana-cost"]);
const preparedScheduleCache = new WeakMap();

function normalizedToken(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function correctAnswer(question) {
  return question?.answers?.[question.correctIndex] ?? "";
}

function abilityKeyForQuestion(question) {
  if (question?.kind === "spell-owner") return question.id?.replace(/^ability-owner:/, "") ?? null;
  if (ABILITY_VALUE_KINDS.has(question?.kind)) return question.id?.split(":")[1] ?? null;
  if (question?.kind === "soundcheck-ability") return question.soundcheck?.clips?.[0]?.subject ?? null;
  return null;
}

function itemKeyFromArtwork(src) {
  return typeof src === "string" ? (src.match(/\/items\/([^/?]+)\.png(?:[?#]|$)/)?.[1] ?? null) : null;
}

function heroKeyFromArtwork(src) {
  return typeof src === "string" ? (src.match(/\/heroes\/([^/?]+)\.png(?:[?#]|$)/)?.[1] ?? null) : null;
}

/** Build the small lookup needed to connect an ability sound back to its hero. */
export function createSemanticSubjectContext(questions) {
  const abilityOwnerByKey = new Map();
  const heroSubjectByInternalKey = new Map();

  for (const question of questions) {
    if (question.kind === "fogged-hero") {
      const internalKey = heroKeyFromArtwork(question.image?.src);
      const hero = normalizedToken(correctAnswer(question));
      if (internalKey && hero) heroSubjectByInternalKey.set(internalKey, `hero:${hero}`);
    }
  }

  for (const question of questions) {
    const abilityKey = abilityKeyForQuestion(question);
    if (!abilityKey) continue;

    if (question.kind === "spell-owner") {
      const hero = normalizedToken(correctAnswer(question));
      if (hero) abilityOwnerByKey.set(abilityKey, `hero:${hero}`);
    } else if (ABILITY_VALUE_KINDS.has(question.kind)) {
      const hero = normalizedToken(question.eyebrow?.split("·")[0]);
      if (hero && !abilityOwnerByKey.has(abilityKey)) abilityOwnerByKey.set(abilityKey, `hero:${hero}`);
    }
  }

  const heroPrefixes = [...heroSubjectByInternalKey.keys()].sort((left, right) => right.length - left.length);
  for (const question of questions) {
    if (question.kind !== "soundcheck-ability") continue;
    const abilityKey = abilityKeyForQuestion(question);
    if (!abilityKey || abilityOwnerByKey.has(abilityKey)) continue;
    const heroKey = heroPrefixes.find((candidate) => abilityKey.startsWith(`${candidate}_`));
    if (heroKey) abilityOwnerByKey.set(abilityKey, heroSubjectByInternalKey.get(heroKey));
  }

  return { abilityOwnerByKey };
}

/**
 * Return the main thing a player is being tested on. Different question IDs
 * about the same hero or item deliberately resolve to the same subject.
 */
export function semanticSubjectForQuestion(question, context) {
  if (!question) return null;

  if (HERO_ANSWER_KINDS.has(question.kind)) {
    const hero = normalizedToken(correctAnswer(question));
    return hero ? `hero:${hero}` : null;
  }

  if (question.kind === "hero-move-speed") {
    const hero = normalizedToken(question.eyebrow);
    return hero ? `hero:${hero}` : null;
  }

  if (ABILITY_VALUE_KINDS.has(question.kind)) {
    const hero = normalizedToken(question.eyebrow?.split("·")[0]);
    return hero ? `hero:${hero}` : null;
  }

  if (question.kind === "soundcheck-ability") {
    const abilityKey = abilityKeyForQuestion(question);
    return (abilityKey && context?.abilityOwnerByKey?.get(abilityKey)) || (abilityKey ? `ability:${abilityKey}` : null);
  }

  if (question.kind === "item-cost") {
    const item = question.id?.replace(/^item-cost:/, "");
    return item ? `item:${item}` : null;
  }

  if (question.kind === "item-price-duel") {
    const item = itemKeyFromArtwork(question.answerImages?.[question.correctIndex]);
    return item ? `item:${item}` : `item:${normalizedToken(correctAnswer(question))}`;
  }

  if (question.kind === "soundcheck-item") {
    const item = question.soundcheck?.clips?.[0]?.subject;
    return item ? `item:${item}` : null;
  }

  if (question.kind === "shopkeeper-build-result" || question.kind === "shopkeeper-real-recipe") {
    const item = question.shopkeeper?.targetItemKey;
    return item ? `item:${item}` : null;
  }

  if (question.kind === "shopkeeper-shared-part") {
    const item = question.shopkeeper?.sharedComponentKey;
    return item ? `item:${item}` : null;
  }

  if (question.kind === "shopkeeper-upgrade-path") {
    const item = question.shopkeeper?.sourceItemKey;
    return item ? `item:${item}` : null;
  }

  return null;
}

function slotTargets(formatIndex, questionCount, formatCount, slotCount) {
  const targets = Array.from({ length: slotCount }, () => 0);
  for (let occurrence = 0; occurrence < questionCount; occurrence += 1) {
    const roundNumber = formatIndex + occurrence * formatCount;
    targets[roundNumber % slotCount] += 1;
  }
  return targets;
}

/**
 * Give every semantic subject one global slot. A hero assigned to slot 4 can
 * therefore only appear on rounds whose number is 4 modulo eleven, regardless
 * of which question family asks about that hero.
 */
export function createSemanticSlotPlan(questions, formats, getFormat, seed, slotCount = SEMANTIC_SLOT_COUNT) {
  const context = createSemanticSubjectContext(questions);
  const formatIndexes = new Map(formats.map((format, index) => [format, index]));
  const pools = new Map(
    formats.map((format) => [format, questions.filter((question) => getFormat(question) === format)]),
  );
  const targets = new Map(
    formats.map((format) => [
      format,
      slotTargets(formatIndexes.get(format), pools.get(format).length, formats.length, slotCount),
    ]),
  );
  const counts = new Map(formats.map((format) => [format, Array.from({ length: slotCount }, () => 0)]));
  const weightsBySubject = new Map();

  for (const question of questions) {
    const format = getFormat(question);
    if (!formatIndexes.has(format)) continue;
    const subject = semanticSubjectForQuestion(question, context) ?? `question:${question.id}`;
    const weights = weightsBySubject.get(subject) ?? new Map();
    weights.set(format, (weights.get(format) ?? 0) + 1);
    weightsBySubject.set(subject, weights);
  }

  const tieOrder = new Map(
    seededShuffle([...weightsBySubject.keys()], `${seed}:subject-order`).map((subject, index) => [subject, index]),
  );
  const subjects = [...weightsBySubject.keys()].sort((left, right) => {
    const leftWeights = [...weightsBySubject.get(left).values()];
    const rightWeights = [...weightsBySubject.get(right).values()];
    return (
      Math.max(...rightWeights) - Math.max(...leftWeights) ||
      rightWeights.reduce((sum, value) => sum + value, 0) - leftWeights.reduce((sum, value) => sum + value, 0) ||
      tieOrder.get(left) - tieOrder.get(right)
    );
  });
  const subjectSlots = new Map();

  for (const subject of subjects) {
    const weights = weightsBySubject.get(subject);
    const slotOrder = seededShuffle(
      Array.from({ length: slotCount }, (_, index) => index),
      `${seed}:subject-slot:${subject}`,
    );
    let bestSlot = slotOrder[0];
    let bestScore = Number.POSITIVE_INFINITY;

    for (const slot of slotOrder) {
      let score = 0;
      for (const [format, weight] of weights) {
        const current = counts.get(format)[slot];
        const target = Math.max(1, targets.get(format)[slot]);
        const next = current + weight;
        const overflow = Math.max(0, next - target);
        score += overflow * overflow * 10_000 + next * next - current * current;
      }
      if (score < bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }

    subjectSlots.set(subject, bestSlot);
    for (const [format, weight] of weights) counts.get(format)[bestSlot] += weight;
  }

  return { context, subjectSlots, counts, targets };
}

/**
 * Build any slice of the infinite public schedule directly from its absolute
 * round numbers. No prior server state is required, so separate API processes
 * and separate 24-round batches still agree on every question.
 */
export function createSemanticPublicDeck(
  questions,
  { formats, getFormat, seed, poolSeedForFormat, length, roundOffset = 0 },
) {
  if (length <= 0 || !formats.length) return [];

  const poolSeeds = formats.map(poolSeedForFormat);
  const cacheKey = JSON.stringify([seed, formats, poolSeeds]);
  const questionCache = preparedScheduleCache.get(questions) ?? new Map();
  let prepared = questionCache.get(cacheKey);
  if (!prepared) {
    const plan = createSemanticSlotPlan(questions, formats, getFormat, seed);
    const buckets = new Map(
      formats.map((format, formatIndex) => [
        format,
        Array.from({ length: SEMANTIC_SLOT_COUNT }, (_, slot) =>
          varietyShuffle(
            questions.filter((question) => {
              if (getFormat(question) !== format) return false;
              const subject = semanticSubjectForQuestion(question, plan.context) ?? `question:${question.id}`;
              return plan.subjectSlots.get(subject) === slot;
            }),
            `${poolSeeds[formatIndex]}:semantic-slot:${slot}`,
          ),
        ),
      ]),
    );
    prepared = { buckets };
    questionCache.set(cacheKey, prepared);
    preparedScheduleCache.set(questions, questionCache);
  }
  const { buckets } = prepared;

  return Array.from({ length }, (_, index) => {
    const roundNumber = Math.max(0, Math.floor(roundOffset + index));
    const formatIndex = roundNumber % formats.length;
    const format = formats[formatIndex];
    const slot = roundNumber % SEMANTIC_SLOT_COUNT;
    const formatOccurrence = Math.floor(roundNumber / formats.length);
    const slotOccurrence = Math.floor(formatOccurrence / SEMANTIC_SLOT_COUNT);
    const bucket = buckets.get(format)?.[slot] ?? [];

    if (!bucket.length) {
      throw new Error(`Semantic schedule slot ${slot} is empty for ${format}.`);
    }
    return bucket[slotOccurrence % bucket.length];
  });
}
