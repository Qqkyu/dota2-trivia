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

export default function Home() {
  const [messages, setMessages] = useState<string[]>([]);
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    const channel = pusherClient.subscribe("chat-channel");

    channel.bind("new-message", (data: { message: string }) => {
      setMessages((prev) => [...prev, data.message]);
    });

    return () => {
      pusherClient.unsubscribe("chat-channel");
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // In a real app, you'd send this to your backend
    // which would then trigger the Pusher event
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: newMessage }),
    });

    setNewMessage("");
  };

  return (
    <main className="p-4">
      <h1 className="mb-4 text-2xl">Real-Time Message Board</h1>
      <form onSubmit={handleSubmit} className="mb-4">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="mr-2 border p-2"
          placeholder="Type a message"
        />
        <button type="submit" className="bg-blue-500 p-2 text-white">
          Send
        </button>
      </form>
      <ul>
        {messages.map((message, index) => (
          <li key={index} className="mb-2">
            {message}
          </li>
        ))}
      </ul>
    </main>
  );
}
