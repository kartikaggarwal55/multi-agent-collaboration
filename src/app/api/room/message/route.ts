// POST /api/room/message - Add a human message and trigger collaboration burst with SSE streaming

import { z } from "zod";
import { getRoom, addMessage, setGoal, getParticipant } from "@/lib/store";
import { runCollaborationBurstStream } from "@/lib/agents/orchestrator";

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
      return new Response(
        JSON.stringify({ error: "Invalid request body", details: parsed.error.format() }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { speakerId, content, goal } = parsed.data;

    // Validate speaker exists and is human
    const speaker = getParticipant(speakerId);
    if (!speaker || speaker.kind !== "human") {
      return new Response(
        JSON.stringify({ error: "Invalid speaker ID. Must be a human participant." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
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

    // Create a streaming response using SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Helper to send SSE event
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        // Send the human message first
        sendEvent("message", { message: humanMessage });

        // Stream collaboration burst events
        try {
          for await (const event of runCollaborationBurstStream("demo", humanMessage.id)) {
            if (event.type === "message") {
              sendEvent("message", { message: event.message });
            } else if (event.type === "summary") {
              sendEvent("summary", { summary: event.summary });
            } else if (event.type === "error") {
              sendEvent("error", { error: event.error });
            } else if (event.type === "done") {
              // Send final room state
              const room = getRoom();
              sendEvent("done", { room });
            }
          }
        } catch (error) {
          console.error("Error in collaboration burst:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          sendEvent("error", { error: errorMessage });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error processing message:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: "Failed to process message", details: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
