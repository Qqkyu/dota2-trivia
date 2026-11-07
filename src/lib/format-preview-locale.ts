import type { Locale } from "@/i18n/types";
import { formatPreviewsFromQuestions } from "@/lib/format-preview.mjs";
import { localizeQuestion } from "@/lib/question-locale";
import { triviaQuestions } from "@/lib/trivia";

const previews = new Map<Locale, ReturnType<typeof formatPreviewsFromQuestions>>();

/** Built once per language, from the same questions as the live rounds. */
export function localizedFormatPreviews(locale: Locale) {
  let built = previews.get(locale);
  if (!built) {
    built = formatPreviewsFromQuestions(triviaQuestions.map((question) => localizeQuestion(question, locale)));
    previews.set(locale, built);
  }
  return built;
}
