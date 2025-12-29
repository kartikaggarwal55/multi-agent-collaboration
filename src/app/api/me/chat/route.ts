// CHANGED: API route for private 1:1 assistant chat with streaming and calendar tools
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getUserProfile,
  updateUserProfile,
  ProfileChange,
} from "@/lib/profile";
import {
  privateAssistantSystemPrompt,
  formatPrivateConversation,
  PRIVATE_EMIT_TURN_TOOL,
} from "@/lib/agents/private-assistant-prompts";
import {
  CALENDAR_TOOLS,
  executeCalendarTool,
  isCalendarTool,
} from "@/lib/agents/calendar-tools";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || "claude-sonnet-4-5";

const messageSchema = z.object({
  content: z.string().min(1),
});

// GET - Fetch chat history and profile
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const userId = session.user.id;

    // Fetch messages and profile in parallel
    const [messages, profileItems] = await Promise.all([
      prisma.privateMessage.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      getUserProfile(userId),
    ]);

    // CHANGED: Check if user has calendar connected
    const account = await prisma.account.findFirst({
      where: { userId, provider: "google" },
      select: { access_token: true },
    });
    const hasCalendar = !!account?.access_token;

    return new Response(
      JSON.stringify({
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
        profile: profileItems,
        hasCalendar,
        user: {
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching chat:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch chat" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// POST - Send message and get streaming response
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const userId = session.user.id;
    const userName = session.user.name || "User";

    const body = await request.json();
    const parsed = messageSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { content } = parsed.data;

    // Save user message
    const userMessage = await prisma.privateMessage.create({
      data: {
        userId,
        role: "user",
        content,
      },
    });

    // Get profile, recent messages, and calendar status
    const [profileItems, recentMessages, account] = await Promise.all([
      getUserProfile(userId),
      prisma.privateMessage.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        take: 20,
      }),
      prisma.account.findFirst({
        where: { userId, provider: "google" },
        select: { access_token: true },
      }),
    ]);

    const hasCalendar = !!account?.access_token;

    // Prepare system prompt
    const systemPrompt = privateAssistantSystemPrompt(userName, profileItems);

    // Format conversation context
    const conversationContext = formatPrivateConversation(
      recentMessages.map((m) => ({ role: m.role, content: m.content }))
    );

    // CHANGED: Build tools list based on calendar access
    const tools: Anthropic.Messages.Tool[] = [
      PRIVATE_EMIT_TURN_TOOL as unknown as Anthropic.Messages.Tool,
    ];
    if (hasCalendar) {
      tools.push(...CALENDAR_TOOLS);
    }

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        // Send user message event
        sendEvent("message", {
          id: userMessage.id,
          role: "user",
          content: userMessage.content,
          createdAt: userMessage.createdAt.toISOString(),
        });

        try {
          // CHANGED: Build messages for potential multi-turn tool use
          let messages: Anthropic.Messages.MessageParam[] = [
            { role: "user", content: conversationContext },
          ];

          let assistantContent = "";
          let profileUpdate: {
            should_update: boolean;
            new_profile_items?: string[];
            changes?: ProfileChange[];
          } | null = null;
          let needsReconnect = false;

          // CHANGED: Loop to handle tool calls (max 3 rounds)
          for (let round = 0; round < 3; round++) {
            const response = await anthropic.messages.create({
              model: ASSISTANT_MODEL,
              max_tokens: 2048,
              system: systemPrompt,
              tools,
              tool_choice: { type: "any" },
              messages,
            });

            // Process response
            let hasToolUse = false;
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
            let pendingEmitTurn: {
              id: string;
              input: {
                message: string;
                profile_updates?: {
                  should_update: boolean;
                  new_profile_items?: string[];
                  changes?: Array<{
                    type: "added" | "updated" | "removed";
                    before?: string;
                    after?: string;
                    reason: string;
                  }>;
                };
              };
            } | null = null;

            for (const block of response.content) {
              if (block.type === "text") {
                assistantContent += block.text;
              } else if (block.type === "tool_use") {
                hasToolUse = true;

                if (block.name === "emit_turn") {
                  // CHANGED: Store emit_turn for later processing
                  pendingEmitTurn = {
                    id: block.id,
                    input: block.input as {
                      message: string;
                      profile_updates?: {
                        should_update: boolean;
                        new_profile_items?: string[];
                        changes?: Array<{
                          type: "added" | "updated" | "removed";
                          before?: string;
                          after?: string;
                          reason: string;
                        }>;
                      };
                    },
                  };
                } else if (isCalendarTool(block.name)) {
                  // CHANGED: Execute calendar tool
                  sendEvent("status", { status: `Checking calendar...` });

                  const toolResult = await executeCalendarTool(
                    block.name,
                    block.input as Record<string, unknown>,
                    userId
                  );

                  if (toolResult.needsReconnect) {
                    needsReconnect = true;
                  }

                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: toolResult.result,
                  });
                }
              }
            }

            // CHANGED: If we have emit_turn, process it and break
            if (pendingEmitTurn) {
              assistantContent = pendingEmitTurn.input.message || assistantContent;
              if (pendingEmitTurn.input.profile_updates) {
                profileUpdate = {
                  should_update: pendingEmitTurn.input.profile_updates.should_update,
                  new_profile_items: pendingEmitTurn.input.profile_updates.new_profile_items,
                  changes: pendingEmitTurn.input.profile_updates.changes?.map((c) => ({
                    ...c,
                    timestamp: new Date().toISOString(),
                  })),
                };
              }
              break;
            }

            // CHANGED: If we have tool results (calendar), continue the conversation
            if (toolResults.length > 0) {
              messages = [
                ...messages,
                { role: "assistant", content: response.content },
                { role: "user", content: toolResults },
              ];
              continue;
            }

            // No tool use or emit_turn - just text response
            if (!hasToolUse) {
              break;
            }
          }

          // Save assistant message
          const assistantMessage = await prisma.privateMessage.create({
            data: {
              userId,
              role: "assistant",
              content: assistantContent,
            },
          });

          // Send assistant message event
          sendEvent("message", {
            id: assistantMessage.id,
            role: "assistant",
            content: assistantMessage.content,
            createdAt: assistantMessage.createdAt.toISOString(),
          });

          // Handle profile updates
          if (profileUpdate?.should_update && profileUpdate.new_profile_items) {
            await updateUserProfile(
              userId,
              profileUpdate.new_profile_items,
              profileUpdate.changes || []
            );

            sendEvent("profile", {
              items: profileUpdate.new_profile_items,
              changes: profileUpdate.changes,
            });
          }

          // CHANGED: Notify if calendar reconnect needed
          if (needsReconnect) {
            sendEvent("calendar_reconnect", { needed: true });
          }

          sendEvent("done", { success: true });
        } catch (error) {
          console.error("Error calling assistant:", error);
          sendEvent("error", {
            error: error instanceof Error ? error.message : "Unknown error",
          });
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
    return new Response(
      JSON.stringify({ error: "Failed to process message" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
