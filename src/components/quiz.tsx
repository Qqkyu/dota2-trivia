"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface QuizOption {
  text: string;
  image?: string;
}

export interface QuizProps {
  question: string;
  options: QuizOption[];
  correctAnswer: string;
}

export function Quiz({ question, options }: QuizProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | undefined>(undefined);

  const handleSelectAnswer = async ({ text }: QuizOption) => {
    setSelectedAnswer(text);
    // In a real app, you'd send this to your backend
    // which would then trigger the Pusher event
    await fetch("/api/messages", {
      method: "POST",
      body: JSON.stringify({ option: text }),
    });
  };

  return (
    <div className="container mx-auto max-w-4xl p-4">
      <Card className="mb-8">
        <CardContent className="p-6">
          <h2 className="mb-4 text-2xl font-bold">{question}</h2>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-4">
        {options.map((option) => (
          <Button
            key={option.text}
            variant="outline"
            className={`flex h-auto flex-col items-start p-4 text-left ${
              selectedAnswer === option.text ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => handleSelectAnswer(option)}
          >
            {option.image && (
              <Image src={option.image} alt={option.text} width={150} height={150} className="mb-4 rounded-md" />
            )}
            <span className="text-lg font-semibold">{option.text}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
