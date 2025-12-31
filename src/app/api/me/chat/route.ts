// API route for private 1:1 assistant chat with streaming, calendar, gmail, and maps tools
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
import {
  GMAIL_TOOLS,
  executeGmailTool,
  isGmailTool,
} from "@/lib/agents/gmail-tools";
import {
  MAPS_TOOLS,
  executeMapseTool,
  isMapseTool,
  isMapsConfigured,
} from "@/lib/agents/maps-tools";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || "claude-sonnet-4-20250514";
const RATE_LIMIT_RETRY_DELAY_MS = 2000;
const MAX_RATE_LIMIT_RETRIES = 2;

const MAX_MESSAGE_LENGTH = 10000; // 10k characters max

// Helper for rate-limited API calls with exponential backoff
async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RATE_LIMIT_RETRIES
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRateLimit = errorMessage.includes("429") || errorMessage.includes("rate_limit");

      if (isRateLimit && attempt < maxRetries) {
        const delay = RATE_LIMIT_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.log(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

const messageSchema = z.object({
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
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

    // Check if user has calendar and gmail connected
    // Find all Google accounts and prefer the one with most scopes
    const accounts = await prisma.account.findMany({
      where: { userId, provider: "google" },
      select: { access_token: true, scope: true },
    });
    const account = accounts.find(a => a.scope?.includes("gmail"))
      || accounts.find(a => a.scope?.includes("calendar"))
      || accounts[0];
    const hasCalendar = !!account?.access_token && account?.scope?.includes("calendar");
    const hasGmail = !!account?.access_token && account?.scope?.includes("gmail");

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
        hasGmail,
        hasMaps: isMapsConfigured(),
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
    // Find all Google accounts and prefer the one with most scopes (gmail + calendar)
    const [profileItems, recentMessagesDesc, accounts] = await Promise.all([
      getUserProfile(userId),
      prisma.privateMessage.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.account.findMany({
        where: { userId, provider: "google" },
        select: { access_token: true, scope: true },
      }),
    ]);

    // Prefer account with gmail scope, then calendar, then any
    const account = accounts.find(a => a.scope?.includes("gmail"))
      || accounts.find(a => a.scope?.includes("calendar"))
      || accounts[0];

    const hasCalendar = !!account?.access_token && account?.scope?.includes("calendar");
    const hasGmail = !!account?.access_token && account?.scope?.includes("gmail");

    // Reverse to chronological order (oldest first)
    const recentMessages = recentMessagesDesc.reverse();

    // Prepare system prompt with tool availability
    const systemPrompt = privateAssistantSystemPrompt(
      userName,
      profileItems,
      hasCalendar,
      hasGmail,
      isMapsConfigured()
    );

    // Format conversation context
    const conversationContext = formatPrivateConversation(
      recentMessages.map((m) => ({ role: m.role, content: m.content }))
    );

    // Build tools list based on available access
    const tools: Anthropic.Messages.Tool[] = [
      PRIVATE_EMIT_TURN_TOOL as unknown as Anthropic.Messages.Tool,
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      } as unknown as Anthropic.Messages.Tool,
    ];
    if (hasCalendar) {
      tools.push(...CALENDAR_TOOLS);
    }
    if (hasGmail) {
      tools.push(...GMAIL_TOOLS);
    }
    if (isMapsConfigured()) {
      tools.push(...MAPS_TOOLS);
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
            const response = await callWithRetry(() =>
              anthropic.messages.create({
                model: ASSISTANT_MODEL,
                max_tokens: 2048,
                system: systemPrompt,
                tools,
                tool_choice: { type: "any" },
                messages,
              })
            );

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
                  // Execute calendar tool
                  sendEvent("status", { status: `Checking calendar...` });

                  const toolResult = await executeCalendarTool(
                    userId,
                    block.name,
                    block.input as Record<string, unknown>
                  );

                  // Check if result indicates reconnect needed
                  if (toolResult.includes("needs to be reconnected")) {
                    needsReconnect = true;
                  }

                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: toolResult,
                  });
                } else if (isGmailTool(block.name)) {
                  // Execute Gmail tool
                  sendEvent("status", { status: `Searching emails...` });

                  const toolResult = await executeGmailTool(
                    userId,
                    block.name,
                    block.input as Record<string, unknown>
                  );

                  if (toolResult.includes("needs to be reconnected")) {
                    needsReconnect = true;
                  }

                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: toolResult,
                  });
                } else if (isMapseTool(block.name)) {
                  // Execute Maps tool
                  sendEvent("status", { status: `Searching places...` });

                  const toolResult = await executeMapseTool(
                    block.name,
                    block.input as Record<string, unknown>
                  );

                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: toolResult,
                  });
                } else if (block.name === "web_search") {
                  // Web search is a server-side tool - results come as text blocks
                  sendEvent("status", { status: `Searching the web...` });
                  // Don't add to toolResults - handled by server
                }
              }
            }

            // Check if web_search was used - can't mix server/client tool results
            const hasWebSearch = response.content.some(
              (block) => block.type === "tool_use" && block.name === "web_search"
            );

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

            // If web_search was used, break - can't continue with mixed tool results
            if (hasWebSearch) {
              break;
            }

            // CHANGED: If we have tool results (calendar, gmail, maps), continue the conversation
            if (toolResults.length > 0) {
              // Filter out server-side tool blocks from previous response
              const clientContent = response.content.filter(
                (block) =>
                  block.type !== "server_tool_use" &&
                  !("type" in block && (block as { type: string }).type === "web_search_tool_result")
              );

              messages = [
                ...messages,
                { role: "assistant", content: clientContent },
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
