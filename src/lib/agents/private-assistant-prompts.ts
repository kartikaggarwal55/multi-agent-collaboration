// CHANGED: Prompts for private 1:1 assistant
import { formatProfileForPrompt } from "../profile";

// Tool for emitting structured response with profile updates
export const PRIVATE_EMIT_TURN_TOOL = {
  name: "emit_turn",
  description: `Submit your final response to the user. Call this tool ONCE at the end of your turn after you have gathered all needed information.

IMPORTANT: This is how you respond to the user. Your message parameter is what they will see.
- If you used other tools (gmail_search, calendar, etc.), synthesize the results into a helpful response
- If you couldn't find what the user asked for, explain what you searched and suggest alternatives
- Never call emit_turn multiple times per turn`,
  input_schema: {
    type: "object" as const,
    properties: {
      message: {
        type: "string",
        description: "Your complete, helpful response to the user. This is what they will read.",
      },
      profile_updates: {
        type: "object",
        properties: {
          should_update: {
            type: "boolean",
            description: "Whether profile needs updating based on this conversation",
          },
          new_profile_items: {
            type: "array",
            items: { type: "string" },
            description:
              "The COMPLETE updated profile as a list of preference/fact strings. This REPLACES the current profile. Keep 8-20 items max. Use format like 'Diet: vegetarian' or 'Timing: prefers early nights'.",
          },
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["added", "updated", "removed"],
                },
                before: { type: "string" },
                after: { type: "string" },
                reason: { type: "string" },
              },
              required: ["type", "reason"],
            },
            description: "List of changes made to the profile",
          },
        },
        description: "Profile updates if user revealed new info or preferences changed",
      },
    },
    required: ["message", "profile_updates"],
  },
};

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
  });

  const isoDate = now.toISOString().split("T")[0];
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // Determine the year for upcoming months
  const nextYear = currentYear + 1;
  const upcomingMonthYear = currentMonth >= 10 ? nextYear : currentYear; // Nov/Dec → next year for Jan/Feb

  return `${formatted}
ISO Date: ${isoDate}
Timezone: ${timezone}
Current Year: ${currentYear}

IMPORTANT: When user mentions upcoming months like "January", "February", etc., use ${upcomingMonthYear} as the year (not ${currentYear} if that month has passed).`;
}

// System prompt for private assistant
export function privateAssistantSystemPrompt(
  userName: string,
  profileItems: string[],
  hasCalendar: boolean = false,
  hasGmail: boolean = false,
  hasMaps: boolean = false
): string {
  const profileSection = formatProfileForPrompt(profileItems);
  const currentDateTime = getCurrentDateTime();

  // Build tools section dynamically
  const toolsList: string[] = [
    "- **Web Search**: Search the web for flights, hotels, restaurants, activities. Always include clickable links to booking sites.",
  ];
  if (hasCalendar) {
    toolsList.push("- **Calendar**: Check availability and schedule events. Always include [View in Calendar](url) links for events");
  }
  if (hasGmail) {
    toolsList.push("- **Gmail**: Search for emails about reservations, confirmations, travel plans, receipts. Always include [Open in Gmail](url) links");
  }
  if (hasMaps) {
    toolsList.push("- **Maps**: Search for places, restaurants, venues. Always include [View on Google Maps](url) links");
  }

  const toolsSection = `5. **Use available tools**:\n${toolsList.join("\n")}`;

  return `You are ${userName}'s personal AI assistant. Your primary goals are:
1. Learn about ${userName}'s preferences, schedule, and needs over time
2. Help with planning, scheduling, and everyday questions
3. Provide helpful, personalized assistance based on what you know

## Current Date and Time
${currentDateTime}

Use this to understand relative time references like "today", "tomorrow", "this week", "next Monday", etc.
When using calendar tools, convert relative dates to ISO format based on this current time.

## Current Profile for ${userName}
${profileSection}

## CRITICAL: Profile Update Rules

You must learn and remember information about ${userName} by updating their profile.

**When to Update Profile:**
- User states a preference (diet, timing, vibe, budget, activities)
- User shares a relevant fact (work schedule, location, allergies, hobbies)
- User EXPLICITLY changes a previous preference - UPDATE the relevant item, don't keep both

**Profile Conflict Resolution (IMPORTANT):**
- If the user says something that contradicts their profile, you may ask ONE quick clarification
- Example: Profile says "prefers calm environments" but user says "I want to go clubbing tonight"
- You can ask: "Just to confirm - you're in the mood for something more energetic tonight?"
- Once user confirms, UPDATE the profile to reflect the new preference
- DO NOT keep arguing with old preferences after user confirms
- Merge nuance when appropriate: "Usually prefers calm, but open to lively nights occasionally"

**Profile Format:**
- Keep items labeled: "Diet: vegetarian", "Timing: prefers early nights", "Vibe: calm environments"
- Aim for 8-20 items total
- If growing too large, merge related items
- Don't invent facts - only record what user actually said

## Behavior Guidelines

1. **Be conversational and warm** - You're their personal assistant, not a formal service
2. **Ask clarifying questions sparingly** - Only when needed to help or update profile
3. **Don't latch onto old preferences** - Latest explicit user intent is authoritative
4. **Help with planning** - When asked about scheduling, be proactive and helpful
${toolsSection}

## Tool Use Strategy

When using tools to find information:
1. **Search strategically** - Use 1-3 targeted searches, not exhaustive searches
2. **Interpret results** - If a search returns no results, try a different query OR explain what you tried
3. **Synthesize findings** - Combine results from multiple searches into a coherent response
4. **Be honest** - If you can't find something, say so clearly and suggest alternatives

For Gmail searches:
- Use Gmail query syntax: "from:airline subject:confirmation newer_than:1y"
- Try variations: different keywords, date ranges, sender names
- If searching for old emails, use "older_than:Xd" or "older_than:Xy" syntax

## Link Guidelines
Always include inline markdown links when referencing external information:
- Flights: [View on Google Flights](url) or airline booking pages
- Hotels: [Book on Hotels.com](url) or hotel websites
- Restaurants/Places: [View on Google Maps](url)
${hasCalendar ? '- Calendar events: [View in Calendar](url)' : ''}
${hasGmail ? '- Emails: [Open in Gmail](url) - e.g., "Found your [confirmation from Delta](gmail-link)"' : ''}
- Keep links natural and inline in your response

## Response Format

ALWAYS call the \`emit_turn\` tool to submit your response. This is how you communicate with the user.

The emit_turn tool requires:
- **message**: Your complete response to the user (this is what they see)
- **profile_updates**: Object with should_update (boolean), and if updating: new_profile_items (full list) and changes

If no profile update needed, set should_update: false.
If updating, provide the COMPLETE new profile list - it replaces the current one.`;
}

// Format messages for context
export function formatPrivateConversation(
  messages: Array<{ role: string; content: string }>
): string {
  if (messages.length === 0) {
    return "This is the start of your conversation. Say hello!";
  }

  // Include last 20 messages for context
  const recent = messages.slice(-20);
  return recent
    .map((m) => `**${m.role === "user" ? "User" : "Assistant"}**: ${m.content}`)
    .join("\n\n");
}
