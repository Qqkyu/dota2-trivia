import { QuizProps } from "@/components/quiz";

interface Hero {
  id: number;
  name: string;
  localized_name: string;
  primary_attr: string;
  attack_type: string;
  roles: Array<string>;
}

async function getHeroes() {
  const res = await fetch("https://api.opendota.com/api/heroes", {
    cache: "force-cache",
  });
  const heroes: Array<Hero> = await res.json();
  return heroes;
}

const PRIMARY_ATTRIBUTE_MAP = {
  str: "Strength",
  agi: "Agility",
  int: "Intelligence",
  all: "Universal",
};

export async function getHeroPrimaryAttributesQuestions(): Promise<Array<QuizProps>> {
  const heroes = await getHeroes();
  return heroes.map(({ localized_name, primary_attr }) => ({
    question: `What is ${localized_name} primary attribute?`,
    options: [{ text: "Strength" }, { text: "Agility" }, { text: "Intelligence" }, { text: "Universal" }],
    correctAnswer: PRIMARY_ATTRIBUTE_MAP[primary_attr],
  }));
}
