// Orchestrator for A2A collaboration bursts

import Anthropic from "@anthropic-ai/sdk";
import { Message, Citation, RoomState } from "../types";
import {
  getRoom,
  addMessage,
  updateSummary,
  getAssistants,
  getParticipant,
  getPreferencesForHuman,
} from "../store";
import {
  systemPromptForAssistant,
  summaryPrompt,
  formatConversationContext,
} from "./prompts";

// Initialize Anthropic client
const anthropic = new Anthropic();

// Model configuration
const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || "claude-sonnet-4-5";
const SUMMARY_MODEL = process.env.SUMMARY_MODEL || "claude-haiku-4-5";

// Max rounds for A2A collaboration
const MAX_ROUNDS = 2;

// Event types for streaming
export type CollaborationEvent =
  | { type: "message"; message: Message }
  | { type: "summary"; summary: string }
  | { type: "error"; error: string }
  | { type: "done" };

/**
 * Run a collaboration burst where assistants respond to each other
 * Yields messages as they are generated for real-time streaming
 */
export async function* runCollaborationBurstStream(
  roomId: string,
  triggerMessageId: string
): AsyncGenerator<CollaborationEvent> {
  const assistants = getAssistants();

  // Run up to MAX_ROUNDS rounds (each round = both assistants respond)
  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const assistant of assistants) {
      const room = getRoom();

      // Get the other assistant for context
      const otherAssistant = assistants.find((a) => a.id !== assistant.id);
      const ownerHuman = getParticipant(assistant.ownerHumanId!);

      if (!ownerHuman || !otherAssistant) continue;

      const ownerPrefs = getPreferencesForHuman(ownerHuman.id);
      const systemPrompt = systemPromptForAssistant(
        ownerHuman.displayName,
        ownerPrefs,
        otherAssistant.displayName
      );

      const conversationContext = formatConversationContext(room, assistant.displayName);
      const userMessage = `${room.goal ? `**Goal**: ${room.goal}\n\n` : ""}${conversationContext}`;

      try {
        const response = await callAssistant(systemPrompt, userMessage, true);

        const message = addMessage({
          role: "assistant",
          authorId: assistant.id,
          authorName: assistant.displayName,
          content: response.content,
          citations: response.citations,
        });

        // Yield the message immediately
        yield { type: "message", message };
      } catch (error) {
        console.error(`Error calling assistant ${assistant.displayName}:`, error);
        yield {
          type: "error",
          error: `${assistant.displayName} encountered an error`,
        };
        // Continue with other assistants even if one fails
      }
    }
  }

  // Generate updated summary
  const room = getRoom();
  const summary = await generateSummary(room);
  updateSummary(summary);

  yield { type: "summary", summary };
  yield { type: "done" };
}

/**
 * Legacy non-streaming version (kept for backwards compatibility)
 */
export async function runCollaborationBurst(
  roomId: string,
  triggerMessageId: string
): Promise<{ newMessages: Message[]; summary: string }> {
  const newMessages: Message[] = [];
  let summary = "";

  for await (const event of runCollaborationBurstStream(roomId, triggerMessageId)) {
    if (event.type === "message") {
      newMessages.push(event.message);
    } else if (event.type === "summary") {
      summary = event.summary;
    }
  }

  return { newMessages, summary };
}

/**
 * Call an assistant with web search capability
 * Falls back to no web search if the tool is unavailable
 */
async function callAssistant(
  systemPrompt: string,
  userMessage: string,
  useWebSearch: boolean
): Promise<{ content: string; citations: Citation[] }> {
  const tools: Anthropic.Messages.Tool[] = useWebSearch
    ? [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        } as unknown as Anthropic.Messages.Tool,
      ]
    : [];

  try {
    const response = await anthropic.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
      messages: [{ role: "user", content: userMessage }],
    });

    return parseAssistantResponse(response);
  } catch (error: unknown) {
    // If web search is not enabled, retry without it
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (useWebSearch && errorMessage.includes("web_search")) {
      console.log("Web search not available, retrying without it");
      return callAssistant(systemPrompt, userMessage, false);
    }
    throw error;
  }
}

/**
 * Parse the assistant response to extract content and citations
 */
function parseAssistantResponse(response: Anthropic.Messages.Message): {
  content: string;
  citations: Citation[];
} {
  let content = "";
  const citations: Citation[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      content += block.text;

      // Check for citations in the text block
      // Citations from web search are embedded in the text
      if ("citations" in block && Array.isArray(block.citations)) {
        for (const citation of block.citations as Array<{url?: string; title?: string; cited_text?: string}>) {
          citations.push({
            url: citation.url || "",
            title: citation.title,
            citedText: citation.cited_text,
          });
        }
      }
    } else if (block.type === "tool_use") {
      // Web search tool use - the results will be in subsequent blocks
      // For now, we just note that search was used
      content += "\n[Searched the web for information]\n";
    }
  }

  // Deduplicate citations by URL
  const uniqueCitations = citations.filter(
    (citation, index, self) =>
      index === self.findIndex((c) => c.url === citation.url)
  );

  return { content: content.trim(), citations: uniqueCitations };
}

/**
 * Generate a summary of the current room state
 */
async function generateSummary(room: RoomState): Promise<string> {
  if (room.messages.length === 0) {
    return "No conversation yet. Set a goal and start chatting to see the assistants collaborate!";
  }

  try {
    const prompt = summaryPrompt(room);

    const response = await anthropic.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock ? textBlock.text : "Unable to generate summary.";
  } catch (error) {
    console.error("Error generating summary:", error);
    return "Summary generation failed. The assistants are working on the plan.";
  }
}
