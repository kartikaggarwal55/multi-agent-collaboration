// POST /api/room/message - Add a human message and trigger collaboration burst

import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, addMessage, setGoal, getParticipant } from "@/lib/store";
import { runCollaborationBurst } from "@/lib/agents/orchestrator";

const messageSchema = z.object({
  speakerId: z.string(),
  content: z.string().min(1),
  goal: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = messageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { speakerId, content, goal } = parsed.data;

    // Validate speaker exists and is human
    const speaker = getParticipant(speakerId);
    if (!speaker || speaker.kind !== "human") {
      return NextResponse.json(
        { error: "Invalid speaker ID. Must be a human participant." },
        { status: 400 }
      );
    }

    // Update goal if provided
    if (goal) {
      setGoal(goal);
    }

    // Add the human message
    const humanMessage = addMessage({
      role: "user",
      authorId: speaker.id,
      authorName: speaker.displayName,
      content,
    });

    // Run collaboration burst
    const { newMessages, summary } = await runCollaborationBurst(
      "demo",
      humanMessage.id
    );

    // Return updated room state
    const room = getRoom();
    return NextResponse.json({
      room,
      newMessages: [humanMessage, ...newMessages],
    });
  } catch (error) {
    console.error("Error processing message:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { error: "Failed to process message", details: errorMessage },
      { status: 500 }
    );
  }
}
