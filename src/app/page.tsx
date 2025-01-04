// interface Hero {
//   id: number;
//   name: string;
//   localized_name: string;
//   primary_attr: string;
//   attack_type: string;
//   roles: Array<string>;
// }
//
// async function getHeroes() {
//   const res = await fetch("https://api.opendota.com/api/heroes", {
//     cache: "force-cache",
//   });
//   const heroes: Array<Hero> = await res.json();
//   return heroes;
// }
//
// export default async function Home() {
//   const heroes = await getHeroes();
//   return (
//     <>
//       <h1 className="text-red-500">Dota 2 Trivia</h1>
//       <h2>Heroes:</h2>
//       {heroes.map((hero) => (
//         <pre key={hero.id}>{JSON.stringify(hero, null, 2)}</pre>
//       ))}
//     </>
//   );
// }

"use client";

import { useState, useEffect } from "react";
import pusherClient from "@/lib/pusher";

type Option = "A" | "B" | "C" | "D";

export default function Home() {
  const [answers, setAnswers] = useState<Record<Lowercase<Option>, number>>({ a: 0, b: 0, c: 0, d: 0 });

  useEffect(() => {
    const channel = pusherClient.subscribe("trivia");

    channel.bind("answer", (data: { option: Option }) => {
      const lowercaseOption = data.option.toLowerCase() as Lowercase<Option>;
      setAnswers((answers) => ({
        ...answers,
        [lowercaseOption]: answers[lowercaseOption] + 1,
      }));
    });

    return () => {
      pusherClient.unsubscribe("trivia");
    };
  }, []);

  const handleAnswer = async (option: Option) => {
    // In a real app, you'd send this to your backend
    // which would then trigger the Pusher event
    await fetch("/api/messages", {
      method: "POST",
      body: JSON.stringify({ option }),
    });
  };

  return (
    <main className="p-4">
      <h1 className="mb-4 text-2xl">Real-Time Message Board</h1>
      <button onClick={() => handleAnswer("A")} className="bg-blue-500 p-2 text-white">
        A
      </button>
      <button onClick={() => handleAnswer("B")} className="bg-blue-500 p-2 text-white">
        B
      </button>
      <button onClick={() => handleAnswer("C")} className="bg-blue-500 p-2 text-white">
        C
      </button>
      <button onClick={() => handleAnswer("D")} className="bg-blue-500 p-2 text-white">
        D
      </button>
      <ul>
        {Object.entries(answers).map(([option, count]) => (
          <li key={option} className="mb-2">
            {option}: {count}
          </li>
        ))}
      </ul>
    </main>
  );
}
