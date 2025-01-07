"use client";

import { useState, useEffect } from "react";
import pusherClient from "@/lib/pusher";
import { Quiz } from "@/components/quiz";

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

  return (
    <main className="p-4">
      <h1 className="mb-4 text-2xl">Real-Time Message Board</h1>
      <Quiz
        question="Question"
        options={[
          { text: "a", image: "/img.jpg" },
          { text: "b", image: "/img.jpg" },
          { text: "c", image: "/img.jpg" },
          { text: "d", image: "/img.jpg" },
        ]}
      />
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
