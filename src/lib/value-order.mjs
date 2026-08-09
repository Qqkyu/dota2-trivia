const VALUE_ORDER_ANSWER_PREFIX = "order-v1:";
const VALUE_ORDER_CARD_COUNT = 4;
const VALUE_ORDER_KEY_PATTERN = /^[a-z0-9_]+$/;

export function isValueOrderQuestion(question) {
  return Boolean(
    question?.valueOrder &&
      Array.isArray(question.valueOrder.cards) &&
      question.valueOrder.cards.length === VALUE_ORDER_CARD_COUNT &&
      Array.isArray(question.valueOrder.correctOrder) &&
      question.valueOrder.correctOrder.length === VALUE_ORDER_CARD_COUNT,
  );
}

export function valueOrderAnswerKey(cardKeys) {
  if (
    !Array.isArray(cardKeys) ||
    cardKeys.length !== VALUE_ORDER_CARD_COUNT ||
    new Set(cardKeys).size !== VALUE_ORDER_CARD_COUNT ||
    cardKeys.some((key) => typeof key !== "string" || !VALUE_ORDER_KEY_PATTERN.test(key))
  ) {
    return null;
  }
  return `${VALUE_ORDER_ANSWER_PREFIX}${cardKeys.join(",")}`;
}

export function valueOrderKeysFromAnswerKey(answerKey) {
  if (typeof answerKey !== "string" || !answerKey.startsWith(VALUE_ORDER_ANSWER_PREFIX)) return null;
  const cardKeys = answerKey.slice(VALUE_ORDER_ANSWER_PREFIX.length).split(",");
  return valueOrderAnswerKey(cardKeys) === answerKey ? cardKeys : null;
}

export function isValueOrderAnswerKey(answerKey) {
  return valueOrderKeysFromAnswerKey(answerKey) !== null;
}

export function isValueOrderAnswerForQuestion(question, answerKey) {
  const submittedKeys = valueOrderKeysFromAnswerKey(answerKey);
  const cardKeys = question?.valueOrder?.cards?.map((card) => card.key);
  if (!submittedKeys || !Array.isArray(cardKeys) || cardKeys.length !== VALUE_ORDER_CARD_COUNT) return false;
  const expected = new Set(cardKeys);
  return expected.size === VALUE_ORDER_CARD_COUNT && submittedKeys.every((key) => expected.has(key));
}

export function valueOrderCorrectAnswerKey(question) {
  return isValueOrderQuestion(question) ? valueOrderAnswerKey(question.valueOrder.correctOrder) : null;
}

export function valueOrderAnswerIndex(question, answerKey) {
  if (!isValueOrderQuestion(question) || !isValueOrderAnswerForQuestion(question, answerKey)) return null;
  if (answerKey === valueOrderCorrectAnswerKey(question)) return question.correctIndex;

  const wrongIndexes = [0, 1, 2, 3].filter((index) => index !== question.correctIndex);
  let hash = 0;
  for (const character of answerKey) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return wrongIndexes[hash % wrongIndexes.length] ?? null;
}
