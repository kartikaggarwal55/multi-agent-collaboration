// Calendar tools for both private and group orchestrators - user-scoped calendar access
import Anthropic from "@anthropic-ai/sdk";
import {
  listCalendarEvents,
  getFreeBusy,
  formatEventsForDisplay,
  formatFreeBusyForDisplay,
} from "../calendar";

// Calendar tool names
const CALENDAR_TOOL_NAMES = ["calendar_list_events", "calendar_free_busy"];

/**
 * Check if a tool name is a calendar tool
 */
export function isCalendarTool(toolName: string): boolean {
  return CALENDAR_TOOL_NAMES.includes(toolName);
}

/**
 * Static calendar tools (for private assistant)
 */
export const CALENDAR_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "calendar_list_events",
    description: `List your calendar events within a time range. Use ISO 8601 format for dates.`,
    input_schema: {
      type: "object" as const,
      properties: {
        timeMin: {
          type: "string",
          description:
            "Start of time range in ISO 8601 format (e.g., 2024-01-15T00:00:00Z)",
        },
        timeMax: {
          type: "string",
          description:
            "End of time range in ISO 8601 format (e.g., 2024-01-22T23:59:59Z)",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of events to return (default 10, max 50)",
        },
      },
      required: ["timeMin", "timeMax"],
    },
  } as unknown as Anthropic.Messages.Tool,
  {
    name: "calendar_free_busy",
    description: `Check your busy/free times within a time range. Useful for finding available slots.`,
    input_schema: {
      type: "object" as const,
      properties: {
        timeMin: {
          type: "string",
          description:
            "Start of time range in ISO 8601 format (e.g., 2024-01-15T00:00:00Z)",
        },
        timeMax: {
          type: "string",
          description:
            "End of time range in ISO 8601 format (e.g., 2024-01-22T23:59:59Z)",
        },
      },
      required: ["timeMin", "timeMax"],
    },
  } as unknown as Anthropic.Messages.Tool,
];

/**
 * Create calendar tools for a specific user
 */
export function createCalendarToolsForUser(
  ownerName: string
): Anthropic.Messages.Tool[] {
  return [
    {
      name: "calendar_list_events",
      description: `List ${ownerName}'s calendar events within a time range. Use ISO 8601 format for dates.`,
      input_schema: {
        type: "object" as const,
        properties: {
          timeMin: {
            type: "string",
            description:
              "Start of time range in ISO 8601 format (e.g., 2024-01-15T00:00:00Z)",
          },
          timeMax: {
            type: "string",
            description:
              "End of time range in ISO 8601 format (e.g., 2024-01-22T23:59:59Z)",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of events to return (default 10, max 50)",
          },
        },
        required: ["timeMin", "timeMax"],
      },
    } as unknown as Anthropic.Messages.Tool,
    {
      name: "calendar_free_busy",
      description: `Check ${ownerName}'s busy/free times within a time range. Useful for finding available slots.`,
      input_schema: {
        type: "object" as const,
        properties: {
          timeMin: {
            type: "string",
            description:
              "Start of time range in ISO 8601 format (e.g., 2024-01-15T00:00:00Z)",
          },
          timeMax: {
            type: "string",
            description:
              "End of time range in ISO 8601 format (e.g., 2024-01-22T23:59:59Z)",
          },
        },
        required: ["timeMin", "timeMax"],
      },
    } as unknown as Anthropic.Messages.Tool,
  ];
}

/**
 * Execute a calendar tool for a specific user
 */
export async function executeCalendarTool(
  userId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  if (toolName === "calendar_list_events") {
    const { timeMin, timeMax, maxResults } = input as {
      timeMin: string;
      timeMax: string;
      maxResults?: number;
    };

    const result = await listCalendarEvents(
      userId,
      timeMin,
      timeMax,
      Math.min(maxResults || 10, 50)
    );

    if ("error" in result) {
      if (result.needsReconnect) {
        return `Calendar access needs to be reconnected. Please go to your personal assistant settings to reconnect Google Calendar.`;
      }
      return `Error accessing calendar: ${result.error}`;
    }

    return formatEventsForDisplay(result);
  }

  if (toolName === "calendar_free_busy") {
    const { timeMin, timeMax } = input as {
      timeMin: string;
      timeMax: string;
    };

    const result = await getFreeBusy(userId, timeMin, timeMax);

    if ("error" in result) {
      if (result.needsReconnect) {
        return `Calendar access needs to be reconnected. Please go to your personal assistant settings to reconnect Google Calendar.`;
      }
      return `Error accessing calendar: ${result.error}`;
    }

    return formatFreeBusyForDisplay(result, timeMin, timeMax);
  }

  return `Unknown calendar tool: ${toolName}`;
}

/**
 * Check if a user has calendar access
 */
export async function userHasCalendarAccess(userId: string): Promise<boolean> {
  const { prisma } = await import("../db");

  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
      scope: { contains: "calendar" },
    },
  });

  return !!account?.access_token;
}
