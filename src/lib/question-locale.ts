import type { Locale } from "@/i18n/types";
import russian from "@/data/i18n/questions.ru.json";

interface CardText {
  name?: string;
  context?: string;
}

interface QuestionText {
  eyebrow?: string;
  prompt?: string;
  explanation?: string;
  detail?: string;
  hint?: string;
  quoteHints?: Record<string, string>;
  answers?: Record<string, string>;
  image?: { alt?: string };
  aghanim?: { effect?: string };
  flashback?: { cards?: Record<string, CardText>; revealMedia?: { alt?: string; caption?: string } };
  valueOrder?: { cards?: Record<string, CardText>; values?: Record<string, { label?: string }> };
}

/** The fields this module changes; everything else on a question passes through. */
interface LocalizableQuestion {
  id: string;
  eyebrow: string;
  prompt: string;
  answers: readonly string[];
  explanation: string;
  detail?: string;
  hint?: string;
  quoteHints?: readonly string[];
  image?: { alt: string };
  aghanim?: { effect: string };
  flashback?: {
    cards?: ReadonlyArray<{ key: string; name: string; context?: string }>;
    revealMedia?: { alt: string; caption?: string };
  };
  valueOrder?: {
    cards: ReadonlyArray<{ key: string; context?: string }>;
    values: ReadonlyArray<{ key: string; label: string }>;
  };
}

const overlay = russian as Record<string, QuestionText>;
const localized = new WeakMap<object, unknown>();

function translated<Question extends LocalizableQuestion>(question: Question, text: QuestionText): Question {
  const copy: LocalizableQuestion = {
    ...question,
    eyebrow: text.eyebrow ?? question.eyebrow,
    prompt: text.prompt ?? question.prompt,
    explanation: text.explanation ?? question.explanation,
    answers: question.answers.map((answer, index) => text.answers?.[index] ?? answer),
  };
  if (question.detail) copy.detail = text.detail ?? question.detail;
  if (question.hint) copy.hint = text.hint ?? question.hint;
  if (question.quoteHints) copy.quoteHints = question.quoteHints.map((hint, index) => text.quoteHints?.[index] ?? hint);
  if (question.image) copy.image = { ...question.image, alt: text.image?.alt ?? question.image.alt };
  if (question.aghanim) copy.aghanim = { ...question.aghanim, effect: text.aghanim?.effect ?? question.aghanim.effect };
  if (question.flashback) {
    const { cards, revealMedia } = question.flashback;
    copy.flashback = {
      ...question.flashback,
      ...(cards
        ? {
            cards: cards.map((card) => {
              const cardText = text.flashback?.cards?.[card.key];
              return { ...card, name: cardText?.name ?? card.name, context: cardText?.context ?? card.context };
            }),
          }
        : {}),
      ...(revealMedia
        ? {
            revealMedia: {
              ...revealMedia,
              alt: text.flashback?.revealMedia?.alt ?? revealMedia.alt,
              caption: text.flashback?.revealMedia?.caption ?? revealMedia.caption,
            },
          }
        : {}),
    };
  }
  if (question.valueOrder) {
    copy.valueOrder = {
      ...question.valueOrder,
      cards: question.valueOrder.cards.map((card) => ({
        ...card,
        context: text.valueOrder?.cards?.[card.key]?.context ?? card.context,
      })),
      values: question.valueOrder.values.map((value) => ({
        ...value,
        label: text.valueOrder?.values?.[value.key]?.label ?? value.label,
      })),
    };
  }
  return copy as Question;
}

/**
 * The question in the player's language. Identity, answers' order and the right answer never
 * change, so every player shares one round, one crowd and one score. The Russian text stays on
 * the server, like the catalog itself.
 */
export function localizeQuestion<Question extends LocalizableQuestion>(question: Question, locale: Locale): Question {
  if (locale === "en") return question;
  const text = overlay[question.id];
  if (!text) return question;
  const cached = localized.get(question);
  if (cached) return cached as Question;
  const copy = translated(question, text);
  localized.set(question, copy);
  return copy;
}
