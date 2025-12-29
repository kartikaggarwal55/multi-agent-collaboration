// CHANGED: Complete rewrite - Orchestrator with dynamic stopping loop
// Replaces fixed cap with interruptible, deterministic stop rules

import Anthropic from "@anthropic-ai/sdk";
import {
  Message,
  Citation,
  TurnMeta,
  NextAction,
  StopReason,
  OrchestratorRunState,
  StatePatch,
} from "../types";
import {
  getRoom,
  addMessage,
  updateSummary,
  getAssistants,
  getParticipant,
  getPreferencesForHuman,
  applyStatePatch,
  computeStateSignature,
  updateStage,
  setActiveRun,
  shouldCancelRun,
  generateSummaryFromCanonicalState,
  getUnresolvedQuestions,
} from "../store";
import {
  systemPromptForAssistant,
  formatConversationContext,
  EMIT_TURN_TOOL,
  generateCapReachedHandoff,
  generateStallUnblockQuestion,
} from "./prompts";

// Initialize Anthropic client
const anthropic = new Anthropic();

// Model configuration
const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || "claude-sonnet-4-5";

// CHANGED: Dynamic stopping configuration
const MAX_ASSISTANT_TURNS_PER_RUN = 12; // Hard cap on total assistant turns
const CONFIDENCE_THRESHOLD = 0.55; // Below this + questions = WAIT_FOR_USER
const STALL_REPEAT_THRESHOLD = 2; // Stop if signature repeats this many times

// Error handling configuration
const MAX_CONSECUTIVE_ERRORS = 3; // Stop after this many consecutive errors
const RATE_LIMIT_RETRY_DELAY_MS = 2000; // Base delay for rate limit retries
const MAX_RATE_LIMIT_RETRIES = 2; // Max retries for rate limit errors

// Event types for streaming
export type CollaborationEvent =
  | { type: "message"; message: Message }
  | { type: "summary"; summary: string }
  | { type: "error"; error: string }
  | { type: "status"; status: string }
  | { type: "done"; stopReason: StopReason };

// CHANGED: Logging helper for dev ergonomics
function logStep(
  runState: OrchestratorRunState,
  assistantName: string,
  meta: TurnMeta | null,
  decision: string
): void {
  console.log(
    `[Run ${runState.runId.slice(0, 8)}] Turn ${runState.turnCount} | ${assistantName} | ` +
      `action=${meta?.next_action || "PARSE_FAILED"} | confidence=${meta?.confidence?.toFixed(2) || "N/A"} | ` +
      `decision: ${decision}`
  );
}

/**
 * CHANGED: Main orchestration function with dynamic stopping
 */
export async function* orchestrateRun(
  roomId: string,
  triggerMessageId: string
): AsyncGenerator<CollaborationEvent> {
  const runId = crypto.randomUUID();
  setActiveRun(runId);

  // CHANGED: Initialize run state with error tracking
  const runState: OrchestratorRunState = {
    runId,
    turnCount: 0,
    lastSpeaker: null,
    stopReason: null,
    stateSignatures: [],
    handoffDoneBy: new Set(),
    cancelled: false,
  };

  // CHANGED: Track consecutive errors
  let consecutiveErrors = 0;

  const assistants = getAssistants();
  let currentAssistantIndex = 0;

  yield { type: "status", status: "Starting collaboration..." };

  // CHANGED: Dynamic loop with stop rules
  while (!runState.stopReason) {
    // Check cancellation
    if (shouldCancelRun(runId)) {
      runState.stopReason = "CANCELLED";
      logStep(runState, "system", null, "Run cancelled - new user message arrived");
      break;
    }

    // Check hard cap
    if (runState.turnCount >= MAX_ASSISTANT_TURNS_PER_RUN) {
      runState.stopReason = "CAP_REACHED";
      logStep(runState, "system", null, `Hard cap reached (${MAX_ASSISTANT_TURNS_PER_RUN} turns)`);

      // CHANGED: Generate helpful handoff message
      const room = getRoom();
      const lastAssistant = assistants[currentAssistantIndex];
      const handoffContent = generateCapReachedHandoff(
        room.canonicalState,
        lastAssistant.displayName
      );

      const handoffMessage = addMessage({
        role: "assistant",
        authorId: lastAssistant.id,
        authorName: lastAssistant.displayName,
        content: handoffContent,
      });
      yield { type: "message", message: handoffMessage };

      updateStage("waiting_for_user");
      break;
    }

    // Select next speaker (alternating by default)
    const assistant = assistants[currentAssistantIndex];
    const room = getRoom();

    // Get the other assistant
    const otherAssistant = assistants.find((a) => a.id !== assistant.id);
    const ownerHuman = getParticipant(assistant.ownerHumanId!);

    if (!ownerHuman || !otherAssistant) {
      runState.stopReason = "ERROR";
      yield { type: "error", error: "Invalid assistant configuration" };
      break;
    }

    const ownerPrefs = getPreferencesForHuman(ownerHuman.id);

    // CHANGED: Pass canonical state to prompt
    const systemPrompt = systemPromptForAssistant(
      ownerHuman.displayName,
      ownerPrefs,
      otherAssistant.displayName,
      room.canonicalState
    );

    const conversationContext = formatConversationContext(room, assistant.displayName);
    const userMessage = `${room.goal ? `**Goal**: ${room.goal}\n\n` : ""}${conversationContext}`;

    try {
      // CHANGED: Call assistant with emit_turn tool
      const { content, citations, meta } = await callAssistantWithStructuredOutput(
        systemPrompt,
        userMessage
      );

      runState.turnCount++;
      consecutiveErrors = 0; // CHANGED: Reset on success

      // Store the message
      const message = addMessage({
        role: "assistant",
        authorId: assistant.id,
        authorName: assistant.displayName,
        content,
        citations,
      });

      yield { type: "message", message };

      // Apply state patch if present
      if (meta?.state_patch) {
        // Map resolve_question_ids to resolve_questions for the store
        const patch = { ...meta.state_patch } as Partial<StatePatch> & { resolve_question_ids?: string[] };
        if (patch.resolve_question_ids) {
          (patch as Partial<StatePatch>).resolve_questions = patch.resolve_question_ids;
          delete patch.resolve_question_ids;
        }
        applyStatePatch(patch as Partial<StatePatch>, assistant.id);
      }

      // CHANGED: Check state signature for stall detection
      const currentSignature = computeStateSignature();
      const signatureRepeats = runState.stateSignatures.filter(
        (s) => s === currentSignature
      ).length;
      runState.stateSignatures.push(currentSignature);

      if (signatureRepeats >= STALL_REPEAT_THRESHOLD) {
        runState.stopReason = "STALL_DETECTED";
        logStep(runState, assistant.displayName, meta, "Stall detected - state not changing");

        // CHANGED: Add unblock question and stop
        const unblockQ = generateStallUnblockQuestion(room.canonicalState);
        applyStatePatch(
          {
            add_questions: [unblockQ],
            stage: "waiting_for_user",
          },
          "system"
        );
        updateStage("waiting_for_user");
        break;
      }

      // CHANGED: Evaluate stop rules based on meta
      if (meta) {
        const stopDecision = evaluateStopRules(runState, meta, assistant.id, assistants);
        if (stopDecision) {
          runState.stopReason = stopDecision;
          logStep(runState, assistant.displayName, meta, `Stopping: ${stopDecision}`);

          // Update stage based on stop reason
          if (stopDecision === "WAIT_FOR_USER") {
            updateStage("waiting_for_user");
          } else if (stopDecision === "HANDOFF_DONE") {
            updateStage("converged");
          }
          break;
        } else {
          logStep(runState, assistant.displayName, meta, "Continuing");
        }

        // CHANGED: Handle next_speaker hint if provided
        if (meta.next_speaker) {
          const requestedIndex = assistants.findIndex((a) => a.id === meta.next_speaker);
          if (requestedIndex !== -1) {
            currentAssistantIndex = requestedIndex;
          } else {
            // Default: alternate
            currentAssistantIndex = (currentAssistantIndex + 1) % assistants.length;
          }
        } else {
          currentAssistantIndex = (currentAssistantIndex + 1) % assistants.length;
        }
      } else {
        // No valid meta - alternate and continue
        logStep(runState, assistant.displayName, null, "No meta parsed, continuing");
        currentAssistantIndex = (currentAssistantIndex + 1) % assistants.length;
      }

      runState.lastSpeaker = assistant.id;
    } catch (error) {
      console.error(`Error calling assistant ${assistant.displayName}:`, error);
      consecutiveErrors++;

      // CHANGED: Check if rate limited
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRateLimit = errorMessage.includes("429") || errorMessage.includes("rate_limit");

      if (isRateLimit) {
        yield {
          type: "error",
          error: `Rate limited - waiting before retry (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`,
        };
      } else {
        yield {
          type: "error",
          error: `${assistant.displayName} encountered an error`,
        };
      }

      // CHANGED: Stop if too many consecutive errors
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        runState.stopReason = "ERROR";
        logStep(runState, assistant.displayName, null, `Stopping after ${consecutiveErrors} consecutive errors`);
        yield { type: "error", error: "Too many errors - stopping collaboration" };
        updateStage("waiting_for_user");
        break;
      }

      // Continue with other assistant on error
      currentAssistantIndex = (currentAssistantIndex + 1) % assistants.length;
    }
  }

  // CHANGED: Generate summary from canonical state
  const finalRoom = getRoom();
  const summary = generateSummaryFromCanonicalState();
  updateSummary(summary);

  yield { type: "summary", summary };
  yield { type: "done", stopReason: runState.stopReason || "ERROR" };

  setActiveRun(null);
}

/**
 * CHANGED: Evaluate stop rules and return stop reason if should stop
 * CHANGED: Added minimum turn requirement - both assistants must speak at least once
 */
function evaluateStopRules(
  runState: OrchestratorRunState,
  meta: TurnMeta,
  assistantId: string,
  assistants: { id: string }[]
): StopReason | null {
  // CHANGED: Minimum 2 turns before allowing early stops (both assistants get a chance)
  const minTurnsForEarlyStop = 2;

  // Rule 1: WAIT_FOR_USER - only if both have spoken OR it's explicitly critical
  if (meta.next_action === "WAIT_FOR_USER") {
    // Allow immediate stop only after both assistants have had a turn
    if (runState.turnCount >= minTurnsForEarlyStop) {
      return "WAIT_FOR_USER";
    }
    // Otherwise, continue to let the other assistant speak
    logStep(runState, "evaluateStopRules", meta, "WAIT_FOR_USER deferred - other assistant hasn't spoken yet");
  }

  // Low confidence + questions: only stop after minimum turns
  if (
    meta.confidence < CONFIDENCE_THRESHOLD &&
    meta.questions_for_user &&
    meta.questions_for_user.length > 0 &&
    runState.turnCount >= minTurnsForEarlyStop
  ) {
    return "WAIT_FOR_USER";
  }

  // Rule 2: HANDOFF_DONE with handshake
  if (meta.next_action === "HANDOFF_DONE") {
    runState.handoffDoneBy.add(assistantId);

    // Check if both assistants have signaled done recently
    const allAssistantIds = assistants.map((a) => a.id);
    const allDone = allAssistantIds.every((id) => runState.handoffDoneBy.has(id));

    // Also check no unresolved questions
    const unresolvedQuestions = getUnresolvedQuestions();

    if (allDone && unresolvedQuestions.length === 0) {
      return "HANDOFF_DONE";
    }

    // If only one said done and no questions, allow it after minimum turns
    if (runState.turnCount >= minTurnsForEarlyStop && unresolvedQuestions.length === 0) {
      return "HANDOFF_DONE";
    }
  }

  return null;
}

/**
 * CHANGED: Helper to sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * CHANGED: Call assistant with structured output via emit_turn tool
 * Now with retry logic for rate limits
 */
async function callAssistantWithStructuredOutput(
  systemPrompt: string,
  userMessage: string
): Promise<{ content: string; citations: Citation[]; meta: TurnMeta | null }> {
  // CHANGED: Include emit_turn tool alongside web search
  const tools: Anthropic.Messages.Tool[] = [
    EMIT_TURN_TOOL as unknown as Anthropic.Messages.Tool,
    {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 5,
    } as unknown as Anthropic.Messages.Tool,
  ];

  let lastError: unknown = null;

  // CHANGED: Retry loop for rate limits
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: ASSISTANT_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        tool_choice: { type: "any" },
        messages: [{ role: "user", content: userMessage }],
      });

      return parseStructuredResponse(response);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // CHANGED: Handle web search errors
      if (errorMessage.includes("web_search")) {
        console.log("Web search not available, retrying without it");
        const toolsWithoutWebSearch = [
          EMIT_TURN_TOOL as unknown as Anthropic.Messages.Tool,
        ];

        const response = await anthropic.messages.create({
          model: ASSISTANT_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          tools: toolsWithoutWebSearch,
          tool_choice: { type: "any" },
          messages: [{ role: "user", content: userMessage }],
        });

        return parseStructuredResponse(response);
      }

      // CHANGED: Handle rate limits with retry
      if (errorMessage.includes("429") || errorMessage.includes("rate_limit")) {
        lastError = error;
        if (attempt < MAX_RATE_LIMIT_RETRIES) {
          const delay = RATE_LIMIT_RETRY_DELAY_MS * Math.pow(2, attempt); // Exponential backoff
          console.log(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES}`);
          await sleep(delay);
          continue;
        }
      }

      throw error;
    }
  }

  // If we exhausted retries, throw the last error
  throw lastError;
}

/**
 * CHANGED: Parse response with emit_turn tool call
 */
function parseStructuredResponse(response: Anthropic.Messages.Message): {
  content: string;
  citations: Citation[];
  meta: TurnMeta | null;
} {
  let content = "";
  const citations: Citation[] = [];
  let meta: TurnMeta | null = null;

  for (const block of response.content) {
    if (block.type === "text") {
      // Collect any text (might be empty if tool-only response)
      content += block.text;

      // Check for citations
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
    } else if (block.type === "tool_use") {
      if (block.name === "emit_turn") {
        // CHANGED: Parse structured turn output
        try {
          const input = block.input as {
            public_message: string;
            next_action: NextAction;
            questions_for_user: Array<{ target: "Alice" | "Bob" | "All"; question: string }>;
            state_patch: Partial<StatePatch>;
            confidence: number;
            reason_brief: string;
            next_speaker?: "alice-assistant" | "bob-assistant";
          };

          meta = {
            next_action: input.next_action || "CONTINUE",
            questions_for_user: input.questions_for_user || [],
            state_patch: input.state_patch || {},
            confidence: typeof input.confidence === "number" ? input.confidence : 0.5,
            reason_brief: input.reason_brief || "",
            next_speaker: input.next_speaker,
          };

          // Use public_message as content
          if (input.public_message) {
            content = input.public_message;
          }
        } catch (parseError) {
          console.error("Failed to parse emit_turn input:", parseError);
        }
      } else if (block.name === "web_search") {
        // Web search was used - note it
        content += "\n[Searched the web for information]\n";
      }
    }
  }

  // Deduplicate citations
  const uniqueCitations = citations.filter(
    (citation, index, self) =>
      index === self.findIndex((c) => c.url === citation.url)
  );

  // CHANGED: Strip raw <cite> tags from content (web search artifact)
  content = content.replace(/<cite[^>]*>([^<]*)<\/cite>/g, "$1");

  // Fallback if no content from tool
  if (!content.trim() && meta) {
    content = "I'm analyzing the options...";
  }

  return { content: content.trim(), citations: uniqueCitations, meta };
}

// CHANGED: Legacy streaming function now uses orchestrateRun
export async function* runCollaborationBurstStream(
  roomId: string,
  triggerMessageId: string
): AsyncGenerator<CollaborationEvent> {
  yield* orchestrateRun(roomId, triggerMessageId);
}

/**
 * Legacy non-streaming version
 */
export async function runCollaborationBurst(
  roomId: string,
  triggerMessageId: string
): Promise<{ newMessages: Message[]; summary: string; stopReason: StopReason }> {
  const newMessages: Message[] = [];
  let summary = "";
  let stopReason: StopReason = "ERROR";

  for await (const event of orchestrateRun(roomId, triggerMessageId)) {
    if (event.type === "message") {
      newMessages.push(event.message);
    } else if (event.type === "summary") {
      summary = event.summary;
    } else if (event.type === "done") {
      stopReason = event.stopReason;
    }
  }

  return { newMessages, summary, stopReason };
}
