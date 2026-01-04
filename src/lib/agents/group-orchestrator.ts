// Group orchestrator - simple, reliable multi-agent collaboration
// Owner's assistant responds first, others respond if they have value to add

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getUserProfile, formatProfileForPrompt } from "@/lib/profile";
import { createCalendarToolsForUser, executeCalendarTool } from "./calendar-tools";
import { createGmailToolsForUser, executeGmailTool } from "./gmail-tools";
import { MAPS_TOOLS, executeMapseTool, isMapseTool, isMapsConfigured } from "./maps-tools";
import { DATE_TOOLS, executeDateTool, isDateTool } from "./date-tools";
import { Citation, StopReason, CanonicalState, StatePatch, OpenQuestion } from "../types";

const anthropic = new Anthropic();
const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || "claude-opus-4-5";
const RATE_LIMIT_RETRY_DELAY_MS = 2000;
const MAX_RATE_LIMIT_RETRIES = 2;

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
  hasGmail?: boolean;
  userId?: string;
}

// emit_turn tool - submit response to the group
function createEmitTurnTool(humanNames: string[], assistantNames: string[]) {
  return {
    name: "emit_turn",
    description: `Submit your response to the group. Call this tool ONCE at the end of your turn after gathering all needed information.

IMPORTANT: This is how you respond to the group. Your public_message is what everyone will see.
- If you used tools (calendar, gmail, web search), synthesize results into a helpful response
- If you couldn't find what was asked, explain what you searched and suggest alternatives
- Set skip_turn=true if you weren't addressed and have no relevant new information to share`,
    input_schema: {
      type: "object" as const,
      properties: {
        skip_turn: {
          type: "boolean",
          description: "Set true if: (1) you weren't @mentioned AND (2) no one asked you a question AND (3) you have no relevant info about your owner that would change the plan. If you have useful information to share, set false.",
        },
        public_message: {
          type: "string",
          description: "Your complete message to the group. This is what everyone will read.",
        },
        next_action: {
          type: "string",
          enum: ["CONTINUE", "WAIT_FOR_USER", "DONE"],
          description: `Choose based on who needs to respond next:
- CONTINUE: You @mentioned another ASSISTANT (to ask, inform, or coordinate). They should respond before stopping.
- WAIT_FOR_USER: No assistant was asked a question; waiting on human input to proceed.
- DONE: Planning complete, all decisions confirmed.

ASSISTANTS you can @mention: ${assistantNames.join(", ")}

PRIORITY RULE: If you @mentioned an assistant → CONTINUE (even if you also asked your owner something)
Otherwise, if waiting on human input → WAIT_FOR_USER`,
        },
        state_patch: {
          type: "object",
          properties: {
            leading_option: { type: "string" },
            status_summary: { type: "array", items: { type: "string" } },
            add_constraints: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  participantId: { type: "string" },
                  constraint: { type: "string" },
                },
              },
            },
            pending_decisions: {
              type: "array",
              description: "Track decisions that need explicit confirmation. Update this list as decisions are proposed, confirmed, or resolved.",
              items: {
                type: "object",
                properties: {
                  topic: { type: "string", description: "What the decision is about (e.g., 'Resort choice', 'Travel dates')" },
                  status: { type: "string", enum: ["proposed", "awaiting_confirmation", "confirmed"] },
                  options: { type: "array", items: { type: "string" }, description: "The proposed options" },
                  confirmedValue: { type: "string", description: "The confirmed choice (when status is confirmed)" },
                  confirmationsNeeded: { type: "array", items: { type: "string" }, description: "User names who need to confirm (for multi-user decisions)" },
                  confirmationsReceived: { type: "array", items: { type: "string" }, description: "User names who have confirmed so far" },
                },
                required: ["topic", "status"],
              },
            },
            suggested_next_steps: {
              type: "array",
              items: { type: "string" },
              description: "Concise pending actions (e.g., 'Decide on venue', 'Confirm dates'). Replace the entire list each time - remove items that are resolved, add new ones. Keep to 3-5 items max."
            },
            stage: { type: "string", enum: ["negotiating", "searching", "waiting_for_user", "converged"] },
          },
        },
      },
      required: ["skip_turn"],
    },
  };
}

// Default timezone - must match calendar.ts
const DEFAULT_TIMEZONE = "America/Los_Angeles";

// Get current date/time formatted for the prompt with context
function getCurrentDateTime(): string {
  const now = new Date();
  const formatted = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: DEFAULT_TIMEZONE,
  });

  // Get date parts in the correct timezone
  const year = parseInt(now.toLocaleString("en-US", { year: "numeric", timeZone: DEFAULT_TIMEZONE }));
  const month = parseInt(now.toLocaleString("en-US", { month: "numeric", timeZone: DEFAULT_TIMEZONE })) - 1;
  const day = now.toLocaleString("en-US", { day: "2-digit", timeZone: DEFAULT_TIMEZONE });
  const monthStr = now.toLocaleString("en-US", { month: "2-digit", timeZone: DEFAULT_TIMEZONE });
  const isoDate = `${year}-${monthStr}-${day}`;

  // Determine the year for upcoming months
  const nextYear = year + 1;
  const upcomingMonthYear = month >= 10 ? nextYear : year; // Nov/Dec → next year for Jan/Feb

  return `${formatted}
ISO Date: ${isoDate}
Timezone: ${DEFAULT_TIMEZONE}
Current Year: ${year}

IMPORTANT: When user mentions upcoming months like "January", "February", etc., use ${upcomingMonthYear} as the year (not ${year} if that month has passed).`;
}

function generateSystemPrompt(
  ownerName: string,
  assistantName: string,
  ownerProfile: string[],
  otherParticipants: { name: string; kind: string }[],
  canonicalState: CanonicalState,
  hasCalendar: boolean,
  hasGmail: boolean,
  hasMaps: boolean,
  isPrimaryResponder: boolean
): string {
  const profileSection = formatProfileForPrompt(ownerProfile);
  const currentDateTime = getCurrentDateTime();

  const tools = [
    "Web search - Find flights, hotels, restaurants, activities. Always include clickable links to booking sites, Google Flights, etc.",
    hasCalendar ? `Calendar - Check ${ownerName}'s availability and schedule events. Always include [View in Calendar](url) links for events` : null,
    hasGmail ? `Gmail - Search ${ownerName}'s emails for confirmations, reservations, receipts. Always include [Open in Gmail](url) links` : null,
    hasMaps ? "Maps - Search for places, restaurants, venues. Always include [View on Google Maps](url) links" : null,
  ].filter(Boolean).join("\n- ");

  const constraints = canonicalState.constraints
    ?.filter(c => c.source === "session_statement")
    .map(c => `- ${c.participantId}: ${c.constraint}`)
    .join("\n") || "None yet";

  const othersList = otherParticipants.map(p => `- ${p.name} (${p.kind})`).join("\n");

  const roleContext = isPrimaryResponder
    ? `Your owner ${ownerName} just sent a message. You should respond helpfully on their behalf.`
    : `Another participant just spoke. You are NOT the primary responder this turn.

RESPOND only if ANY of these are true:
1. You were explicitly @mentioned by name
2. Another assistant asked YOU specifically a question
3. You have relevant information about ${ownerName} (calendar conflicts, preferences, constraints) that would meaningfully change the plan

Otherwise, SKIP your turn and let the conversation flow naturally.`;

  // Get other assistants for collaboration
  const otherAssistants = otherParticipants.filter(p => p.kind === "assistant").map(p => p.name);
  const otherHumans = otherParticipants.filter(p => p.kind === "human").map(p => p.name);

  return `You are ${ownerName}'s personal assistant in a group planning session.

## Current Date/Time
${currentDateTime}

## Your Role
${roleContext}

## ${ownerName}'s Profile
${profileSection || "No profile stored yet."}

Note: Profile data helps you understand preferences, but does NOT authorize you to make decisions on ${ownerName}'s behalf. Always ask for explicit confirmation on choices.

## Available Tools
- ${tools}

Note: For date calculations (day of week, upcoming weekends), use the date tools rather than calculating yourself.

## Current Plan State
- Leading option: ${canonicalState.leadingOption || "None"}
- Stage: ${canonicalState.stage}
- Constraints:
${constraints}

## Other Participants
${othersList}

## Communication & Ownership Boundaries (CRITICAL)

You are ${assistantName}, assistant to ${ownerName}. This creates strict boundaries:

**You CAN directly address:**
- Your owner (${ownerName}) - ask questions, make recommendations, confirm their decisions
- Other assistants (${otherAssistants.join(", ") || "none"}) - coordinate, ask them to check with their users

**You should NEVER directly address:**
- Other human participants (${otherHumans.join(", ") || "none"})
- Don't ask questions to users who aren't your owner
- Don't make decisions or confirmations on behalf of other users

**Correct patterns:**
- WRONG: "@OtherUser - does this work for you?"
- RIGHT: "@OtherUser's Assistant - can you check with your user if this works?"

- WRONG: "Booked for everyone!" (when only your owner confirmed)
- RIGHT: "Booked for ${ownerName}! @OtherAssistant - has your user booked theirs?"

**Speaking authority:**
- You can ONLY confirm decisions, bookings, or actions for ${ownerName}
- You cannot say "confirmed for both" unless the other user's assistant confirmed their part
- If you need another user's input, ask their assistant to get it

**When another assistant asks about your owner's preference:**
- Do NOT assume or answer on their behalf
- ASK your owner first: "@${ownerName} - does X work for you?"
- Only confirm after your owner explicitly responds

## Tool Use Strategy
When using tools to find information:
1. **Search strategically** - Use 1-3 targeted searches, not exhaustive searches
2. **Interpret results** - If a search returns no results, try a different query OR explain what you tried
3. **Synthesize findings** - Combine results from multiple searches into a coherent response
4. **Be honest** - If you can't find something, say so clearly and suggest alternatives

For Gmail searches:
- Use Gmail query syntax: "from:airline subject:confirmation newer_than:1y"
- Try variations: different keywords, date ranges, sender names

## Be Proactive
When the conversation needs information (flights, hotels, places, availability):
1. USE your tools to search - don't just say "I'll look into it"
2. INCLUDE the results in your message with actionable links
3. Present OPTIONS with prices, times, and booking links
4. If another assistant asked you something, RESEARCH and RESPOND with findings

## Decision Discipline (CRITICAL)

**Never assume implicit confirmation.** Options must be explicitly confirmed before building on them.

Decision states:
- **Proposed**: Options mentioned, no confirmation requested yet
- **Awaiting confirmation**: User was asked to decide, waiting for response
- **Confirmed**: User explicitly stated their choice

**Key rules:**
1. If you ask multiple questions in one message, each is a SEPARATE decision - a user answering one does NOT confirm the others
2. Vague affirmations are NOT confirmation of specific options - if unclear what they're confirming, ask explicitly
3. Before discussing details that depend on a choice, verify the parent choice is confirmed
4. When a decision is still pending, surface it clearly before moving forward

**Shared decisions** (lodging, destination, group activities, dining - things that affect everyone):

These require coordination BEFORE presenting options to owners:

1. **GATHER** - When your owner mentions a preference (e.g., "cheap lodging"), note it but don't immediately search and present options
2. **COORDINATE** - Ask other assistants: "@OtherAssistant - my owner prefers budget options. What are your owner's preferences for lodging?"
3. **FIND OVERLAP** - Once you know everyone's preferences, search for options that satisfy all of them
4. **PROPOSE TOGETHER** - Present options that work for everyone, not just your owner
5. **CONFIRM FROM ALL** - Each owner must confirm separately before finalizing

Your owner saying "yes" to an option is their PREFERENCE, not a group decision. Don't announce "Confirmed!" until all affected parties agree.

Wrong patterns:
- ❌ Owner says "cheap lodging" → You search, find options, ask owner to pick → Owner picks → You announce "Confirmed! @OtherAssistant does this work?" (fait accompli)
- ❌ "ilisha chose Econo Lodge!" (presenting one person's choice as the decision)

Right patterns:
- ✅ Owner says "cheap lodging" → "@OtherAssistant - my owner prefers budget ~$60/night. What's your owner's preference?" → Coordinate → Present shared options
- ✅ "ilisha prefers budget options. @Kartik's Assistant - what's Kartik's lodging preference so we can find something that works for both?"

**Confirmation tracking:**
- Your owner's confirmation applies ONLY to them
- Only mark "confirmed for all" when each assistant has confirmed their user's agreement
- Use pending_decisions with confirmationsNeeded/confirmationsReceived to track

**Example - single user:**
- Asked: "Option A or Option B? And which date?"
- User replied: "Option A"
- Option is CONFIRMED, but date is STILL PENDING

**Example - multi-user:**
- Asked everyone: "Does the proposed plan work?"
- Your owner replied: "Yes"
- Your owner is CONFIRMED, but other users are STILL PENDING until their assistants confirm

Track decisions in state_patch.pending_decisions and update their status as the conversation progresses.

## When to Skip vs Respond (CRITICAL)
${isPrimaryResponder ? `As the PRIMARY responder (your owner just spoke), you should generally respond.` : `As a NON-PRIMARY responder, you should usually SKIP unless directly addressed or have relevant information about ${ownerName} that would meaningfully change the plan being discussed.`}

**SKIP your turn (skip_turn=true) when ALL of these are true:**
1. You were NOT @mentioned by name
2. The message wasn't a question directed at you
3. You have NO relevant information about ${ownerName} that would change the current plan

**ALSO SKIP (regardless of above) when:**
- Another assistant already covered exactly what you would say
- A human was just asked a question or for a decision - let them respond first

**RESPOND (skip_turn=false) when ANY of these are true:**
${isPrimaryResponder ? `- Your owner ${ownerName} just spoke and you can help represent their interests` : `- You were explicitly @mentioned (e.g., "@${otherParticipants.find(p => p.kind === "assistant")?.name || "Assistant"}")`}
- Another assistant asked YOU specifically a question
- You have information about ${ownerName} (calendar conflicts, preferences, constraints) that would meaningfully change the plan being discussed

When skipping:
- Do NOT provide a public_message
- Do NOT announce that you're skipping - just skip silently

## Response Format
- Be concise (2-4 sentences for main points)
- **Always include clickable links inline** in markdown format: [Link Text](url)
  - Flights: [View on Google Flights](url) or airline booking pages
  - Hotels: [Book on Hotels.com](url) or hotel websites
  - Restaurants/Places: [View on Google Maps](url) or [Reserve on OpenTable](url)
  - Emails: [Open in Gmail](url)
  - Calendar events: [View in Calendar](url)
- Use @mentions when addressing assistants or your owner
- Update state_patch with new constraints, leading options, etc.

## Next Steps (Important)
Keep suggested_next_steps as a short list (3-5 items) of concise pending decisions.
- Good: "Decide on venue", "Confirm dates", "Book flights"
- Bad: "Alice: Where are you thinking of hosting? at home or at a venue?"
Replace the entire list each time - remove resolved items, add new ones.

Call emit_turn with your response.`;
}

function formatConversation(messages: GroupMessageData[], assistantName: string): string {
  if (messages.length === 0) {
    return "This is the start of the conversation.";
  }

  const formatted = messages.slice(-20).map(m => `**${m.authorName}**: ${m.content}`).join("\n\n");
  return `Recent conversation:\n\n${formatted}\n\nNow respond as ${assistantName}.`;
}

/**
 * Main orchestration - simple loop through assistants
 */
export async function* orchestrateGroupRun(
  groupId: string,
  triggerMessageId: string,
  participants: GroupParticipant[],
  messages: GroupMessageData[],
  canonicalState: CanonicalState
): AsyncGenerator<GroupCollaborationEvent> {
  let currentState = { ...canonicalState };
  const humans = participants.filter(p => p.kind === "human");
  const assistants = participants.filter(p => p.kind === "assistant");

  if (assistants.length === 0) {
    yield { type: "error", error: "No assistants in group" };
    yield { type: "done", stopReason: "ERROR" };
    return;
  }

  // Find who triggered the message
  const lastUserMessage = [...messages].reverse().find(m => m.role === "user");
  const triggeringUserId = lastUserMessage?.authorId;

  // Order: owner's assistant first, then others
  const ownerAssistant = assistants.find(a => a.ownerHumanId === triggeringUserId);
  const orderedAssistants = ownerAssistant
    ? [ownerAssistant, ...assistants.filter(a => a.id !== ownerAssistant.id)]
    : assistants;

  // Debug logging for ordering
  console.log(`[Orchestrator] Trigger user: ${triggeringUserId}, Last message by: ${lastUserMessage?.authorName}`);
  console.log(`[Orchestrator] Owner assistant found: ${ownerAssistant?.displayName || "NONE"}`);
  console.log(`[Orchestrator] Assistant order: ${orderedAssistants.map(a => a.displayName).join(" -> ")}`);

  yield { type: "status", status: "Processing..." };

  let anyPosted = false;
  let round = 0;
  const MAX_ROUNDS = 3; // Allow multiple rounds of assistant collaboration

  while (round < MAX_ROUNDS) {
    round++;
    let continueCollaboration = false;

    for (let i = 0; i < orderedAssistants.length; i++) {
    const assistant = orderedAssistants[i];
    const isPrimary = i === 0 && !!ownerAssistant;
    const owner = humans.find(h => h.id === assistant.ownerHumanId);

    if (!owner) continue;

    const ownerProfile = owner.userId ? await getUserProfile(owner.userId) : [];

    const otherParticipants = participants
      .filter(p => p.id !== assistant.id && p.id !== owner.id)
      .map(p => ({ name: p.displayName, kind: p.kind }));

    try {
      const result = await callAssistant(
        owner.displayName,
        assistant.displayName,
        ownerProfile,
        otherParticipants,
        currentState,
        messages,
        assistant.hasCalendar || false,
        assistant.hasGmail || false,
        isMapsConfigured(),
        owner.userId || owner.id,
        isPrimary
      );

      if (result.skipped) {
        console.log(`[Orchestrator] ${assistant.displayName} skipped their turn`);
        continue;
      }

      // Create and save message
      if (result.content) {
        const messageData: GroupMessageData = {
          id: crypto.randomUUID(),
          groupId,
          authorId: assistant.id,
          authorName: assistant.displayName,
          role: "assistant",
          content: result.content,
          citations: result.citations.length > 0 ? result.citations : undefined,
          createdAt: new Date().toISOString(),
        };

        await prisma.groupMessage.create({
          data: {
            id: messageData.id,
            groupId,
            authorId: messageData.authorId,
            authorName: messageData.authorName,
            role: "assistant",
            content: messageData.content,
            citations: result.citations.length > 0 ? JSON.stringify(result.citations) : null,
          },
        });

        messages.push(messageData);
        yield { type: "message", message: messageData };
        anyPosted = true;
        console.log(`[Orchestrator] ${assistant.displayName} posted, next_action: ${result.nextAction}`);
      }

      // Apply state patch
      if (result.statePatch) {
        currentState = applyStatePatch(currentState, result.statePatch, assistant.id);
        await prisma.group.update({
          where: { id: groupId },
          data: { canonicalState: JSON.stringify(currentState), lastActiveAt: new Date() },
        });
        yield { type: "state_update", state: currentState };
      }

      // Check stop conditions
      if (result.nextAction === "DONE") {
        currentState.stage = "converged";
        await prisma.group.update({
          where: { id: groupId },
          data: { canonicalState: JSON.stringify(currentState), lastActiveAt: new Date() },
        });
        yield { type: "state_update", state: currentState };
        yield { type: "done", stopReason: "HANDOFF_DONE" };
        return;
      }

      // WAIT_FOR_USER: Stop immediately - a human was asked a question or confirmation
      if (result.nextAction === "WAIT_FOR_USER") {
        currentState.stage = "waiting_for_user";
        await prisma.group.update({
          where: { id: groupId },
          data: { canonicalState: JSON.stringify(currentState), lastActiveAt: new Date() },
        });
        yield { type: "state_update", state: currentState };
        yield { type: "done", stopReason: "WAIT_FOR_USER" };
        return;
      }

      // If assistant wants to continue (e.g., asked another assistant something), flag for another round
      if (result.nextAction === "CONTINUE") {
        continueCollaboration = true;
      }
    } catch (error) {
      console.error(`Error with ${assistant.displayName}:`, error);
      yield { type: "error", error: `${assistant.displayName} encountered an error` };
    }
    } // end for loop

    // If no assistant wants to continue collaboration, stop
    if (!continueCollaboration) {
      break;
    }
  } // end while loop

  // Save final state
  await prisma.group.update({
    where: { id: groupId },
    data: { canonicalState: JSON.stringify(currentState), lastActiveAt: new Date() },
  });

  currentState.stage = "waiting_for_user";
  yield { type: "state_update", state: currentState };
  yield { type: "done", stopReason: "WAIT_FOR_USER" };
}

interface AssistantResult {
  skipped: boolean;
  content: string;
  citations: Citation[];
  statePatch: Partial<StatePatch> | null;
  nextAction: string;
}

async function callAssistant(
  ownerName: string,
  assistantName: string,
  ownerProfile: string[],
  otherParticipants: { name: string; kind: string }[],
  canonicalState: CanonicalState,
  messages: GroupMessageData[],
  hasCalendar: boolean,
  hasGmail: boolean,
  hasMaps: boolean,
  ownerId: string,
  isPrimary: boolean
): Promise<AssistantResult> {
  const systemPrompt = generateSystemPrompt(
    ownerName,
    assistantName,
    ownerProfile,
    otherParticipants,
    canonicalState,
    hasCalendar,
    hasGmail,
    hasMaps,
    isPrimary
  );

  const userMessage = formatConversation(messages, assistantName);

  // Build tools
  const humanNames = otherParticipants.filter(p => p.kind === "human").map(p => p.name);
  humanNames.push(ownerName);

  const assistantNames = otherParticipants.filter(p => p.kind === "assistant").map(p => p.name);
  assistantNames.push(assistantName); // Include self

  const tools: Anthropic.Messages.Tool[] = [
    createEmitTurnTool(humanNames, assistantNames) as unknown as Anthropic.Messages.Tool,
    {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 5,
    } as unknown as Anthropic.Messages.Tool,
  ];

  const calendarToolNames: string[] = [];
  const gmailToolNames: string[] = [];

  if (hasCalendar) {
    const calendarTools = createCalendarToolsForUser(ownerName);
    tools.push(...calendarTools);
    calendarToolNames.push(...calendarTools.map(t => t.name));
  }

  if (hasGmail) {
    const gmailTools = createGmailToolsForUser(ownerName);
    tools.push(...gmailTools);
    gmailToolNames.push(...gmailTools.map(t => t.name));
  }

  if (hasMaps) {
    tools.push(...MAPS_TOOLS);
  }

  // Date utilities always available - for accurate day-of-week calculations
  tools.push(...DATE_TOOLS);

  let response = await callWithRetry(() =>
    anthropic.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 4096,
      temperature: 0.2, // Low temperature for consistency with some flexibility
      system: systemPrompt,
      tools,
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: userMessage }],
    })
  );

  // Collect all text from response (includes web search results with citations)
  let allText = "";
  const allCitations: Citation[] = [];
  interface EmitTurnInput {
    skip_turn?: boolean;
    public_message?: string;
    next_action?: string;
    state_patch?: Partial<StatePatch>;
  }
  let emitTurnResult: EmitTurnInput | null = null;

  // Process response, handling tool calls
  // Strategy: Allow up to 4 rounds of tool use, then force emit_turn on round 5
  const MAX_ROUNDS = 5;
  let currentRound = 0;
  while (currentRound < MAX_ROUNDS) {
    currentRound++;
    const isLastRound = currentRound === MAX_ROUNDS;

    // Capture text blocks (including web search results)
    for (const block of response.content) {
      if (block.type === "text") {
        allText += block.text + "\n";
        // Extract citations if present
        if ("citations" in block && Array.isArray(block.citations)) {
          for (const cite of block.citations as Array<{ url?: string; title?: string; cited_text?: string }>) {
            allCitations.push({
              url: cite.url || "",
              title: cite.title,
              citedText: cite.cited_text,
            });
          }
        }
      }
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) break;

    // Check if web_search was used - if so, results are already in the response
    // We can't continue the conversation with mixed server/client tool results
    const hasWebSearch = toolUseBlocks.some(t => t.name === "web_search");

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      if (toolUse.name === "emit_turn") {
        emitTurnResult = toolUse.input as EmitTurnInput;
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "Turn recorded.",
        });
      } else if (toolUse.name === "web_search") {
        // Web search is handled by Anthropic - results already in response
        // Skip sending tool_result
        continue;
      } else if (calendarToolNames.includes(toolUse.name)) {
        const result = await executeCalendarTool(ownerId, toolUse.name, toolUse.input as Record<string, unknown>);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      } else if (gmailToolNames.includes(toolUse.name)) {
        const result = await executeGmailTool(ownerId, toolUse.name, toolUse.input as Record<string, unknown>);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      } else if (isMapseTool(toolUse.name)) {
        const result = await executeMapseTool(toolUse.name, toolUse.input as Record<string, unknown>);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      } else if (isDateTool(toolUse.name)) {
        console.log(`[DateTool] Calling ${toolUse.name} with:`, toolUse.input);
        const result = executeDateTool(toolUse.name, toolUse.input as Record<string, unknown>);
        console.log(`[DateTool] Result:`, result.substring(0, 200));
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      } else {
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Unknown tool" });
      }
    }

    // If web_search was used, don't try to continue - results are in the response
    if (hasWebSearch) break;

    // Check if we have other tool results besides emit_turn that need processing
    const hasOtherToolResults = toolResults.some(r => {
      // Find the original tool use for this result
      const toolUse = toolUseBlocks.find(t => t.id === r.tool_use_id);
      return toolUse && toolUse.name !== "emit_turn";
    });

    // If emit_turn was called WITHOUT other tools, we're done
    if (emitTurnResult && !hasOtherToolResults) break;

    // If we have tool results to send (gmail, calendar, maps), continue the conversation
    // This lets the model incorporate the results into its emit_turn message
    if (toolResults.length > 0 && hasOtherToolResults) {
      // Clear emit_turn so model can call it again with the tool results
      emitTurnResult = null;

      // Filter out server-side tool blocks from previous response
      const clientContent = response.content.filter(
        block => block.type !== "server_tool_use" &&
                 !("type" in block && (block as { type: string }).type === "web_search_tool_result")
      );

      // On last round, force emit_turn to guarantee a response
      const nextRound = currentRound + 1;
      const nextIsLastRound = nextRound === MAX_ROUNDS;
      const toolChoice = nextIsLastRound
        ? { type: "tool" as const, name: "emit_turn" }
        : { type: "auto" as const };

      response = await callWithRetry(() =>
        anthropic.messages.create({
          model: ASSISTANT_MODEL,
          max_tokens: 4096,
          temperature: 0.2,
          system: systemPrompt,
          tools,
          tool_choice: toolChoice,
          messages: [
            { role: "user", content: userMessage },
            { role: "assistant", content: clientContent },
            { role: "user", content: toolResults },
          ],
        })
      );
    } else {
      break;
    }
  }

  // Determine final content
  let finalContent = emitTurnResult?.public_message || "";

  // If no explicit message but we have text (from searches), use that
  if (!finalContent && allText.trim()) {
    finalContent = allText.trim();
  }

  // Clean up cite tags
  finalContent = finalContent.replace(/<cite[^>]*>([^<]*)<\/cite>/g, "$1").trim();

  // If skip_turn is true, we skip regardless of any message content
  const skipped = emitTurnResult?.skip_turn === true;

  // Clear content if skipping - skip means silent
  if (skipped) {
    finalContent = "";
  }

  return {
    skipped,
    content: finalContent,
    citations: allCitations,
    statePatch: emitTurnResult?.state_patch || null,
    nextAction: emitTurnResult?.next_action || "WAIT_FOR_USER",
  };
}

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

  if (patch.pending_decisions) {
    newState.pendingDecisions = patch.pending_decisions;
  }

  if (patch.add_constraints) {
    const existing = new Set(
      (newState.constraints || []).map(c => `${c.participantId}:${c.constraint}`)
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
      }
    }
  }

  newState.lastUpdatedAt = new Date().toISOString();
  newState.lastUpdatedBy = updatedBy;

  return newState;
}
