// CHANGED: Google Calendar service for reading user events
import { google, calendar_v3 } from "googleapis";
import { prisma } from "./db";

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

export interface FreeBusyBlock {
  start: string;
  end: string;
}

export interface CalendarError {
  error: string;
  needsReconnect?: boolean;
}

// CHANGED: Type for OAuth2 client result
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
type OAuth2Result =
  | { error: string; needsReconnect: boolean }
  | { client: OAuth2Client };

/**
 * CHANGED: Get OAuth2 client with user's tokens
 */
async function getOAuth2Client(userId: string): Promise<OAuth2Result> {
  // Get user's Google account
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
  });

  if (!account) {
    return { error: "No Google account connected", needsReconnect: true };
  }

  if (!account.access_token) {
    return { error: "No access token available", needsReconnect: true };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token || undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // CHANGED: Handle token refresh
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: tokens.access_token,
          expires_at: tokens.expiry_date
            ? Math.floor(tokens.expiry_date / 1000)
            : null,
        },
      });
    }
  });

  return { client: oauth2Client };
}

/**
 * CHANGED: List calendar events within a time range
 */
export async function listCalendarEvents(
  userId: string,
  timeMin: string,
  timeMax: string,
  maxResults: number = 10
): Promise<CalendarEvent[] | CalendarError> {
  const result = await getOAuth2Client(userId);

  if ("error" in result) {
    return { error: result.error, needsReconnect: result.needsReconnect };
  }

  const calendar = google.calendar({ version: "v3", auth: result.client });

  try {
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items || [];

    return events.map((event: calendar_v3.Schema$Event) => ({
      id: event.id || "",
      summary: event.summary || "No title",
      start: event.start?.dateTime || event.start?.date || "",
      end: event.end?.dateTime || event.end?.date || "",
      location: event.location || undefined,
      description: event.description?.slice(0, 200) || undefined, // Truncate long descriptions
    }));
  } catch (error: unknown) {
    console.error("Error listing calendar events:", error);

    // Check if token needs refresh
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("invalid_grant") ||
      errorMessage.includes("Token has been expired")
    ) {
      return { error: "Calendar access expired", needsReconnect: true };
    }

    return { error: "Failed to fetch calendar events" };
  }
}

/**
 * CHANGED: Get free/busy information for a time range
 */
export async function getFreeBusy(
  userId: string,
  timeMin: string,
  timeMax: string
): Promise<FreeBusyBlock[] | CalendarError> {
  const result = await getOAuth2Client(userId);

  if ("error" in result) {
    return { error: result.error, needsReconnect: result.needsReconnect };
  }

  const calendar = google.calendar({ version: "v3", auth: result.client });

  try {
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: "primary" }],
      },
    });

    const busy = response.data.calendars?.primary?.busy || [];

    return busy.map((block) => ({
      start: block.start || "",
      end: block.end || "",
    }));
  } catch (error: unknown) {
    console.error("Error getting free/busy:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("invalid_grant") ||
      errorMessage.includes("Token has been expired")
    ) {
      return { error: "Calendar access expired", needsReconnect: true };
    }

    return { error: "Failed to fetch free/busy info" };
  }
}

/**
 * CHANGED: Format events for display in assistant response
 */
export function formatEventsForDisplay(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return "No events found in this time range.";
  }

  return events
    .map((event) => {
      const startDate = new Date(event.start);
      const endDate = new Date(event.end);

      const dateStr = startDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      const timeStr = startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

      const endTimeStr = endDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

      let line = `• ${dateStr} ${timeStr}-${endTimeStr}: ${event.summary}`;
      if (event.location) {
        line += ` (${event.location})`;
      }
      return line;
    })
    .join("\n");
}

/**
 * CHANGED: Format free/busy for finding open slots
 */
export function formatFreeBusyForDisplay(
  busyBlocks: FreeBusyBlock[],
  timeMin: string,
  timeMax: string
): string {
  if (busyBlocks.length === 0) {
    return `You're completely free during this time range!`;
  }

  const busyText = busyBlocks
    .map((block) => {
      const start = new Date(block.start);
      const end = new Date(block.end);
      return `• ${start.toLocaleString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })} - ${end.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })}`;
    })
    .join("\n");

  return `Busy times:\n${busyText}`;
}
