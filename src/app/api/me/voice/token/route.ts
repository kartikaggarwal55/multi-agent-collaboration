/**
 * API route to create ephemeral OpenAI Realtime session tokens.
 * Server-side only - the real API key never reaches the client.
 * Pre-fetches today's calendar events for the greeting and configures
 * calendar/email tools for follow-up queries.
 */

import { auth } from "@/lib/auth";
import { getUserProfile } from "@/lib/profile";
import { getCurrentDateTime } from "@/lib/api-utils";
import { userHasCalendarAccess } from "@/lib/agents/calendar-tools";
import { userHasGmailAccess } from "@/lib/agents/gmail-tools";
import { listCalendarEvents, formatEventsForDisplay } from "@/lib/calendar";
import { validateCalendarAccess } from "@/lib/calendar";
import { searchGmailMessages, formatGmailSearchForDisplay } from "@/lib/gmail";
import { validateGmailAccess } from "@/lib/gmail";

const OPENAI_REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";
const OPENAI_VOICE = "alloy";

// OpenAI Realtime tool definitions (subset most useful for voice)
function getVoiceTools(hasCalendar: boolean, hasGmail: boolean) {
  const tools: Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> = [];

  if (hasCalendar) {
    tools.push(
      {
        type: "function",
        name: "calendar_list_events",
        description:
          "List calendar events within a time range. Use ISO 8601 format for dates (e.g. 2025-01-15T00:00:00Z).",
        parameters: {
          type: "object",
          properties: {
            timeMin: {
              type: "string",
              description: "Start of time range in ISO 8601 format",
            },
            timeMax: {
              type: "string",
              description: "End of time range in ISO 8601 format",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of events to return (default 10, max 50)",
            },
          },
          required: ["timeMin", "timeMax"],
        },
      },
      {
        type: "function",
        name: "calendar_free_busy",
        description:
          "Check busy/free times within a time range. Useful for finding available time slots.",
        parameters: {
          type: "object",
          properties: {
            timeMin: {
              type: "string",
              description: "Start of time range in ISO 8601 format",
            },
            timeMax: {
              type: "string",
              description: "End of time range in ISO 8601 format",
            },
          },
          required: ["timeMin", "timeMax"],
        },
      }
    );
  }

  if (hasGmail) {
    tools.push(
      {
        type: "function",
        name: "gmail_search",
        description:
          "Search Gmail inbox. Supports Gmail query syntax: from:sender, subject:word, newer_than:Xd, has:attachment. Example: \"from:amazon subject:order newer_than:30d\"",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Gmail search query",
            },
            maxResults: {
              type: "number",
              description: "Maximum emails to return (default 10, max 20)",
            },
          },
          required: ["query"],
        },
      },
      {
        type: "function",
        name: "gmail_get_thread",
        description:
          "Get a full email thread with all messages. Use after searching to read the complete conversation.",
        parameters: {
          type: "object",
          properties: {
            threadId: {
              type: "string",
              description: "The thread ID from a search result",
            },
          },
          required: ["threadId"],
        },
      },
      {
        type: "function",
        name: "gmail_get_message",
        description:
          "Get a single email with full body content.",
        parameters: {
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "The message ID from a search result",
            },
          },
          required: ["messageId"],
        },
      }
    );
  }

  // Maps tools (always available - uses Google Maps API)
  tools.push(
    {
      type: "function",
      name: "maps_search_places",
      description:
        "Search for places, restaurants, venues, or businesses. Include location in the query for best results. Example: \"vegetarian restaurants near Park Slope Brooklyn\"",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query including place type and location",
          },
          maxResults: {
            type: "number",
            description: "Maximum results (default 5, max 10)",
          },
        },
        required: ["query"],
      },
    },
    {
      type: "function",
      name: "maps_get_place_details",
      description:
        "Get detailed info about a specific place: hours, phone, website, reviews. Use after searching.",
      parameters: {
        type: "object",
        properties: {
          placeId: {
            type: "string",
            description: "The place ID from a search result",
          },
        },
        required: ["placeId"],
      },
    },
    {
      type: "function",
      name: "maps_directions",
      description:
        "Get directions and travel time between two locations.",
      parameters: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description: "Starting location (address or place name)",
          },
          destination: {
            type: "string",
            description: "Ending location (address or place name)",
          },
          mode: {
            type: "string",
            description: "Travel mode: driving, walking, transit, or bicycling (default: driving)",
          },
        },
        required: ["origin", "destination"],
      },
    }
  );

  // Date utility tools (always available - pure computation)
  tools.push(
    {
      type: "function",
      name: "date_get_day_of_week",
      description:
        "Get the day of the week for a specific date. Use this instead of guessing.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
        },
        required: ["date"],
      },
    },
    {
      type: "function",
      name: "date_get_upcoming_weekends",
      description:
        "Get the next N weekends with Friday/Saturday/Sunday dates. Useful for planning.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD (defaults to today)",
          },
          count: {
            type: "number",
            description: "Number of weekends to return (default 4, max 12)",
          },
        },
        required: [],
      },
    },
    {
      type: "function",
      name: "date_days_between",
      description:
        "Calculate days between two dates and list each with its day of week.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD",
          },
          endDate: {
            type: "string",
            description: "End date in YYYY-MM-DD",
          },
        },
        required: ["startDate", "endDate"],
      },
    }
  );

  // Web search (always available - routes through Anthropic's web search)
  tools.push({
    type: "function",
    name: "web_search",
    description:
      "Search the web for current information: news, flights, hotels, restaurants, prices, weather, sports scores, or any factual question. Use this when you don't know something or need up-to-date information.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  });

  return tools;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const userId = session.user.id;
    const userName = session.user.name || "there";

    // Fetch user data in parallel
    const [profileItems, hasCalendarScope, hasGmailScope] = await Promise.all([
      getUserProfile(userId),
      userHasCalendarAccess(userId),
      userHasGmailAccess(userId),
    ]);

    // Validate actual API access (tokens may be expired)
    const [hasCalendar, hasGmail] = await Promise.all([
      hasCalendarScope ? validateCalendarAccess(userId) : Promise.resolve(false),
      hasGmailScope ? validateGmailAccess(userId) : Promise.resolve(false),
    ]);

    // Pre-fetch today's calendar events and recent emails for the greeting
    let todaySchedule = "";
    let recentEmails = "";

    const prefetchPromises: Promise<void>[] = [];

    if (hasCalendar) {
      prefetchPromises.push(
        (async () => {
          try {
            const now = new Date();
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);

            const events = await listCalendarEvents(
              userId,
              startOfDay.toISOString(),
              endOfDay.toISOString(),
              20
            );

            if (!("error" in events) && events.length > 0) {
              todaySchedule = formatEventsForDisplay(events);
            }
          } catch (err) {
            console.error("Failed to pre-fetch calendar:", err);
          }
        })()
      );
    }

    if (hasGmail) {
      prefetchPromises.push(
        (async () => {
          try {
            const result = await searchGmailMessages(
              userId,
              "newer_than:1d",
              10
            );

            if (!("error" in result) && result.messages.length > 0) {
              recentEmails = formatGmailSearchForDisplay(result);
            }
          } catch (err) {
            console.error("Failed to pre-fetch emails:", err);
          }
        })()
      );
    }

    await Promise.all(prefetchPromises);

    // Build tools and system instruction
    const tools = getVoiceTools(hasCalendar, hasGmail);
    const systemInstruction = buildVoiceSystemInstruction(
      userName,
      profileItems,
      todaySchedule,
      recentEmails,
      hasCalendar,
      hasGmail
    );

    // Create ephemeral OpenAI Realtime session
    const openaiResponse = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_REALTIME_MODEL,
        voice: OPENAI_VOICE,
        modalities: ["audio", "text"],
        instructions: systemInstruction,
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: { type: "server_vad" },
        tools,
        tool_choice: "auto",
        speed: 1.15,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI session creation failed:", openaiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to create voice session" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const sessionData = await openaiResponse.json();

    return new Response(
      JSON.stringify({
        token: sessionData.client_secret.value,
        model: OPENAI_REALTIME_MODEL,
        userName,
        hasCalendar,
        hasGmail,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Voice token error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate voice session config" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

function buildVoiceSystemInstruction(
  userName: string,
  profile: string[],
  todaySchedule: string,
  recentEmails: string,
  hasCalendar: boolean,
  hasGmail: boolean
): string {
  const profileSection = profile.length > 0
    ? profile.map(p => `- ${p}`).join('\n')
    : "No preferences recorded yet.";

  const dateTime = getCurrentDateTime();

  const scheduleSection = todaySchedule
    ? `## Today's Schedule\n${todaySchedule}`
    : hasCalendar
      ? "## Today's Schedule\nNo events on the calendar today."
      : "";

  const emailsSection = recentEmails
    ? `## Recent Emails (last 24 hours)\n${recentEmails}`
    : "";

  const toolsSection = [];
  if (hasCalendar) toolsSection.push("- **Calendar**: Check schedule, find free time, look up upcoming events");
  if (hasGmail) toolsSection.push("- **Gmail**: Search emails for confirmations, receipts, travel plans, etc.");
  toolsSection.push("- **Maps**: Search for restaurants, venues, businesses; get directions and travel times");
  toolsSection.push("- **Date utilities**: Look up what day a date falls on, find upcoming weekends, count days between dates");
  toolsSection.push("- **Web search**: Search the web for current info — news, flights, hotels, weather, prices, sports, or any factual question");

  const toolsText = `## Available Tools\nYou can use these tools when ${userName} asks about their schedule, emails, places, or related topics:\n${toolsSection.join('\n')}\n\nUse tools proactively when relevant - e.g. if asked "what's my week look like?", use the calendar tool. If asked about a restaurant, use the maps tool. If asked about current events, news, or anything you're unsure about, use web search. Never guess dates or days of the week - use the date tools.`;

  return `You are ${userName}'s friendly personal voice assistant. You have a warm, conversational tone - like a helpful friend who genuinely cares about making their day better.

## Current Date & Time
${dateTime}

## IMPORTANT: Start the conversation immediately
When the session begins, greet ${userName} warmly and give a brief, natural summary of how their day looks based on their schedule and recent emails below. Keep it conversational - don't read out every event or email, just highlight what matters (upcoming meetings, important emails that need attention). If there's nothing notable, just say hi and ask how you can help.

## Your Personality
- Warm, natural, and efficient
- Speak conversationally, not robotically
- Keep responses concise (2-3 sentences max for voice clarity)
- Ask clarifying questions when needed
- Show genuine interest in helping

## What You Know About ${userName}
${profileSection}

${scheduleSection}

${emailsSection}

${toolsText}

## Conversation Guidelines

### Starting the conversation:
- Greet ${userName} and give a quick sense of how their day looks
- Keep it brief and natural - "Hey ${userName}, looks like you've got a pretty packed afternoon" not a full schedule readout
- Ask if they want details or have questions

### When ${userName} is speaking:
- Listen actively and respond naturally
- Acknowledge what they said before moving on
- If they share something about themselves (preferences, constraints, information), note it naturally

### Response Style:
- Lead with the key information
- Be specific with times, names, and details
- Use natural transitions ("By the way...", "Also...", "One more thing...")
- If something is urgent, convey appropriate urgency in your tone

### Learning Mode:
- When ${userName} shares new preferences or information, acknowledge it: "Got it, I'll remember that."
- If they correct something, accept gracefully: "Thanks for the update, I'll keep that in mind."
- Connect new information to upcoming events when relevant

### Using Tools:
- When you need to check the calendar or search emails, briefly say something like "Let me check..." or "One sec..." before calling the tool so ${userName} knows you're working on it
- After getting tool results, summarize conversationally - don't read raw data

### Things to Avoid:
- Don't repeat yourself unless asked
- Don't over-explain - trust that ${userName} will ask if they need more
- Don't start every response with "Sure!" or similar filler
- Don't list everything at once - drip information naturally
- Don't read URLs or links aloud - just describe the content

Remember: You're having a conversation, not reading a report. Be the assistant ${userName} would actually want to talk to.`;
}
