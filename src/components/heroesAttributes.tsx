import { getHeroPrimaryAttributesQuestions } from "@/lib/questions";
import { Quiz } from "./quiz";

export async function HeroesAttributes() {
  const heroPrimaryAttributesQuestions = await getHeroPrimaryAttributesQuestions();
  const { question, options, correctAnswer } =
    heroPrimaryAttributesQuestions[Math.floor(Math.random() * (heroPrimaryAttributesQuestions.length + 1))];

  return <Quiz question={question} options={options} correctAnswer={correctAnswer} />;
}
