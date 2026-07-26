import { NextResponse } from "next/server";
import Pusher from "pusher";
import { triviaQuestions } from "@/lib/trivia";
import { getCrowdResult, recordVote } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const questionIds = new Set(triviaQuestions.map((question) => question.id));

function getPusherServer() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
  const secret = process.env.PUSHER_APP_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) return null;

  return new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  });
}

export async function GET(request: Request) {
  const questionId = new URL(request.url).searchParams.get("questionId");

  if (!questionId || !questionIds.has(questionId)) {
    return NextResponse.json({ error: "Unknown question." }, { status: 404 });
  }

  return NextResponse.json(getCrowdResult(questionId), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("questionId" in body) ||
    !("answerIndex" in body) ||
    !("voterId" in body)
  ) {
    return NextResponse.json({ error: "Missing vote fields." }, { status: 400 });
  }

  const { questionId, answerIndex, voterId } = body;

  if (
    typeof questionId !== "string" ||
    !questionIds.has(questionId) ||
    typeof answerIndex !== "number" ||
    !Number.isInteger(answerIndex) ||
    answerIndex < 0 ||
    answerIndex > 3 ||
    typeof voterId !== "string" ||
    voterId.length < 8 ||
    voterId.length > 80
  ) {
    return NextResponse.json({ error: "Invalid vote." }, { status: 400 });
  }

  const result = recordVote(questionId, answerIndex, voterId);

  if (result.accepted) {
    const pusher = getPusherServer();
    if (pusher) {
      try {
        await pusher.trigger("queue-arcade", "vote-update", {
          questionId,
          counts: result.counts,
          total: result.total,
        });
      } catch (error) {
        console.error("Could not broadcast arcade vote.", error);
      }
    }
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
