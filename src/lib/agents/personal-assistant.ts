// Personal Assistant: Handles individual assistant responses with self-suppression
// Each PA sees its owner's private profile + shared room state + tools
// Returns structured PAResult with should_post decision

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CanonicalState } from "../types";
import { formatProfileForPrompt } from "../profile";
import { createCalendarToolsForUser, executeCalendarTool } from "./calendar-tools";
import { createGmailToolsForUser, executeGmailTool, isGmailTool } from "./gmail-tools";
import { MAPS_TOOLS, executeMapseTool, isMapseTool, isMapsConfigured } from "./maps-tools";

const anthropic = new Anthropic();
const PA_MODEL = process.env.ASSISTANT_MODEL || "claude-sonnet-4-20250514";

// PA Result schema
export const PAResultSchema = z.object({
  run_id: z.string(),
  should_post: z.boolean(),
  message: z.object({
    text: z.string(),
    mentions: z.array(z.string()).optional(),
    links: z.array(z.object({
      label: z.string(),
      url: z.string(),
    })).optional(),
  }).optional(),
  artifact_patch: z.array(z.object({
    op: z.enum(["set", "add", "remove"]),
    path: z.string(),
    value: z.any().optional(),
  })).optional(),
  open_questions: z.array(z.object({
    id: z.string(),
    question: z.string(),
    assigned_to: z.string(),
  })).optional(),
  status: z.object({
    state: z.enum(["PROGRESS", "WAITING_ON_USER", "DONE", "NO_OP"]),
    reason: z.string(),
  }),
  value_score: z.number().min(0).max(1),
});

export type PAResult = z.infer<typeof PAResultSchema>;

export interface PAInput {
  runId: string;
  ownerId: string;
  ownerName: string;
  assistantName: string;
  ownerProfile: string[];
  hasCalendar: boolean;
  hasGmail: boolean;
  hasMaps: boolean;
  recentMessages: Array<{
    authorId: string;
    authorName: string;
    role: "user" | "assistant";
    content: string;
  }>;
  canonicalState: CanonicalState;
  callReason: "owner_message" | "mentioned" | "asked_by_agent" | "likely_value";
  otherParticipants: Array<{ name: string; kind: "human" | "assistant" }>;
}

// PA emit_turn tool
function createPAEmitTool() {
  return {
    name: "emit_response",
    description: "REQUIRED: Output your response decision. Use should_post=false if you have nothing material to add.",
    input_schema: {
      type: "object" as const,
      properties: {
        should_post: {
          type: "boolean",
          description: "Set to FALSE if you have nothing new to add, weren't addressed, or would just be acknowledging. Silence = agreement.",
        },
        message: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Your message (2-4 sentences max). Only include if should_post=true.",
            },
            mentions: {
              type: "array",
              items: { type: "string" },
              description: "Names of participants you're addressing directly with @mention",
            },
            links: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  url: { type: "string" },
                },
                required: ["label", "url"],
              },
              description: "Links to include (maps, web results, etc.)",
            },
          },
        },
        artifact_patch: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["set", "add", "remove"] },
              path: { type: "string", description: "Path like /constraints/location or /leading_option" },
              value: { description: "The value to set/add" },
            },
            required: ["op", "path"],
          },
          description: "Updates to the room state/artifacts",
        },
        open_questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              assigned_to: { type: "string", description: "room, owner name, or assistant name" },
            },
            required: ["id", "question", "assigned_to"],
          },
          description: "New questions that need answers",
        },
        status: {
          type: "object",
          properties: {
            state: {
              type: "string",
              enum: ["PROGRESS", "WAITING_ON_USER", "DONE", "NO_OP"],
              description: "PROGRESS: made progress. WAITING_ON_USER: need human input. DONE: plan complete. NO_OP: nothing to add.",
            },
            reason: { type: "string", description: "Brief explanation" },
          },
          required: ["state", "reason"],
        },
        value_score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "How valuable is this contribution? 0=no value, 1=critical info. Use 0.1-0.3 for NO_OP.",
        },
      },
      required: ["should_post", "status", "value_score"],
    },
  };
}

function buildPAPrompt(input: PAInput): string {
  const {
    ownerName,
    ownerProfile,
    hasCalendar,
    hasGmail,
    hasMaps,
    recentMessages,
    canonicalState,
    callReason,
    otherParticipants,
  } = input;

  const profileSection = formatProfileForPrompt(ownerProfile);

  const messagesContext = recentMessages.slice(-15).map(m =>
    `**${m.authorName}**: ${m.content}`
  ).join("\n\n");

  const toolsAvailable = [
    hasCalendar ? "Calendar (check availability)" : null,
    hasGmail ? "Gmail (search emails)" : null,
    hasMaps ? "Maps (search places, get directions)" : null,
    "Web search",
  ].filter(Boolean).join(", ");

  const otherParticipantsList = otherParticipants
    .map(p => `- ${p.name} (${p.kind})`)
    .join("\n");

  const callReasonContext = {
    owner_message: `${ownerName} just sent a message. As their assistant, you should respond first if there's something helpful to say.`,
    mentioned: `You were @mentioned in a message. You should respond, but keep it brief if you have nothing substantial to add.`,
    asked_by_agent: `Another assistant asked you a question or requested your input. Respond to their specific query.`,
    likely_value: `The Conductor thinks you might have valuable input. Only respond if you truly have NEW information to add.`,
  }[callReason];

  return `You are ${ownerName}'s personal assistant in a collaborative planning session.

## Your Owner's Profile
${profileSection || "No profile information stored yet."}

## Why You Were Called
${callReasonContext}

## Available Tools
${toolsAvailable}

## Other Participants
${otherParticipantsList}

## Current Room State
- Goal: ${canonicalState.goal || "Not set"}
- Leading option: ${canonicalState.leadingOption || "None yet"}
- Stage: ${canonicalState.stage}

## Recent Conversation
${messagesContext}

## Self-Suppression Rules (CRITICAL)

**Set should_post=false if:**
- You have NO new information to add
- You weren't directly addressed and have nothing material
- You would just be agreeing or acknowledging (silence = agreement)
- Your response would repeat what's already in the room state
- Another assistant already covered what you would say

**Set should_post=true if:**
- You have NEW information (from tools, constraints, options)
- You were directly @mentioned or asked a question
- You can correct a misunderstanding about ${ownerName}'s preferences
- You can propose a concrete option or narrow choices
- You can resolve an open question

## Preference Override Rule
If ${ownerName} explicitly states something that contradicts their stored profile:
- Accept it immediately for this plan (don't argue or ask "are you sure?")
- You may ask ONE clarifying question only if it changes the plan materially
- Update the artifact with the new preference (use artifact_patch)

## Response Guidelines
- Keep messages SHORT (2-4 sentences max)
- Include links for any places/emails/web results
- Use @mentions when addressing specific participants
- Update artifacts proactively (leading_option, constraints, etc.)

## CRITICAL: Tool Usage Before Responding
**DO NOT say "I'll search for X" and then emit_response without actually searching.**
If you need information (flights, hotels, places, availability):
1. FIRST use the appropriate tool (web_search, maps_search_places, calendar, etc.)
2. WAIT for the tool results
3. THEN call emit_response with the actual findings

Never promise to do something in your message that you haven't already done.
Saying "I'll look into that" without actually doing it is useless.

## Your Task
1. If you need information, USE TOOLS FIRST
2. Decide if you should post (be honest - silence is often better)
3. If posting, include ACTUAL findings from tool results
4. Update artifacts as needed
5. Report your status and value score

Call emit_response ONLY after you've gathered any needed information.`;
}

export async function callPersonalAssistant(input: PAInput): Promise<PAResult> {
  const prompt = buildPAPrompt(input);

  // Build tools list
  const tools: Anthropic.Messages.Tool[] = [
    createPAEmitTool() as unknown as Anthropic.Messages.Tool,
    {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 3,
    } as unknown as Anthropic.Messages.Tool,
  ];

  const calendarToolNames: string[] = [];
  const gmailToolNames: string[] = [];

  if (input.hasCalendar) {
    const calendarTools = createCalendarToolsForUser(input.ownerName);
    tools.push(...calendarTools);
    calendarToolNames.push(...calendarTools.map(t => t.name));
  }

  if (input.hasGmail) {
    const gmailTools = createGmailToolsForUser(input.ownerName);
    tools.push(...gmailTools);
    gmailToolNames.push(...gmailTools.map(t => t.name));
  }

  if (input.hasMaps) {
    tools.push(...MAPS_TOOLS);
  }

  try {
    let response = await anthropic.messages.create({
      model: PA_MODEL,
      max_tokens: 2048,
      tools,
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: prompt }],
    });

    // Handle tool use loop (for calendar, gmail, maps, web search)
    let result: PAResult | null = null;
    let maxRounds = 5;
    let accumulatedText = ""; // Capture text from response (including web search results)

    while (maxRounds > 0) {
      maxRounds--;

      // Capture any text blocks from the response (web search results come as text with citations)
      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          accumulatedText += block.text + "\n";
        }
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) break;

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        if (toolUse.name === "emit_response") {
          // Parse the PA result
          const rawResult = toolUse.input as {
            should_post: boolean;
            message?: { text: string; mentions?: string[]; links?: { label: string; url: string }[] };
            artifact_patch?: Array<{ op: "set" | "add" | "remove"; path: string; value?: unknown }>;
            open_questions?: Array<{ id: string; question: string; assigned_to: string }>;
            status: { state: "PROGRESS" | "WAITING_ON_USER" | "DONE" | "NO_OP"; reason: string };
            value_score: number;
          };

          // Use accumulated text if message.text is empty but we have text from response
          let messageText = rawResult.message?.text || "";
          if (!messageText && accumulatedText.trim()) {
            messageText = accumulatedText.trim();
          }

          result = {
            run_id: input.runId,
            should_post: rawResult.should_post,
            message: messageText ? {
              text: messageText,
              mentions: rawResult.message?.mentions,
              links: rawResult.message?.links,
            } : undefined,
            artifact_patch: rawResult.artifact_patch,
            open_questions: rawResult.open_questions,
            status: rawResult.status || { state: "NO_OP", reason: "No status provided" },
            value_score: rawResult.value_score ?? 0.5,
          };

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: "Response recorded.",
          });
        } else if (calendarToolNames.includes(toolUse.name)) {
          const toolResult = await executeCalendarTool(
            input.ownerId,
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: toolResult,
          });
        } else if (gmailToolNames.includes(toolUse.name)) {
          const toolResult = await executeGmailTool(
            input.ownerId,
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: toolResult,
          });
        } else if (isMapseTool(toolUse.name)) {
          const toolResult = await executeMapseTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: toolResult,
          });
        } else if (toolUse.name === "web_search") {
          // Web search is handled by Anthropic automatically - results are in response
          // No need to send tool_result, just continue
          continue;
        } else {
          // Unknown tool - acknowledge
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: "Tool not available.",
          });
        }
      }

      // If we got the emit_response, we're done
      if (result) break;

      // Continue conversation with tool results
      if (toolResults.length > 0) {
        response = await anthropic.messages.create({
          model: PA_MODEL,
          max_tokens: 2048,
          tools,
          messages: [
            { role: "user", content: prompt },
            { role: "assistant", content: response.content },
            { role: "user", content: toolResults },
          ],
        });
      } else {
        break;
      }
    }

    // If we didn't get a result, create a fallback
    if (!result) {
      result = {
        run_id: input.runId,
        should_post: false,
        status: { state: "NO_OP", reason: "Failed to get structured response" },
        value_score: 0.1,
      };
    }

    return result;
  } catch (error) {
    console.error("PA error:", error);
    return {
      run_id: input.runId,
      should_post: false,
      status: { state: "NO_OP", reason: `Error: ${error instanceof Error ? error.message : "Unknown"}` },
      value_score: 0,
    };
  }
}

// Apply artifact patches to canonical state
export function applyArtifactPatches(
  state: CanonicalState,
  patches: PAResult["artifact_patch"],
  updatedBy: string
): CanonicalState {
  if (!patches || patches.length === 0) return state;

  const newState = { ...state };

  for (const patch of patches) {
    const pathParts = patch.path.split("/").filter(Boolean);

    if (pathParts[0] === "leading_option" && patch.op === "set") {
      newState.leadingOption = String(patch.value || "");
    } else if (pathParts[0] === "constraints" && patch.op === "add" && pathParts[1]) {
      const constraint = {
        participantId: pathParts[1],
        constraint: String(patch.value || ""),
        source: "session_statement" as const,
        addedAt: new Date().toISOString(),
      };
      newState.constraints = [...(newState.constraints || []), constraint];
    } else if (pathParts[0] === "stage" && patch.op === "set") {
      newState.stage = patch.value as CanonicalState["stage"];
    } else if (pathParts[0] === "status_summary" && patch.op === "set") {
      newState.statusSummary = patch.value as string[];
    }
  }

  newState.lastUpdatedAt = new Date().toISOString();
  newState.lastUpdatedBy = updatedBy;

  return newState;
}
