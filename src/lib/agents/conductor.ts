// Conductor: LLM-based routing for group collaboration
// The Conductor only sees shared room state and decides WHO should speak next
// It does NOT generate messages or see private preferences

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CanonicalState } from "../types";

const anthropic = new Anthropic();
const CONDUCTOR_MODEL = process.env.CONDUCTOR_MODEL || "claude-sonnet-4-20250514";

// Conductor output schema
export const ConductorPlanSchema = z.object({
  run_id: z.string(),
  actions: z.array(z.object({
    type: z.literal("CALL_PA"),
    user_id: z.string(),
    assistant_name: z.string(),
    priority: z.number(),
    reason: z.enum(["owner_message", "mentioned", "asked_by_agent", "likely_value"]),
  })),
  stop_condition: z.object({
    type: z.enum(["STOP_NOW", "WAITING_ON_HUMAN", "CONTINUE"]),
    reason: z.string(),
  }),
});

export type ConductorPlan = z.infer<typeof ConductorPlanSchema>;

export interface ConductorInput {
  runId: string;
  participants: Array<{
    id: string;
    name: string;
    kind: "human" | "assistant";
    ownerHumanId?: string;
  }>;
  recentMessages: Array<{
    authorId: string;
    authorName: string;
    role: "user" | "assistant";
    content: string;
    mentions?: string[];
  }>;
  canonicalState: CanonicalState;
  lastPAResults: Array<{
    oderId: string;
    shouldPost: boolean;
    state: string;
    reason: string;
    valueScore: number;
  }>;
  stepCount: number;
}

// Tool definition for structured output
const CONDUCTOR_TOOL = {
  name: "emit_routing_plan",
  description: "Output the routing plan for this orchestration step",
  input_schema: {
    type: "object" as const,
    properties: {
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["CALL_PA"] },
            user_id: { type: "string", description: "The user ID whose PA should be called" },
            assistant_name: { type: "string", description: "Display name of the assistant" },
            priority: { type: "number", description: "1 = highest priority" },
            reason: {
              type: "string",
              enum: ["owner_message", "mentioned", "asked_by_agent", "likely_value"],
              description: "Why this PA should be called",
            },
          },
          required: ["type", "user_id", "assistant_name", "priority", "reason"],
        },
        description: "List of PA calls to make (usually 1-3, often just 1)",
      },
      stop_condition: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["STOP_NOW", "WAITING_ON_HUMAN", "CONTINUE"],
            description: "STOP_NOW: converged, no more progress. WAITING_ON_HUMAN: need user input. CONTINUE: more PA calls needed.",
          },
          reason: { type: "string", description: "Brief explanation" },
        },
        required: ["type", "reason"],
      },
    },
    required: ["actions", "stop_condition"],
  },
};

function buildConductorPrompt(input: ConductorInput): string {
  const { participants, recentMessages, canonicalState, lastPAResults, stepCount } = input;

  const humans = participants.filter(p => p.kind === "human");
  const assistants = participants.filter(p => p.kind === "assistant");

  // Find the last human message author
  const lastHumanMessage = [...recentMessages].reverse().find(m => m.role === "user");
  const lastHumanAuthorId = lastHumanMessage?.authorId;
  const lastHumanAuthorName = lastHumanMessage?.authorName;

  // Check for mentions in the last message
  const lastMessage = recentMessages[recentMessages.length - 1];
  const mentionsInLastMessage = lastMessage?.mentions || [];

  // Check for direct questions to assistants in the last message
  const hasDirectQuestion = lastMessage?.content?.includes("?") || false;

  const participantsList = [
    ...humans.map(h => `- ${h.name} (human, id: ${h.id})`),
    ...assistants.map(a => {
      const owner = humans.find(h => h.id === a.ownerHumanId);
      return `- ${a.name} (assistant for ${owner?.name || "unknown"}, id: ${a.id}, owner_id: ${a.ownerHumanId})`;
    }),
  ].join("\n");

  const messagesContext = recentMessages.slice(-10).map(m => {
    const mentions = m.mentions?.length ? ` [mentions: ${m.mentions.join(", ")}]` : "";
    return `[${m.authorName}]: ${m.content.substring(0, 200)}${m.content.length > 200 ? "..." : ""}${mentions}`;
  }).join("\n");

  const lastPAResultsContext = lastPAResults.length > 0
    ? `\n## Last PA Results (this run)\n${lastPAResults.map(r =>
        `- Owner ${r.oderId}: ${r.state} (value: ${r.valueScore.toFixed(2)}) - ${r.reason}`
      ).join("\n")}`
    : "";

  const stateContext = `
## Current Room State
- Goal: ${canonicalState.goal || "Not set"}
- Leading option: ${canonicalState.leadingOption || "None"}
- Stage: ${canonicalState.stage}
- Open questions: ${canonicalState.openQuestions?.filter(q => !q.resolved).length || 0}
- Step count this run: ${stepCount}`;

  return `You are the Conductor for a multi-user collaboration room. Your job is ROUTING only - deciding which Personal Assistant (PA) should speak next.

## Participants
${participantsList}

## Recent Messages
${messagesContext}
${lastPAResultsContext}
${stateContext}

## Last Message Context
- Last human message from: ${lastHumanAuthorName || "none"} (id: ${lastHumanAuthorId || "none"})
- Mentions in last message: ${mentionsInLastMessage.length > 0 ? mentionsInLastMessage.join(", ") : "none"}
- Contains question: ${hasDirectQuestion ? "yes" : "no"}

## Routing Rules

1. **Owner's PA responds first**: When a human posts, their assistant should respond first (reason: owner_message)

2. **Mentioned assistants**: If an assistant is @mentioned, they should respond (reason: mentioned)

3. **Asked by agent**: If an assistant asks another assistant a direct question, the asked assistant should respond (reason: asked_by_agent)

4. **Likely value**: Only call other PAs if they likely have NEW information to add (reason: likely_value)
   - Don't call PAs just to agree or acknowledge
   - If a PA returned NO_OP in this run, don't call them again unless new context

5. **Stopping conditions**:
   - STOP_NOW: All relevant PAs have responded or returned NO_OP, conversation is stable
   - WAITING_ON_HUMAN: An open question needs human input before progress can continue
   - CONTINUE: More PA calls are needed (but be conservative - prefer WAITING_ON_HUMAN over endless loops)

6. **Safety cap**: If step_count >= 6, strongly prefer STOP_NOW or WAITING_ON_HUMAN

## Your Task

Analyze the current state and decide:
1. Which PA(s) should be called next (if any)
2. What the stop condition should be

Call the emit_routing_plan tool with your decision.`;
}

export async function callConductor(input: ConductorInput): Promise<ConductorPlan> {
  const prompt = buildConductorPrompt(input);

  try {
    const response = await anthropic.messages.create({
      model: CONDUCTOR_MODEL,
      max_tokens: 1024,
      tools: [CONDUCTOR_TOOL as unknown as Anthropic.Messages.Tool],
      tool_choice: { type: "tool", name: "emit_routing_plan" },
      messages: [{ role: "user", content: prompt }],
    });

    // Extract the tool use block
    const toolUse = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUse || toolUse.name !== "emit_routing_plan") {
      console.error("Conductor did not return expected tool use");
      return createFallbackPlan(input);
    }

    const rawPlan = toolUse.input as {
      actions: Array<{
        type: "CALL_PA";
        user_id: string;
        assistant_name: string;
        priority: number;
        reason: "owner_message" | "mentioned" | "asked_by_agent" | "likely_value";
      }>;
      stop_condition: {
        type: "STOP_NOW" | "WAITING_ON_HUMAN" | "CONTINUE";
        reason: string;
      };
    };

    // Validate with zod
    const plan = ConductorPlanSchema.parse({
      run_id: input.runId,
      actions: rawPlan.actions || [],
      stop_condition: rawPlan.stop_condition || { type: "STOP_NOW", reason: "No plan returned" },
    });

    return plan;
  } catch (error) {
    console.error("Conductor error:", error);
    return createFallbackPlan(input);
  }
}

function createFallbackPlan(input: ConductorInput): ConductorPlan {
  // Fallback: call the owner's PA if there was a recent human message
  const lastHumanMessage = [...input.recentMessages].reverse().find(m => m.role === "user");
  const ownerAssistant = input.participants.find(
    p => p.kind === "assistant" && p.ownerHumanId === lastHumanMessage?.authorId
  );

  if (ownerAssistant && input.stepCount === 0) {
    return {
      run_id: input.runId,
      actions: [{
        type: "CALL_PA",
        user_id: ownerAssistant.ownerHumanId!,
        assistant_name: ownerAssistant.name,
        priority: 1,
        reason: "owner_message",
      }],
      stop_condition: { type: "CONTINUE", reason: "Fallback: calling owner PA" },
    };
  }

  return {
    run_id: input.runId,
    actions: [],
    stop_condition: { type: "WAITING_ON_HUMAN", reason: "Fallback: no clear next action" },
  };
}

// Parse mentions from message content
export function parseMentions(content: string, participants: Array<{ name: string; id: string }>): string[] {
  const mentions: string[] = [];

  // Match @Name patterns
  const mentionPattern = /@(\w+(?:'s?\s+\w+)?)/gi;
  const matches = content.matchAll(mentionPattern);

  for (const match of matches) {
    const mentionedName = match[1].toLowerCase();
    const participant = participants.find(p =>
      p.name.toLowerCase().includes(mentionedName) ||
      mentionedName.includes(p.name.toLowerCase().split(" ")[0])
    );
    if (participant) {
      mentions.push(participant.id);
    }
  }

  return mentions;
}
