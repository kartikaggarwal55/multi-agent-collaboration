// CHANGED: Calendar tool definitions for assistant
import Anthropic from "@anthropic-ai/sdk";
import {
  listCalendarEvents,
  getFreeBusy,
  formatEventsForDisplay,
  formatFreeBusyForDisplay,
  CalendarError,
} from "../calendar";

// Tool definitions for calendar access
export const CALENDAR_LIST_EVENTS_TOOL: Anthropic.Messages.Tool = {
  name: "calendar_list_events",
  description:
    "List upcoming calendar events for the user. Use this to check what's on their schedule.",
  input_schema: {
    type: "object" as const,
    properties: {
      timeMin: {
        type: "string",
        description:
          "Start of time range in ISO format (e.g., '2024-01-15T00:00:00Z'). Defaults to now.",
      },
      timeMax: {
        type: "string",
        description:
          "End of time range in ISO format (e.g., '2024-01-22T23:59:59Z'). Required.",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of events to return (default: 10, max: 50)",
      },
    },
    required: ["timeMax"],
  },
};

export const CALENDAR_FREE_BUSY_TOOL: Anthropic.Messages.Tool = {
  name: "calendar_free_busy",
  description:
    "Check when the user is busy/free during a time range. Use this to find available slots for scheduling.",
  input_schema: {
    type: "object" as const,
    properties: {
      timeMin: {
        type: "string",
        description:
          "Start of time range in ISO format (e.g., '2024-01-15T00:00:00Z'). Defaults to now.",
      },
      timeMax: {
        type: "string",
        description:
          "End of time range in ISO format (e.g., '2024-01-22T23:59:59Z'). Required.",
      },
    },
    required: ["timeMax"],
  },
};

// All calendar tools
export const CALENDAR_TOOLS: Anthropic.Messages.Tool[] = [
  CALENDAR_LIST_EVENTS_TOOL,
  CALENDAR_FREE_BUSY_TOOL,
];

/**
 * CHANGED: Execute a calendar tool call
 */
export async function executeCalendarTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string
): Promise<{ result: string; needsReconnect?: boolean }> {
  const now = new Date().toISOString();

  switch (toolName) {
    case "calendar_list_events": {
      const timeMin = (toolInput.timeMin as string) || now;
      const timeMax = toolInput.timeMax as string;
      const maxResults = Math.min((toolInput.maxResults as number) || 10, 50);

      const result = await listCalendarEvents(userId, timeMin, timeMax, maxResults);

      if ("error" in result) {
        return {
          result: `Error accessing calendar: ${result.error}`,
          needsReconnect: (result as CalendarError).needsReconnect,
        };
      }

      return { result: formatEventsForDisplay(result) };
    }

    case "calendar_free_busy": {
      const timeMin = (toolInput.timeMin as string) || now;
      const timeMax = toolInput.timeMax as string;

      const result = await getFreeBusy(userId, timeMin, timeMax);

      if ("error" in result) {
        return {
          result: `Error accessing calendar: ${result.error}`,
          needsReconnect: (result as CalendarError).needsReconnect,
        };
      }

      return { result: formatFreeBusyForDisplay(result, timeMin, timeMax) };
    }

    default:
      return { result: `Unknown calendar tool: ${toolName}` };
  }
}

/**
 * CHANGED: Check if a tool is a calendar tool
 */
export function isCalendarTool(toolName: string): boolean {
  return toolName === "calendar_list_events" || toolName === "calendar_free_busy";
}
