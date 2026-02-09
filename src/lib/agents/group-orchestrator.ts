// Group orchestrator - simple, reliable multi-agent collaboration
// Owner's assistant responds first, others respond if they have value to add

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getUserProfile, formatProfileForPrompt } from "@/lib/profile";
import { stripCiteTags, callWithRetry, getCurrentDateTime } from "@/lib/api-utils";
import { createCalendarToolsForUser, executeCalendarTool } from "./calendar-tools";
import { createGmailToolsForUser, executeGmailTool } from "./gmail-tools";
import { MAPS_TOOLS, executeMapsTool, isMapsTool, isMapsConfigured } from "./maps-tools";
import { DATE_TOOLS, executeDateTool, isDateTool } from "./date-tools";
import { Citation, StopReason, CanonicalState, StatePatch, OpenQuestion, AssistantStatus, AssistantStatusType, MessageBlock } from "../types";
import { filterMessageForPrivacy } from "./privacy-filter";
import { detectCompletedSteps } from "./step-completion-detector";

const anthropic = new Anthropic();
const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || "claude-opus-4-5";

// Event types for streaming
export type GroupCollaborationEvent =
  | { type: "message"; message: GroupMessageData }
  | { type: "state_update"; state: CanonicalState }
  | { type: "error"; error: string }
  | { type: "status"; status: string }
  | { type: "assistant_status"; assistantStatus: AssistantStatus }
  | { type: "done"; stopReason: StopReason };

export interface GroupMessageData {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  role: "user" | "assistant";
  content: string;
  details?: MessageBlock[];
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

IMPORTANT: Your response has two parts:
1. public_message: A concise 1-3 sentence plain text summary (used for conversation context)
2. blocks: An ordered array of UI components that the user will see (text, options cards, timelines, etc.)

- If you used tools (calendar, gmail, web search), put the summary in public_message and structured results in blocks
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
          description: "Plain text summary of your response (1-3 sentences). Used for conversation context and notifications. Should capture the key point without any formatting.",
        },
        blocks: {
          type: "array",
          description: "Your response as a sequence of UI blocks. Order matters — lead with the most important info. Each block renders as a specific component. Default to text blocks (rendered as markdown) unless you have genuine structured data (search results, calendar data, comparisons) that benefits from a richer component.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["text", "options", "comparison", "timeline", "accordion"],
                description: "text: markdown (default, use for most content). options: list of choices (flights/hotels/places/emails). comparison: side-by-side table. timeline: chronological events (calendar/schedule). accordion: collapsible secondary info.",
              },
              content: { type: "string", description: "Markdown text (for text, accordion blocks)" },
              priority: { type: "string", enum: ["high", "normal"], description: "For text blocks: 'high' = lead summary with emphasis" },
              label: { type: "string", description: "Section heading for options/comparison/timeline/accordion" },
              columns: {
                type: "array",
                items: { type: "string" },
                description: "Field keys to display as columns (e.g., ['price','departs','duration'])",
              },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Primary label (airline+flight, hotel name, place name, day)" },
                    subtitle: { type: "string", description: "Secondary info (route, neighborhood, date range)" },
                    fields: {
                      type: "object",
                      additionalProperties: { type: "string" },
                      description: "Dynamic key-value data. Keys should match columns array.",
                    },
                    link: { type: "string", description: "Action URL (booking page, Gmail link, Maps link)" },
                    tag: { type: "string", description: "Badge text: 'Best price', 'Recommended', 'Open now', 'Conflict'" },
                  },
                  required: ["title", "fields"],
                },
              },
              recommended: { type: "integer", description: "0-based index of recommended item" },
              layout: { type: "string", enum: ["cards", "list"] },
              defaultOpen: { type: "boolean", description: "For accordion: start expanded (default false)" },
            },
            required: ["type"],
          },
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
            leading_option: { type: "string", description: "Rolling snapshot of what the group has aligned on or is leaning toward. Only include decisions made or strong leanings — not what's currently being discussed (that's in next steps). Include partial alignments. Carry forward earlier alignments when adding new ones." },
            status_summary: { type: "array", items: { type: "string" } },
            add_constraints: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  participantId: { type: "string", description: "Who this constraint relates to, if applicable" },
                  constraint: { type: "string", description: "The constraint, written naturally" },
                },
              },
              description: "New constraints or requirements surfaced this turn",
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
    hasCalendar ? `Calendar - Check ${ownerName}'s availability. Two tools available:
  • calendar_free_busy (DEFAULT) - Returns only busy/free time blocks. Use this for schedule coordination in group chat — it protects ${ownerName}'s privacy by not exposing event titles or details.
  • calendar_list_events - Returns full event details including titles. Only use this when ${ownerName} explicitly asks you to share specific event details with the group, or when the conversation is specifically about the content of an event (not just scheduling around it).
  In group context, ALWAYS prefer calendar_free_busy unless you have a specific reason to need event titles.` : null,
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

When you respond, **add value** — don't just relay a question to your owner. If options were presented, check them against ${ownerName}'s stored preferences and flag conflicts or fits. If calendar data is relevant, check it. Only ask your owner when you genuinely can't answer from their profile.

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
- Current plan (what's aligned so far): ${canonicalState.leadingOption || "Nothing yet — set this as soon as any direction emerges"}
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

## Privacy in Group Context
When sharing ${ownerName}'s private data, apply minimum necessary disclosure - share what serves the goal.

Consider:
- **Who's in the conversation** - what level of detail is appropriate for this audience?
- **What's the goal** - "${canonicalState.goal || "Not yet defined"}" - does the detail serve this goal?
- **Abstraction test** - would a summary work as well as the full detail?

**Calendar events (STRICT):** Do not reveal event titles, descriptions, or attendee names in group chat — the group only needs to know WHEN someone is busy, not WHY. Say "Busy" or "has a conflict" instead of "Doctor's Appointment", "Therapy", "Interview at X", etc. This applies to your own output AND when presenting calendar data in timeline/text blocks. **Exception:** If the event itself is the topic of conversation or directly relevant to the group's goal (e.g., a shared meeting everyone is part of, or a trip booking being discussed), details are appropriate.

Examples of contextual judgment:
- Calendar: Only share time blocks ("busy 2-4pm"). Never share event names or descriptions.
- Email: Share relevant confirmations/dates. Quote only when the exact wording matters.
- Personal data: Share what's relevant to the decision at hand.

## Lead With Options, Not Questions (CRITICAL)

**Never ask for preferences in a vacuum.** Every message to the group should bring new information — search results, calendar data, concrete options. Don't ask "what's your budget?" or "cabin or hotel?" without also presenting something to react to.

**The core principle:** People make better decisions when they're reacting to concrete options, not answering abstract questions. Use what you already know (your owner's profile, stored preferences, the conversation so far) to search, then present options and let people respond.

**Good flow for shared decisions:**
1. **SEARCH FIRST** - Use your owner's known preferences + any constraints from the conversation to search for options right away
2. **PRESENT OPTIONS** - Show concrete results (with prices, links, details) that work for your owner's preferences
3. **INVITE INPUT** - Ask the group to react: "Here are some options based on what we know so far — what stands out?" and @mention other assistants so they can flag conflicts with their owner's preferences
4. **REFINE** - If other participants have different constraints, narrow or re-search based on the overlap

**Good patterns:**
- ✅ Owner says "let's find lodging" → Search using known preferences → Present 3-4 options with prices → "@OtherAssistant — do any of these work for your owner? Flag any constraints"
- ✅ Other assistant flags "my owner's budget is under $150/night" → Filter or re-search → Present updated options that fit both

**Bad patterns:**
- ❌ "Before I search, what are everyone's preferences for lodging?" (empty question — no value to the group)
- ❌ Asking abstract preference questions when you could just search and present (you already have profile data)
- ❌ Multi-round preference gathering before showing a single option

**When you genuinely don't have enough to search on:** Pair the question with whatever partial information you do have. Share your owner's known preferences, surface any stored constraints, then ask the specific missing piece.

## Decision Discipline (CRITICAL)

**Never assume implicit confirmation.** Options must be explicitly confirmed before building on them.

Decision states:
- **Proposed**: Options presented, no confirmation requested yet
- **Awaiting confirmation**: User was asked to decide, waiting for response
- **Confirmed**: User explicitly stated their choice

**Key rules:**
1. If you ask multiple questions in one message, each is a SEPARATE decision - a user answering one does NOT confirm the others
2. Vague affirmations are NOT confirmation of specific options - if unclear what they're confirming, ask explicitly
3. Before discussing details that depend on a choice, verify the parent choice is confirmed
4. When a decision is still pending, surface it clearly before moving forward

**Shared decisions — confirmation requires everyone:**
- Your owner saying "yes" to an option is their PREFERENCE, not a group decision
- Don't announce "Confirmed!" until all affected parties agree
- Each owner must confirm separately before finalizing
- Don't present one person's choice as the group decision

**Confirmation tracking:**
- Your owner's confirmation applies ONLY to them
- Only mark "confirmed for all" when each assistant has confirmed their user's agreement
- Use pending_decisions with confirmationsNeeded/confirmationsReceived to track

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

## Response Format — Block-Based Messages (CRITICAL)

Your response is a sequence of **blocks**. Each block renders as a specific UI component. Order them by importance — lead with the key info.

**Default to text blocks** (rendered as markdown). Only use rich blocks (options, comparison, timeline) when you have genuine structured data from tool results. Don't force data into components when a simple sentence works better.

### Block composition pattern:
1. **Lead with a text block** (priority: "high") — the key decision point or finding in 1-2 sentences
2. **Follow with data blocks** if you have structured results — options/comparison/timeline
3. **End with a text block** — question for the user, next step, or @mention

### When to use each block type:
- \`text\` — Default. Summary sentences, questions, @mentions, explanations. Keep each text block short (1-3 sentences). Use markdown formatting (bold, links, bullets) within text blocks.
- \`options\` — Search results with 2+ items: flights, hotels, restaurants, emails. Each item must have a title and structured fields. Include links.
- \`comparison\` — Comparing 2-4 specific options side by side across multiple dimensions. Only when explicitly comparing.
- \`timeline\` — Calendar availability, schedules, itineraries. Each item has a time/day and status.
- \`accordion\` — Collapsible secondary/supplementary info: full email body, booking policies, cancellation terms, raw reviews, detailed amenity breakdowns, methodology notes, fine print, etc. Don't restate data already shown in an options/comparison block. When in doubt about whether info is primary or secondary, put it in an accordion. The user can expand it if they want it.
### Examples (adapt block count and types to the situation):
- Search results → text(high) lead + options or comparison for structured data
- Calendar check → text(high) summary + timeline for availability
- Coordination → text(high) with @mentions
- Supplementary detail → accordion (only for info not already in other blocks)

### Rules:
- NEVER dump raw tool output into a text block. Use options/comparison/timeline for structured data.
- Every response MUST have at least one text block with priority "high".
- Keep text blocks short — 1-3 sentences each.
- Include links in detail items' link field, not inline in text.
- Use @mentions when addressing assistants or your owner.
- The public_message field should be a 1-2 sentence plain text summary.
- Do NOT produce summaries or recaps of the conversation/trip/plan as text blocks. If a summary is genuinely useful, put it in an accordion. The user can see the conversation history — don't repeat it.
- Prefer accordions over text blocks for anything beyond the core decision point. Details, amenities, terms, full content — all accordion.

## Current Plan / Leading Option (CRITICAL)

The \`leading_option\` field in state_patch is the most important piece of state — it's the first thing a user sees in the side panel. Treat it as a **rolling snapshot** of everything decided or leaning toward so far.

**How to write it:**
- Start with a **one-line goal** summarizing what the group is planning (e.g. "Ski trip to Lake Tahoe", "Dinner for 6 downtown")
- Then use **bullet points** — one bullet per decided/leaning dimension (e.g. dates, destination, budget, lodging)
- Only include things **decided or leaning toward agreement** — not what's being discussed (that belongs in next steps)
- Include both confirmed decisions and strong leanings (note which is which)
- When something new gets decided, **add a bullet** — don't drop earlier ones. Update existing bullets when details change
- Keep each bullet short and scannable (a few words, not a sentence)

**When to update:**
- When a decision is made or a clear leaning emerges — not just because discussion happened
- Even when only one aspect moves forward — carry the rest of the aligned items forward unchanged

**Common mistake:** Writing only about the latest topic discussed and dropping earlier alignments. If the group agreed on a date three messages ago and is now discussing venue, the leading option must still include the date.

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

  const formatted = messages.slice(-20).map(m => {
    const roleTag = m.role === "user" ? "[human]" : "[assistant]";
    return `${roleTag} **${m.authorName}**: ${m.content}`;
  }).join("\n\n");
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

  // Helper to create status
  const createStatus = (
    type: AssistantStatusType,
    assistantId: string,
    assistantName: string,
    detail?: string
  ): AssistantStatus => ({
    type,
    assistantId,
    assistantName,
    detail,
    timestamp: Date.now(),
  });

  let anyPosted = false;
  let round = 0;
  const MAX_ROUNDS = 3; // Allow multiple rounds of assistant collaboration

  while (round < MAX_ROUNDS) {
    round++;
    let continueCollaboration = false;
    let roundPostedCount = 0;

    for (let i = 0; i < orderedAssistants.length; i++) {
    const assistant = orderedAssistants[i];
    const isPrimary = round === 1 && i === 0 && !!ownerAssistant;
    const owner = humans.find(h => h.id === assistant.ownerHumanId);

    if (!owner) continue;

    // No-new-context guard: skip if no new messages since this assistant's last post
    if (round > 1) {
      const lastPostIdx = messages.findLastIndex(m => m.authorId === assistant.id);
      if (lastPostIdx >= 0 && lastPostIdx >= messages.length - 1) {
        console.log(`[Orchestrator] ${assistant.displayName}: skipping round ${round}, no new messages since last post`);
        continue;
      }
    }

    // Emit thinking status for this assistant
    yield {
      type: "assistant_status",
      assistantStatus: createStatus("thinking", assistant.id, assistant.displayName),
    };

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
      // Derive content from blocks if public_message was empty
      const messageContent = result.content || (result.blocks
        ?.filter((b): b is { type: "text"; content: string } => b.type === "text" && !!b.content)
        .map(b => b.content)
        .join(" ") || "");

      if (messageContent || (result.blocks && result.blocks.length > 0)) {
        // Emit status: applying privacy filter
        yield {
          type: "assistant_status",
          assistantStatus: createStatus("writing_response", assistant.id, assistant.displayName, "Reviewing for privacy..."),
        };

        // Apply privacy filter before sending message
        const allParticipantNames = participants.map(p => p.displayName);
        const filterResult = await filterMessageForPrivacy(
          messageContent,
          currentState,
          owner.displayName,
          allParticipantNames
        );

        if (filterResult.wasModified) {
          console.log(`[PrivacyFilter] Modified message from ${assistant.displayName}`);
        }

        const messageData: GroupMessageData = {
          id: crypto.randomUUID(),
          groupId,
          authorId: assistant.id,
          authorName: assistant.displayName,
          role: "assistant",
          content: filterResult.filteredMessage,
          details: result.blocks || undefined,
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
            details: result.blocks ? JSON.stringify(result.blocks) : null,
          },
        });

        // Push only content (no blocks) for conversation context — keeps it lean
        messages.push({ ...messageData, details: undefined });
        yield { type: "message", message: messageData };
        anyPosted = true;
        roundPostedCount++;
        console.log(`[Orchestrator] ${assistant.displayName} posted, next_action: ${result.nextAction}`);
      }

      // Apply state patch
      if (result.statePatch) {
        // Capture previous steps before applying patch
        const previousSteps = [...(currentState.suggestedNextSteps || [])];

        currentState = applyStatePatch(currentState, result.statePatch, assistant.id);

        // Detect completed steps if next steps changed
        if (result.statePatch.suggested_next_steps && result.content) {
          const { completedSteps } = await detectCompletedSteps(
            previousSteps,
            currentState.suggestedNextSteps || [],
            result.content
          );

          if (completedSteps.length > 0) {
            currentState.completedNextSteps = [
              ...(currentState.completedNextSteps || []),
              ...completedSteps,
            ];
          }
        }

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
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Error with ${assistant.displayName}:`, error);
      yield { type: "error", error: `${assistant.displayName} encountered an error: ${errorMsg}` };
    }
    } // end for loop

    // No-op round breaker: if no messages were posted this round, stop
    if (roundPostedCount === 0) {
      break;
    }

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
  blocks: MessageBlock[] | null;
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
      max_tokens: 3072,
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
    blocks?: MessageBlock[];
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
      } else if (isMapsTool(toolUse.name)) {
        const result = await executeMapsTool(toolUse.name, toolUse.input as Record<string, unknown>);
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
          max_tokens: 3072,
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

  // Build final content from text blocks (the full message), with public_message as fallback.
  // Text blocks contain the complete message including @mentions and questions — using them
  // as conversation context ensures other assistants can see @mentions and respond accordingly.
  let finalContent = "";
  if (emitTurnResult?.blocks?.length) {
    const textBlocks = emitTurnResult.blocks.filter(
      (b): b is { type: "text"; content: string } => b.type === "text" && !!b.content
    );
    if (textBlocks.length > 0) {
      finalContent = textBlocks.map(b => b.content).join(" ");
    }
  }
  if (!finalContent) {
    finalContent = emitTurnResult?.public_message || "";
  }

  // If still no content but we have text (from searches), use that
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
    content: stripCiteTags(finalContent),
    blocks: emitTurnResult?.blocks?.map(b => {
      const cleaned = { ...b };
      for (const key of Object.keys(cleaned) as (keyof typeof cleaned)[]) {
        if (typeof cleaned[key] === "string") {
          (cleaned as Record<string, unknown>)[key] = stripCiteTags(cleaned[key] as string);
        }
      }
      return cleaned;
    }) || null,
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
