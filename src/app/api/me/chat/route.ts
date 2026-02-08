// API route for private 1:1 assistant chat with streaming, calendar, gmail, and maps tools
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getUserProfile,
  updateUserProfile,
  ProfileChange,
} from "@/lib/profile";
import { stripCiteTags, callWithRetry } from "@/lib/api-utils";
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
import { validateCalendarAccess } from "@/lib/calendar";
import {
  GMAIL_TOOLS,
  executeGmailTool,
  isGmailTool,
} from "@/lib/agents/gmail-tools";
import { validateGmailAccess } from "@/lib/gmail";
import {
  MAPS_TOOLS,
  executeMapsTool,
  isMapsTool,
  isMapsConfigured,
} from "@/lib/agents/maps-tools";
import {
  DATE_TOOLS,
  executeDateTool,
  isDateTool,
} from "@/lib/agents/date-tools";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || "claude-opus-4-5";

const MAX_MESSAGE_LENGTH = 10000; // 10k characters max

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
    console.log("[Profile] GET - userId:", userId, "profileItems:", profileItems);

    // Check if user has calendar and gmail connected
    // Find all Google accounts and prefer the one with most scopes
    const accounts = await prisma.account.findMany({
      where: { userId, provider: "google" },
      select: { access_token: true, scope: true },
    });
    const account = accounts.find(a => a.scope?.includes("gmail"))
      || accounts.find(a => a.scope?.includes("calendar"))
      || accounts[0];

    // Validate that tokens actually work (not just exist)
    const hasCalendarScope = !!account?.access_token && account?.scope?.includes("calendar");
    const hasGmailScope = !!account?.access_token && account?.scope?.includes("gmail");

    // Run validations in parallel for efficiency
    const [hasCalendar, hasGmail] = await Promise.all([
      hasCalendarScope ? validateCalendarAccess(userId) : Promise.resolve(false),
      hasGmailScope ? validateGmailAccess(userId) : Promise.resolve(false),
    ]);

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

    // Validate that tokens actually work (not just exist)
    const hasCalendarScope = !!account?.access_token && account?.scope?.includes("calendar");
    const hasGmailScope = !!account?.access_token && account?.scope?.includes("gmail");

    // Run validations in parallel for efficiency
    const [hasCalendar, hasGmail] = await Promise.all([
      hasCalendarScope ? validateCalendarAccess(userId) : Promise.resolve(false),
      hasGmailScope ? validateGmailAccess(userId) : Promise.resolve(false),
    ]);

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

    // Date utilities always available
    tools.push(...DATE_TOOLS);

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

          // Agentic loop with guaranteed response via emit_turn
          // Strategy: Allow up to 4 rounds of tool use, then force emit_turn on round 5
          const MAX_TOOL_ROUNDS = 5;

          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const isLastRound = round === MAX_TOOL_ROUNDS - 1;

            // On last round, force emit_turn to guarantee a response
            const toolChoice = isLastRound
              ? { type: "tool" as const, name: "emit_turn" }
              : { type: "auto" as const };

            const response = await callWithRetry(() =>
              anthropic.messages.create({
                model: ASSISTANT_MODEL,
                max_tokens: 2048,
                temperature: 0.2, // Low temperature for consistency with some flexibility
                system: systemPrompt,
                tools,
                tool_choice: toolChoice,
                messages,
              })
            );

            // Process response blocks
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
            interface EmitTurnResult {
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
            }
            let emitTurnResult: EmitTurnResult | null = null;

            for (const block of response.content) {
              if (block.type === "tool_use") {
                if (block.name === "emit_turn") {
                  // Extract the final response
                  emitTurnResult = block.input as EmitTurnResult;
                } else if (isCalendarTool(block.name)) {
                  sendEvent("status", { status: `Checking calendar...` });
                  const toolResult = await executeCalendarTool(
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
                } else if (isGmailTool(block.name)) {
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
                } else if (isMapsTool(block.name)) {
                  sendEvent("status", { status: `Searching places...` });
                  const toolResult = await executeMapsTool(
                    block.name,
                    block.input as Record<string, unknown>
                  );
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: toolResult,
                  });
                } else if (isDateTool(block.name)) {
                  const toolResult = executeDateTool(
                    block.name,
                    block.input as Record<string, unknown>
                  );
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: toolResult,
                  });
                } else if (block.name === "web_search") {
                  sendEvent("status", { status: `Searching the web...` });
                  // Web search is server-side - results come as text blocks
                }
              }
            }

            // If emit_turn was called, extract response and exit loop
            if (emitTurnResult) {
              console.log("[Profile] Path: emit_turn was called");
              assistantContent = emitTurnResult.message || "";
              console.log("[Profile] emit_turn profile_updates:", JSON.stringify(emitTurnResult.profile_updates, null, 2));
              if (emitTurnResult.profile_updates?.should_update) {
                profileUpdate = {
                  should_update: true,
                  new_profile_items: emitTurnResult.profile_updates.new_profile_items,
                  changes: emitTurnResult.profile_updates.changes?.map((c) => ({
                    ...c,
                    timestamp: new Date().toISOString(),
                  })),
                };
              }
              break;
            }

            // Check for web_search - can't mix with client tool results
            const hasWebSearch = response.content.some(
              (block) => block.type === "tool_use" && block.name === "web_search"
            );
            if (hasWebSearch) {
              console.log("[Profile] Path: web_search fallback (no emit_turn)");
              // Extract any text response from web search
              for (const block of response.content) {
                if (block.type === "text") {
                  assistantContent = block.text;
                  break;
                }
              }
              break;
            }

            // If we have client tool results, continue conversation
            if (toolResults.length > 0) {
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

            // No tool use - LLM returned plain text without emit_turn
            // Force emit_turn on next round by continuing the loop
            console.log("[Profile] Path: no tool use - forcing emit_turn on next round");

            // Store the text response in case we need to use it
            let textResponse = "";
            for (const block of response.content) {
              if (block.type === "text") {
                textResponse = block.text;
                break;
              }
            }

            // Add the text response to messages and continue to force emit_turn
            if (textResponse) {
              messages = [
                ...messages,
                { role: "assistant", content: textResponse },
                { role: "user", content: "Please use the emit_turn tool to submit your response with any profile updates." },
              ];
            }
            continue; // Continue loop to force emit_turn
          }

          // Final fallback if somehow we still have no response
          if (!assistantContent) {
            assistantContent = "I apologize, but I wasn't able to complete your request. Please try again or rephrase your question.";
          }

          // Strip cite tags from web search results
          assistantContent = stripCiteTags(assistantContent);

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
          console.log("[Profile] Update check:", {
            hasProfileUpdate: !!profileUpdate,
            shouldUpdate: profileUpdate?.should_update,
            hasNewItems: !!profileUpdate?.new_profile_items,
            itemCount: profileUpdate?.new_profile_items?.length,
          });
          if (profileUpdate?.should_update && profileUpdate.new_profile_items) {
            console.log("[Profile] Saving profile items:", profileUpdate.new_profile_items);
            await updateUserProfile(
              userId,
              profileUpdate.new_profile_items,
              profileUpdate.changes || []
            );

            sendEvent("profile", {
              items: profileUpdate.new_profile_items,
              changes: profileUpdate.changes,
            });
            console.log("[Profile] Sent profile update event");
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

// DELETE - Clear chat history
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const userId = session.user.id;

    // Delete all messages for this user
    await prisma.privateMessage.deleteMany({
      where: { userId },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error clearing chat:", error);
    return new Response(
      JSON.stringify({ error: "Failed to clear chat" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
