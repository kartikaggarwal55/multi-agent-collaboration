// Agent prompts for the collaboration system
// Keep prompts cleanly separated for easy iteration
// CHANGED: Complete rewrite for structured output and session override support

import { RoomState, CanonicalState } from "../types";

// CHANGED: Tool definition for structured turn output
export const EMIT_TURN_TOOL = {
  name: "emit_turn",
  description:
    "REQUIRED at the end of every turn. Reports your public message and control signals to the orchestrator.",
  input_schema: {
    type: "object" as const,
    properties: {
      public_message: {
        type: "string",
        description:
          "Your natural language response that will be shown in the chat transcript. Should read naturally and conversationally.",
      },
      next_action: {
        type: "string",
        enum: ["CONTINUE", "WAIT_FOR_USER", "HANDOFF_DONE"],
        description: `Control signal for the orchestrator:
- CONTINUE: More discussion needed between assistants, no user input required yet
- WAIT_FOR_USER: Cannot proceed without user input (you have a question that only they can answer)
- HANDOFF_DONE: You believe the plan is sufficiently complete for user review`,
      },
      questions_for_user: {
        type: "array",
        items: {
          type: "object",
          properties: {
            target: {
              type: "string",
              enum: ["Alice", "Bob", "All"],
              description: "Who needs to answer this question - YOU SHOULD ONLY TARGET YOUR OWN OWNER",
            },
            question: {
              type: "string",
              description: "The specific question for the user",
            },
          },
          required: ["target", "question"],
        },
        description:
          "Questions for YOUR OWNER ONLY. Never ask questions to the other user - let their assistant handle that.",
      },
      state_patch: {
        type: "object",
        properties: {
          leading_option: {
            type: "string",
            description: "Current best option/plan if one has emerged",
          },
          status_summary: {
            type: "array",
            items: { type: "string" },
            description: "Brief bullet points on current status",
          },
          add_constraints: {
            type: "array",
            items: {
              type: "object",
              properties: {
                participantId: {
                  type: "string",
                  enum: ["alice", "bob"],
                },
                constraint: { type: "string" },
              },
              required: ["participantId", "constraint"],
            },
            description: "New constraints surfaced this turn",
          },
          add_questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                target: { type: "string", enum: ["Alice", "Bob", "All"] },
                question: { type: "string" },
              },
              required: ["target", "question"],
            },
            description: "Questions to add to the open questions list",
          },
          resolve_question_ids: {
            type: "array",
            items: { type: "string" },
            description: "IDs of questions that have been answered and should be marked resolved",
          },
          suggested_next_steps: {
            type: "array",
            items: { type: "string" },
            description: "Concrete next actions",
          },
          stage: {
            type: "string",
            enum: ["negotiating", "searching", "waiting_for_user", "converged"],
            description: "Current stage of the collaboration",
          },
        },
        description: "Incremental updates to the room state",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "Your confidence (0-1) that the collaboration can proceed without user input. Low confidence + questions = WAIT_FOR_USER.",
      },
      reason_brief: {
        type: "string",
        description:
          "1-2 sentences explaining your next_action choice. Not shown to users.",
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

/**
 * CHANGED: System prompt for a personal assistant with structured output and session override rules
 */
export function systemPromptForAssistant(
  ownerName: string,
  ownerPrefs: string,
  otherAssistantName: string,
  canonicalState: CanonicalState
): string {
  // CHANGED: Format session constraints if any exist
  const sessionConstraints = canonicalState.constraints
    .filter((c) => c.source === "session_statement")
    .map((c) => `- ${c.participantId}: ${c.constraint}`)
    .join("\n");

  const sessionConstraintsSection = sessionConstraints
    ? `\n## Active Session Constraints (OVERRIDE stored preferences)\n${sessionConstraints}\n`
    : "";

  // Format open questions with IDs so they can be resolved
  const openQuestions = canonicalState.openQuestions
    .filter((q) => !q.resolved)
    .map((q) => `- [${q.target}] (id: ${q.id}) ${q.question}`)
    .join("\n");

  const openQuestionsSection = openQuestions
    ? `\n## Open Questions Awaiting Answers\n${openQuestions}\nNote: Use the question IDs in resolve_question_ids when a question has been answered.\n`
    : "";

  return `You are ${ownerName}'s personal assistant in a collaborative planning session. Work constructively with ${otherAssistantName} to reach a good outcome.

## Your Owner's Baseline Preferences (treat as PRIORS, not hard constraints)
${ownerPrefs}
${sessionConstraintsSection}
## CRITICAL: Session Authority Rule
The user's most recent explicit statements in this conversation IMMEDIATELY UPDATE their constraints.
- If ${ownerName} says something that contradicts their stored preferences, ACCEPT IT without argument.
- You may ask ONE brief confirmation if it's a major change ("Just to confirm, you're now open to X?")
- After confirmation OR if they repeat themselves, proceed without re-arguing stored preferences.
- Do NOT repeatedly cite historical preferences to block progress.
- Be non-judgmental about preference changes.
${openQuestionsSection}
## Current State
- Goal: ${canonicalState.goal || "Not set"}
- Leading option: ${canonicalState.leadingOption || "None yet"}
- Stage: ${canonicalState.stage}

## Your Behavior Guidelines

1. **Represent your owner's CURRENT preferences**: Use stored preferences as starting points, but session statements override them immediately.

2. **Be collaborative**: Work WITH ${otherAssistantName}, not against them. Look for win-win solutions.

3. **Questions - ONLY ask YOUR owner**:
   - You may ONLY ask questions to ${ownerName} (your owner)
   - NEVER ask questions directly to the other user - that's ${otherAssistantName}'s job
   - You CAN provide updates about ${ownerName}'s preferences to everyone
   - If you need info from the other user, tell ${otherAssistantName} what you need and let them ask

4. **Drive momentum**:
   - Propose concrete options (max 3) rather than open-ended questions
   - Make clear proposals to reduce back-and-forth
   - If blocked, ask at most 1 targeted question TO YOUR OWNER ONLY

5. **Know when to stop**:
   - If you need information only ${ownerName} can provide → WAIT_FOR_USER
   - If you and ${otherAssistantName} have aligned on a solid plan → HANDOFF_DONE
   - If more assistant discussion is productive → CONTINUE

6. **Use tools when helpful**:
   - **Maps search**: Search for places, restaurants, venues - always include Google Maps links
   - **Web search**: For current info, events, reviews when maps doesn't cover it
   - Be specific in queries

7. **Be concise but warm**: 2-4 sentences per point. No walls of text.

8. **Always include links for external information or actions**: Whenever referencing any external information or actions found or created via tools (such as web search, maps, Gmail, calendar, etc.), always include relevant clickable links inline so others can easily verify, access the source, or interact with objects such as draft emails or calendar events.

## REQUIRED: Structured Output

You MUST call the \`emit_turn\` tool at the end of your response with:
- public_message: Your conversational response (shown in chat)
- next_action: CONTINUE, WAIT_FOR_USER, or HANDOFF_DONE
- questions_for_user: Array of questions if next_action is WAIT_FOR_USER
- state_patch: Updates to the room state:
  - status_summary: REPLACE with 2-4 concise bullet points summarizing current state (not additive - consolidate!)
  - leading_option: Current best option/plan
  - resolve_question_ids: IDs of questions that have been answered (very important!)
  - add_constraints: Only NEW constraints not already captured
- confidence: 0-1 score for whether you can proceed without user input
- reason_brief: Why you chose this next_action

**CRITICAL for state_patch:**
- status_summary should be CONCISE (2-4 bullets max) and REPLACE previous summary
- When a user answers a question, ADD its ID to resolve_question_ids
- Do NOT re-add constraints or information that's already in the state
- Consolidate and summarize, don't just accumulate

Your public_message should:
- Be in first person as ${ownerName}'s assistant
- Reference ${otherAssistantName} when responding to their points
- Use natural conversational language
- Include brief bullet points when proposing options`;
}

/**
 * CHANGED: Removed - summary is now generated from canonical state, not LLM
 * Keeping a minimal version for edge cases
 */
export function summaryPrompt(roomState: RoomState): string {
  const messagesText = roomState.messages
    .slice(-5) // Only last 5 messages for efficiency
    .map((m) => `[${m.authorName}]: ${m.content}`)
    .join("\n\n");

  return `Based on this conversation snippet, extract any NEW constraints or decisions mentioned.

## Recent Messages
${messagesText || "No messages"}

## Current Known State
- Goal: ${roomState.canonicalState?.goal || "Not set"}
- Leading option: ${roomState.canonicalState?.leadingOption || "None"}

Output a brief JSON with only NEW information not already in the state:
{
  "new_constraints": [{"participantId": "alice"|"bob", "constraint": "..."}],
  "leading_option_update": "..." or null,
  "new_next_steps": ["..."]
}

If nothing new, output: {"no_updates": true}`;
}

/**
 * Format conversation context with full message history
 */
export function formatConversationContext(
  roomState: RoomState,
  currentAssistantName: string
): string {
  if (roomState.messages.length === 0) {
    return "This is the start of the conversation. Be the first to respond and propose options.";
  }

  // Pass all messages for full context
  const formatted = roomState.messages
    .map((m) => `**${m.authorName}**: ${m.content}`)
    .join("\n\n");

  // CHANGED: Highlight any recent user statements that might be preference updates
  const recentUserMessages = roomState.messages
    .filter((m) => m.role === "user")
    .slice(-3);

  let userContextNote = "";
  if (recentUserMessages.length > 0) {
    userContextNote = `\n\n**Note**: Pay special attention to the users' latest statements - these represent their CURRENT preferences and override any stored defaults.`;
  }

  return `Here is the recent conversation:

${formatted}
${userContextNote}

Now respond as ${currentAssistantName}. Coordinate with the other assistant, respect any updated user preferences, and help move toward a decision.

Remember: You MUST call the emit_turn tool at the end of your response.`;
}

/**
 * CHANGED: Handoff message when hitting hard cap
 */
export function generateCapReachedHandoff(
  canonicalState: CanonicalState,
  assistantName: string
): string {
  const leadingOption = canonicalState.leadingOption || "No clear option yet";
  const openQuestions = canonicalState.openQuestions
    .filter((q) => !q.resolved)
    .slice(0, 2)
    .map((q) => q.question);

  let message = `We've been discussing for a while - let me summarize where we are.\n\n`;
  message += `**Current leading option**: ${leadingOption}\n\n`;

  if (openQuestions.length > 0) {
    message += `**To move forward, we need your input on**:\n`;
    for (const q of openQuestions) {
      message += `- ${q}\n`;
    }
  } else {
    message += `The plan looks ready for your review. Let us know if you'd like to proceed or make changes.`;
  }

  return message;
}

/**
 * CHANGED: Generate stall unblock question
 */
export function generateStallUnblockQuestion(
  canonicalState: CanonicalState
): { target: string; question: string } {
  // Pick the most important open question, or generate a generic one
  const unresolvedQ = canonicalState.openQuestions.find((q) => !q.resolved);
  if (unresolvedQ) {
    return { target: unresolvedQ.target, question: unresolvedQ.question };
  }

  // Generic unblock
  return {
    target: "All",
    question:
      "We seem to be going in circles. What's most important to you for this decision?",
  };
}
