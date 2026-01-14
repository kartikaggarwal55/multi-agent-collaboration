// CHANGED: Google Calendar service for reading user events
import { google, calendar_v3 } from "googleapis";
import { prisma } from "./db";

// Default timezone for formatting - prevents UTC issues on Vercel
const DEFAULT_TIMEZONE = "America/Los_Angeles";

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  htmlLink?: string;
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
  // Get user's Google accounts and prefer one with calendar scope
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      provider: "google",
    },
  });

  // Prefer account with calendar scope
  const account = accounts.find(a => a.scope?.includes("calendar")) || accounts[0];

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
      description: event.description?.slice(0, 200) || undefined,
      htmlLink: event.htmlLink || undefined,
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
 * Format events for display - includes explicit dates and calendar links
 */
export function formatEventsForDisplay(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return "No events found in this time range.";
  }

  return events
    .map((event) => {
      const startDate = new Date(event.start);
      const endDate = new Date(event.end);

      // Include full date with year and explicit day of week
      const dateStr = startDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: DEFAULT_TIMEZONE,
      });

      const timeStr = startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: DEFAULT_TIMEZONE,
      });

      const endTimeStr = endDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: DEFAULT_TIMEZONE,
      });

      let line = `• ${dateStr}, ${timeStr}-${endTimeStr}: ${event.summary}`;
      if (event.location) {
        line += ` (${event.location})`;
      }
      if (event.htmlLink) {
        line += ` [View in Calendar](${event.htmlLink})`;
      }
      return line;
    })
    .join("\n");
}

/**
 * Format free/busy for finding open slots - includes explicit dates
 */
export function formatFreeBusyForDisplay(
  busyBlocks: FreeBusyBlock[],
  timeMin: string,
  timeMax: string
): string {
  const startRange = new Date(timeMin);
  const endRange = new Date(timeMax);

  const rangeStr = `${startRange.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: DEFAULT_TIMEZONE,
  })} to ${endRange.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: DEFAULT_TIMEZONE,
  })}`;

  if (busyBlocks.length === 0) {
    return `You're completely free from ${rangeStr}!`;
  }

  const busyText = busyBlocks
    .map((block) => {
      const start = new Date(block.start);
      const end = new Date(block.end);
      return `• ${start.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: DEFAULT_TIMEZONE,
      })}, ${start.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: DEFAULT_TIMEZONE,
      })} - ${end.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: DEFAULT_TIMEZONE,
      })}`;
    })
    .join("\n");

  return `Busy times from ${rangeStr}:\n${busyText}`;
}

/**
 * Validate that Calendar access is actually working (not just that token exists)
 * Makes a lightweight API call to verify the token is valid
 */
export async function validateCalendarAccess(userId: string): Promise<boolean> {
  const result = await getOAuth2Client(userId);

  if ("error" in result) {
    return false;
  }

  const calendar = google.calendar({ version: "v3", auth: result.client });

  try {
    // Make a minimal API call - just list calendar list (very lightweight)
    await calendar.calendarList.list({ maxResults: 1 });
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log("Calendar validation failed:", errorMessage);
    return false;
  }
}
