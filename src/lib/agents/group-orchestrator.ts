// Group orchestrator for multi-user collaboration with real users
// Each user gets their own assistant with their profile and calendar access

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getUserProfile, formatProfileForPrompt } from "@/lib/profile";
import { createCalendarToolsForUser, executeCalendarTool } from "./calendar-tools";
import {
  Message,
  Citation,
  TurnMeta,
  StopReason,
  StatePatch,
  CanonicalState,
  OpenQuestion,
} from "../types";

// Initialize Anthropic client
const anthropic = new Anthropic();

// Model configuration
const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || "claude-sonnet-4-5";

// Dynamic stopping configuration
const MAX_ASSISTANT_TURNS_PER_RUN = 12;
const CONFIDENCE_THRESHOLD = 0.55;
const STALL_REPEAT_THRESHOLD = 2;
const MAX_CONSECUTIVE_ERRORS = 3;
const RATE_LIMIT_RETRY_DELAY_MS = 2000;
const MAX_RATE_LIMIT_RETRIES = 2;

// Event types for streaming
export type GroupCollaborationEvent =
  | { type: "message"; message: GroupMessageData }
  | { type: "state_update"; state: CanonicalState }
  | { type: "error"; error: string }
  | { type: "status"; status: string }
  | { type: "done"; stopReason: StopReason };

export interface GroupMessageData {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: string;
}

export interface GroupParticipant {
  id: string;
  kind: "human" | "assistant";
  displayName: string;
  ownerHumanId?: string;
  hasCalendar?: boolean;
  userId?: string; // For fetching profile/calendar
}

interface RunState {
  runId: string;
  turnCount: number;
  lastSpeaker: string | null;
  stopReason: StopReason | null;
  stateSignatures: string[];
  handoffDoneBy: Set<string>;
}

// EMIT_TURN tool for structured output - dynamized for any participant names
function createEmitTurnTool(participantNames: string[]) {
  const targetEnum = [...participantNames, "All"];

  return {
    name: "emit_turn",
    description:
      "REQUIRED at the end of every turn. Reports your public message and control signals to the orchestrator.",
    input_schema: {
      type: "object" as const,
      properties: {
        public_message: {
          type: "string",
          description:
            "Your natural language response that will be shown in the chat transcript.",
        },
        next_action: {
          type: "string",
          enum: ["CONTINUE", "WAIT_FOR_USER", "HANDOFF_DONE"],
          description: `Control signal for the orchestrator:
- CONTINUE: More discussion needed between assistants
- WAIT_FOR_USER: Cannot proceed without user input
- HANDOFF_DONE: Plan is complete for user review`,
        },
        questions_for_user: {
          type: "array",
          items: {
            type: "object",
            properties: {
              target: {
                type: "string",
                enum: targetEnum,
                description: "Who needs to answer - only target YOUR OWNER",
              },
              question: {
                type: "string",
                description: "The specific question",
              },
            },
            required: ["target", "question"],
          },
        },
        state_patch: {
          type: "object",
          properties: {
            leading_option: { type: "string" },
            status_summary: {
              type: "array",
              items: { type: "string" },
            },
            add_constraints: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  participantId: { type: "string" },
                  constraint: { type: "string" },
                },
                required: ["participantId", "constraint"],
              },
            },
            add_questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  target: { type: "string" },
                  question: { type: "string" },
                },
                required: ["target", "question"],
              },
            },
            resolve_question_ids: {
              type: "array",
              items: { type: "string" },
            },
            suggested_next_steps: {
              type: "array",
              items: { type: "string" },
            },
            stage: {
              type: "string",
              enum: ["negotiating", "searching", "waiting_for_user", "converged"],
            },
          },
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        reason_brief: {
          type: "string",
        },
        next_speaker: {
          type: "string",
          description: "ID of the next assistant to speak (optional)",
        },
      },
      required: [
        "public_message",
        "next_action",
        "questions_for_user",
        "state_patch",
        "confidence",
        "reason_brief",
      ],
    },
  };
}

/**
 * Generate system prompt for an assistant in group context
 */
function generateAssistantSystemPrompt(
  ownerName: string,
  ownerProfile: string[],
  otherParticipants: { name: string; isAssistant: boolean }[],
  canonicalState: CanonicalState,
  hasCalendar: boolean
): string {
  const profileSection = formatProfileForPrompt(ownerProfile);

  // Format session constraints
  const sessionConstraints = canonicalState.constraints
    ?.filter((c) => c.source === "session_statement")
    .map((c) => `- ${c.participantId}: ${c.constraint}`)
    .join("\n") || "";

  const sessionConstraintsSection = sessionConstraints
    ? `\n## Active Session Constraints (OVERRIDE stored preferences)\n${sessionConstraints}\n`
    : "";

  // Format open questions
  const openQuestions = canonicalState.openQuestions
    ?.filter((q) => !q.resolved)
    .map((q) => `- [${q.target}] (id: ${q.id}) ${q.question}`)
    .join("\n") || "";

  const openQuestionsSection = openQuestions
    ? `\n## Open Questions Awaiting Answers\n${openQuestions}\n`
    : "";

  // Format other participants
  const otherAssistants = otherParticipants
    .filter((p) => p.isAssistant)
    .map((p) => p.name);
  const otherHumans = otherParticipants
    .filter((p) => !p.isAssistant)
    .map((p) => p.name);

  const calendarNote = hasCalendar
    ? `You have access to ${ownerName}'s calendar. Use calendar tools to check their availability when scheduling is discussed.`
    : `${ownerName} hasn't connected their calendar yet. If scheduling comes up, mention they can connect it in their personal assistant settings.`;

  return `You are ${ownerName}'s personal assistant in a collaborative planning session with ${otherParticipants.length} other participants.

## Your Owner's Profile
${profileSection || "No profile information stored yet."}
${sessionConstraintsSection}
## Calendar Access
${calendarNote}
${openQuestionsSection}
## Current State
- Goal: ${canonicalState.goal || "Not set"}
- Leading option: ${canonicalState.leadingOption || "None yet"}
- Stage: ${canonicalState.stage || "negotiating"}

## Other Participants
- Other assistants: ${otherAssistants.join(", ") || "None"}
- Other users: ${otherHumans.join(", ") || "None"}

## Your Behavior Guidelines

1. **Represent ${ownerName}'s preferences**: Use their profile as starting points, but session statements override immediately.

2. **Be collaborative**: Work WITH other assistants to find win-win solutions.

3. **Questions - ONLY ask ${ownerName}**: Never ask questions to other users directly. If you need info from them, ask their assistant.

4. **Use calendar when relevant**: If scheduling is discussed, check ${ownerName}'s calendar availability.

5. **Drive momentum**: Propose concrete options (max 3), don't just ask open-ended questions.

6. **Know when to stop**:
   - Need info from ${ownerName} → WAIT_FOR_USER
   - All assistants aligned on a plan → HANDOFF_DONE
   - More discussion needed → CONTINUE

7. **Use web search when helpful**: For current info (restaurants, events, reviews).

## REQUIRED: Structured Output

You MUST call the \`emit_turn\` tool at the end with:
- public_message: Your conversational response
- next_action: CONTINUE, WAIT_FOR_USER, or HANDOFF_DONE
- questions_for_user: Questions for ${ownerName} only
- state_patch: Updates to room state (status_summary should be 2-4 bullets, consolidated)
- confidence: 0-1 score
- reason_brief: Why you chose this action`;
}

/**
 * Format conversation context for the assistant
 */
function formatGroupConversation(
  messages: GroupMessageData[],
  currentAssistantName: string
): string {
  if (messages.length === 0) {
    return "This is the start of the conversation. Be the first to respond and propose options.";
  }

  const formatted = messages
    .map((m) => `**${m.authorName}**: ${m.content}`)
    .join("\n\n");

  return `Here is the conversation so far:

${formatted}

Now respond as ${currentAssistantName}. Coordinate with other assistants and help move toward a decision.

Remember: You MUST call the emit_turn tool at the end of your response.`;
}

/**
 * Apply state patch to canonical state
 */
function applyStatePatch(
  currentState: CanonicalState,
  patch: Partial<StatePatch>,
  updatedBy: string
): CanonicalState {
  const newState = { ...currentState };

  if (patch.leading_option) {
    newState.leadingOption = patch.leading_option;
  }

  if (patch.status_summary) {
    newState.statusSummary = patch.status_summary;
  }

  if (patch.stage) {
    newState.stage = patch.stage;
  }

  if (patch.suggested_next_steps) {
    newState.suggestedNextSteps = patch.suggested_next_steps;
  }

  // Add new constraints (deduplicated)
  if (patch.add_constraints) {
    const existing = new Set(
      (newState.constraints || []).map((c) => `${c.participantId}:${c.constraint}`)
    );
    for (const c of patch.add_constraints) {
      const key = `${c.participantId}:${c.constraint}`;
      if (!existing.has(key)) {
        newState.constraints = [
          ...(newState.constraints || []),
          {
            participantId: c.participantId,
            constraint: c.constraint,
            source: "session_statement" as const,
            addedAt: new Date().toISOString(),
          },
        ];
        existing.add(key);
      }
    }
  }

  // Add new questions (deduplicated)
  if (patch.add_questions) {
    const existing = new Set(
      (newState.openQuestions || []).map((q) => q.question)
    );
    for (const q of patch.add_questions) {
      if (!existing.has(q.question)) {
        const newQuestion: OpenQuestion = {
          id: crypto.randomUUID(),
          target: q.target as "Alice" | "Bob" | "All",
          question: q.question,
          askedBy: updatedBy,
          askedAt: new Date().toISOString(),
          resolved: false,
        };
        newState.openQuestions = [...(newState.openQuestions || []), newQuestion];
        existing.add(q.question);
      }
    }
  }

  // Resolve questions
  if (patch.resolve_questions || (patch as { resolve_question_ids?: string[] }).resolve_question_ids) {
    const idsToResolve = new Set(
      patch.resolve_questions || (patch as { resolve_question_ids?: string[] }).resolve_question_ids || []
    );
    newState.openQuestions = (newState.openQuestions || []).map((q) =>
      idsToResolve.has(q.id) ? { ...q, resolved: true } : q
    );
  }

  newState.lastUpdatedAt = new Date().toISOString();
  newState.lastUpdatedBy = updatedBy;

  return newState;
}

/**
 * Compute state signature for stall detection
 */
function computeStateSignature(state: CanonicalState): string {
  const parts = [
    state.goal || "",
    state.leadingOption || "",
    (state.openQuestions || [])
      .filter((q) => !q.resolved)
      .map((q) => q.question)
      .sort()
      .join("|"),
    (state.suggestedNextSteps || []).sort().join("|"),
    state.stage || "",
  ];
  return parts.join(":::");
}

/**
 * Main orchestration function for group collaboration
 */
export async function* orchestrateGroupRun(
  groupId: string,
  triggerMessageId: string,
  participants: GroupParticipant[],
  messages: GroupMessageData[],
  canonicalState: CanonicalState,
  goal: string
): AsyncGenerator<GroupCollaborationEvent> {
  const runId = crypto.randomUUID();

  const runState: RunState = {
    runId,
    turnCount: 0,
    lastSpeaker: null,
    stopReason: null,
    stateSignatures: [],
    handoffDoneBy: new Set(),
  };

  let consecutiveErrors = 0;
  let currentState = { ...canonicalState, goal };

  // Get assistant participants
  const assistants = participants.filter((p) => p.kind === "assistant");
  const humans = participants.filter((p) => p.kind === "human");

  if (assistants.length === 0) {
    yield { type: "error", error: "No assistants in group" };
    yield { type: "done", stopReason: "ERROR" };
    return;
  }

  // Get human names for prompt
  const humanNames = humans.map((h) => h.displayName);

  let currentAssistantIndex = 0;

  yield { type: "status", status: "Starting collaboration..." };

  while (!runState.stopReason) {
    // Check hard cap
    if (runState.turnCount >= MAX_ASSISTANT_TURNS_PER_RUN) {
      runState.stopReason = "CAP_REACHED";
      currentState.stage = "waiting_for_user";
      yield { type: "state_update", state: currentState };
      break;
    }

    const assistant = assistants[currentAssistantIndex];
    const ownerHuman = humans.find((h) => h.id === assistant.ownerHumanId);

    if (!ownerHuman) {
      console.error(`No owner found for assistant ${assistant.id}`);
      currentAssistantIndex = (currentAssistantIndex + 1) % assistants.length;
      continue;
    }

    // Get owner's profile
    const ownerProfile = ownerHuman.userId
      ? await getUserProfile(ownerHuman.userId)
      : [];

    // Build other participants info
    const otherParticipants = participants
      .filter((p) => p.id !== assistant.id && p.id !== ownerHuman.id)
      .map((p) => ({
        name: p.displayName,
        isAssistant: p.kind === "assistant",
      }));

    // Generate system prompt
    const systemPrompt = generateAssistantSystemPrompt(
      ownerHuman.displayName,
      ownerProfile,
      otherParticipants,
      currentState,
      assistant.hasCalendar || false
    );

    const conversationContext = formatGroupConversation(
      messages,
      assistant.displayName
    );

    const userMessage = `${goal ? `**Goal**: ${goal}\n\n` : ""}${conversationContext}`;

    try {
      // Build tools - emit_turn + calendar (if available) + web search
      const emitTurnTool = createEmitTurnTool(humanNames);
      const tools: Anthropic.Messages.Tool[] = [
        emitTurnTool as unknown as Anthropic.Messages.Tool,
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        } as unknown as Anthropic.Messages.Tool,
      ];

      // Add calendar tools if user has calendar access
      let calendarTools: Anthropic.Messages.Tool[] = [];
      if (assistant.hasCalendar && ownerHuman.userId) {
        calendarTools = createCalendarToolsForUser(ownerHuman.displayName);
        tools.push(...calendarTools);
      }

      // Call the assistant
      const { content, citations, meta, calendarCalls } = await callGroupAssistant(
        systemPrompt,
        userMessage,
        tools,
        ownerHuman.userId || null,
        calendarTools.map((t) => t.name)
      );

      runState.turnCount++;
      consecutiveErrors = 0;

      // Create message
      const messageData: GroupMessageData = {
        id: crypto.randomUUID(),
        groupId,
        authorId: assistant.id,
        authorName: assistant.displayName,
        role: "assistant",
        content,
        citations: citations.length > 0 ? citations : undefined,
        createdAt: new Date().toISOString(),
      };

      // Save to database
      await prisma.groupMessage.create({
        data: {
          id: messageData.id,
          groupId,
          authorId: messageData.authorId,
          authorName: messageData.authorName,
          role: "assistant",
          content: messageData.content,
          citations: citations.length > 0 ? JSON.stringify(citations) : null,
        },
      });

      messages.push(messageData);
      yield { type: "message", message: messageData };

      // Apply state patch
      if (meta?.state_patch) {
        const patch = { ...meta.state_patch } as Partial<StatePatch> & { resolve_question_ids?: string[] };
        if (patch.resolve_question_ids) {
          (patch as Partial<StatePatch>).resolve_questions = patch.resolve_question_ids;
        }
        currentState = applyStatePatch(currentState, patch as Partial<StatePatch>, assistant.id);

        // Save state to database
        await prisma.group.update({
          where: { id: groupId },
          data: {
            canonicalState: JSON.stringify(currentState),
            lastActiveAt: new Date(),
          },
        });

        yield { type: "state_update", state: currentState };
      }

      // Check stall detection
      const currentSignature = computeStateSignature(currentState);
      const signatureRepeats = runState.stateSignatures.filter(
        (s) => s === currentSignature
      ).length;
      runState.stateSignatures.push(currentSignature);

      if (signatureRepeats >= STALL_REPEAT_THRESHOLD) {
        runState.stopReason = "STALL_DETECTED";
        currentState.stage = "waiting_for_user";
        yield { type: "state_update", state: currentState };
        break;
      }

      // Evaluate stop rules
      if (meta) {
        const stopDecision = evaluateGroupStopRules(
          runState,
          meta,
          assistant.id,
          assistants,
          currentState
        );

        if (stopDecision) {
          runState.stopReason = stopDecision;
          if (stopDecision === "WAIT_FOR_USER") {
            currentState.stage = "waiting_for_user";
          } else if (stopDecision === "HANDOFF_DONE") {
            currentState.stage = "converged";
          }
          yield { type: "state_update", state: currentState };
          break;
        }

        // Handle next_speaker hint
        if (meta.next_speaker) {
          const requestedIndex = assistants.findIndex((a) => a.id === meta.next_speaker);
          if (requestedIndex !== -1) {
            currentAssistantIndex = requestedIndex;
          } else {
            currentAssistantIndex = (currentAssistantIndex + 1) % assistants.length;
          }
        } else {
          currentAssistantIndex = (currentAssistantIndex + 1) % assistants.length;
        }
      } else {
        currentAssistantIndex = (currentAssistantIndex + 1) % assistants.length;
      }

      runState.lastSpeaker = assistant.id;
    } catch (error) {
      console.error(`Error calling assistant ${assistant.displayName}:`, error);
      consecutiveErrors++;

      yield {
        type: "error",
        error: `${assistant.displayName} encountered an error`,
      };

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        runState.stopReason = "ERROR";
        currentState.stage = "waiting_for_user";
        yield { type: "state_update", state: currentState };
        break;
      }

      currentAssistantIndex = (currentAssistantIndex + 1) % assistants.length;
    }
  }

  // Save final state
  await prisma.group.update({
    where: { id: groupId },
    data: {
      canonicalState: JSON.stringify(currentState),
      lastActiveAt: new Date(),
    },
  });

  yield { type: "done", stopReason: runState.stopReason || "ERROR" };
}

/**
 * Evaluate stop rules for group orchestration
 */
function evaluateGroupStopRules(
  runState: RunState,
  meta: TurnMeta,
  assistantId: string,
  assistants: GroupParticipant[],
  currentState: CanonicalState
): StopReason | null {
  const minTurnsForEarlyStop = Math.min(2, assistants.length);

  if (meta.next_action === "WAIT_FOR_USER") {
    if (runState.turnCount >= minTurnsForEarlyStop) {
      return "WAIT_FOR_USER";
    }
  }

  if (
    meta.confidence < CONFIDENCE_THRESHOLD &&
    meta.questions_for_user &&
    meta.questions_for_user.length > 0 &&
    runState.turnCount >= minTurnsForEarlyStop
  ) {
    return "WAIT_FOR_USER";
  }

  if (meta.next_action === "HANDOFF_DONE") {
    runState.handoffDoneBy.add(assistantId);

    const allDone = assistants.every((a) => runState.handoffDoneBy.has(a.id));
    const unresolvedQuestions = (currentState.openQuestions || []).filter(
      (q) => !q.resolved
    );

    if (allDone && unresolvedQuestions.length === 0) {
      return "HANDOFF_DONE";
    }

    if (runState.turnCount >= minTurnsForEarlyStop && unresolvedQuestions.length === 0) {
      return "HANDOFF_DONE";
    }
  }

  return null;
}

/**
 * Call assistant with tools and handle calendar calls
 */
async function callGroupAssistant(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Messages.Tool[],
  userId: string | null,
  calendarToolNames: string[]
): Promise<{
  content: string;
  citations: Citation[];
  meta: TurnMeta | null;
  calendarCalls: { tool: string; result: string }[];
}> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      let response = await anthropic.messages.create({
        model: ASSISTANT_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        tool_choice: { type: "any" },
        messages: [{ role: "user", content: userMessage }],
      });

      const calendarCalls: { tool: string; result: string }[] = [];
      let content = "";
      const citations: Citation[] = [];
      let meta: TurnMeta | null = null;

      // Handle tool use loop for calendar calls
      while (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.Messages.ToolUseBlock =>
            block.type === "tool_use"
        );

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          if (toolUse.name === "emit_turn") {
            // Parse emit_turn
            const input = toolUse.input as {
              public_message: string;
              next_action: string;
              questions_for_user: Array<{ target: string; question: string }>;
              state_patch: Partial<StatePatch>;
              confidence: number;
              reason_brief: string;
              next_speaker?: string;
            };

            meta = {
              next_action: (input.next_action || "CONTINUE") as "CONTINUE" | "WAIT_FOR_USER" | "HANDOFF_DONE",
              questions_for_user: input.questions_for_user || [],
              state_patch: input.state_patch || {},
              confidence: typeof input.confidence === "number" ? input.confidence : 0.5,
              reason_brief: input.reason_brief || "",
              next_speaker: input.next_speaker,
            };

            if (input.public_message) {
              content = input.public_message;
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: "Turn recorded successfully",
            });
          } else if (calendarToolNames.includes(toolUse.name) && userId) {
            // Execute calendar tool
            try {
              const result = await executeCalendarTool(
                userId,
                toolUse.name,
                toolUse.input as Record<string, unknown>
              );
              calendarCalls.push({ tool: toolUse.name, result });
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: result,
              });
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : "Calendar error";
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: `Error: ${errorMsg}`,
                is_error: true,
              });
            }
          } else {
            // Unknown tool or web search - just acknowledge
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: "Tool executed",
            });
          }
        }

        // Continue conversation if we need to (calendar calls need follow-up)
        if (toolResults.length > 0 && !meta) {
          response = await anthropic.messages.create({
            model: ASSISTANT_MODEL,
            max_tokens: 4096,
            system: systemPrompt,
            tools,
            messages: [
              { role: "user", content: userMessage },
              { role: "assistant", content: response.content },
              { role: "user", content: toolResults },
            ],
          });
        } else {
          break;
        }
      }

      // Parse any remaining text blocks
      for (const block of response.content) {
        if (block.type === "text") {
          if (!content) content += block.text;
          if ("citations" in block && Array.isArray(block.citations)) {
            for (const citation of block.citations as Array<{
              url?: string;
              title?: string;
              cited_text?: string;
            }>) {
              citations.push({
                url: citation.url || "",
                title: citation.title,
                citedText: citation.cited_text,
              });
            }
          }
        }
      }

      // Clean up content
      content = content.replace(/<cite[^>]*>([^<]*)<\/cite>/g, "$1").trim();
      if (!content && meta) {
        content = "I'm analyzing the options...";
      }

      return { content, citations, meta, calendarCalls };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Handle web search not available
      if (errorMessage.includes("web_search")) {
        const filteredTools = tools.filter(
          (t) => !("name" in t && t.name === "web_search")
        );

        const response = await anthropic.messages.create({
          model: ASSISTANT_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          tools: filteredTools,
          tool_choice: { type: "any" },
          messages: [{ role: "user", content: userMessage }],
        });

        return parseSimpleResponse(response);
      }

      // Handle rate limits
      if (errorMessage.includes("429") || errorMessage.includes("rate_limit")) {
        lastError = error;
        if (attempt < MAX_RATE_LIMIT_RETRIES) {
          const delay = RATE_LIMIT_RETRY_DELAY_MS * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Parse simple response without tool loop
 */
function parseSimpleResponse(response: Anthropic.Messages.Message): {
  content: string;
  citations: Citation[];
  meta: TurnMeta | null;
  calendarCalls: { tool: string; result: string }[];
} {
  let content = "";
  const citations: Citation[] = [];
  let meta: TurnMeta | null = null;

  for (const block of response.content) {
    if (block.type === "text") {
      content += block.text;
    } else if (block.type === "tool_use" && block.name === "emit_turn") {
      const input = block.input as {
        public_message: string;
        next_action: string;
        questions_for_user: Array<{ target: string; question: string }>;
        state_patch: Partial<StatePatch>;
        confidence: number;
        reason_brief: string;
        next_speaker?: string;
      };

      meta = {
        next_action: (input.next_action || "CONTINUE") as "CONTINUE" | "WAIT_FOR_USER" | "HANDOFF_DONE",
        questions_for_user: input.questions_for_user || [],
        state_patch: input.state_patch || {},
        confidence: typeof input.confidence === "number" ? input.confidence : 0.5,
        reason_brief: input.reason_brief || "",
        next_speaker: input.next_speaker,
      };

      if (input.public_message) {
        content = input.public_message;
      }
    }
  }

  content = content.replace(/<cite[^>]*>([^<]*)<\/cite>/g, "$1").trim();
  if (!content && meta) {
    content = "I'm analyzing the options...";
  }

  return { content, citations, meta, calendarCalls: [] };
}
