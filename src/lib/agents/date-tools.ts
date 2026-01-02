// Date utility tools for accurate calendar calculations
// These tools provide reliable date computations without relying on model knowledge

import Anthropic from "@anthropic-ai/sdk";

const DATE_TOOL_NAMES = [
  "date_get_day_of_week",
  "date_get_upcoming_weekends",
  "date_days_between",
];

/**
 * Check if a tool name is a date utility tool
 */
export function isDateTool(toolName: string): boolean {
  return DATE_TOOL_NAMES.includes(toolName);
}

/**
 * Date utility tools definition
 */
export const DATE_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "date_get_day_of_week",
    description: `Get the day of the week for a specific date. Use this to verify what day a date falls on - do NOT guess or calculate days of the week yourself.`,
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format (e.g., 2026-01-15)",
        },
      },
      required: ["date"],
    },
  } as unknown as Anthropic.Messages.Tool,
  {
    name: "date_get_upcoming_weekends",
    description: `Get the next N weekends from a given start date. Returns each weekend with Friday, Saturday, Sunday dates and their day names. Use this when planning weekend trips or activities.`,
    input_schema: {
      type: "object" as const,
      properties: {
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format (defaults to today if not provided)",
        },
        count: {
          type: "number",
          description: "Number of weekends to return (default 4, max 12)",
        },
      },
      required: [],
    },
  } as unknown as Anthropic.Messages.Tool,
  {
    name: "date_days_between",
    description: `Calculate the number of days between two dates and list each date with its day of week.`,
    input_schema: {
      type: "object" as const,
      properties: {
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
        },
      },
      required: ["startDate", "endDate"],
    },
  } as unknown as Anthropic.Messages.Tool,
];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];

/**
 * Execute a date utility tool
 */
export function executeDateTool(
  toolName: string,
  input: Record<string, unknown>
): string {
  try {
    switch (toolName) {
      case "date_get_day_of_week":
        return getDayOfWeek(input.date as string);
      case "date_get_upcoming_weekends":
        return getUpcomingWeekends(
          input.startDate as string | undefined,
          input.count as number | undefined
        );
      case "date_days_between":
        return getDaysBetween(
          input.startDate as string,
          input.endDate as string
        );
      default:
        return `Unknown date tool: ${toolName}`;
    }
  } catch (error) {
    return `Error executing ${toolName}: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

function parseDate(dateStr: string): Date {
  // Parse YYYY-MM-DD format
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDayOfWeek(dateStr: string): string {
  const date = parseDate(dateStr);
  const dayName = DAYS[date.getDay()];
  const monthName = MONTHS[date.getMonth()];

  return `${dateStr} (${monthName} ${date.getDate()}, ${date.getFullYear()}) is a **${dayName}**`;
}

function getUpcomingWeekends(startDateStr?: string, count?: number): string {
  const numWeekends = Math.min(count || 4, 12);
  const startDate = startDateStr ? parseDate(startDateStr) : new Date();

  // Find next Friday
  let current = new Date(startDate);
  while (current.getDay() !== 5) { // 5 = Friday
    current.setDate(current.getDate() + 1);
  }

  const weekends: string[] = [];

  for (let i = 0; i < numWeekends; i++) {
    const friday = new Date(current);
    const saturday = new Date(current);
    saturday.setDate(saturday.getDate() + 1);
    const sunday = new Date(current);
    sunday.setDate(sunday.getDate() + 2);

    const monthName = MONTHS[friday.getMonth()];
    weekends.push(
      `**Weekend ${i + 1}: ${monthName} ${friday.getDate()}-${sunday.getDate()}, ${friday.getFullYear()}**\n` +
      `  - Friday ${formatDate(friday)}: ${DAYS[friday.getDay()]}\n` +
      `  - Saturday ${formatDate(saturday)}: ${DAYS[saturday.getDay()]}\n` +
      `  - Sunday ${formatDate(sunday)}: ${DAYS[sunday.getDay()]}`
    );

    // Move to next Friday
    current.setDate(current.getDate() + 7);
  }

  return `Upcoming weekends from ${formatDate(startDate)}:\n\n${weekends.join("\n\n")}`;
}

function getDaysBetween(startDateStr: string, endDateStr: string): string {
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);

  if (endDate < startDate) {
    return "Error: End date must be after start date";
  }

  const days: string[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    days.push(`${formatDate(current)} (${DAYS[current.getDay()]})`);
    current.setDate(current.getDate() + 1);

    // Limit to 60 days to prevent huge outputs
    if (days.length > 60) {
      days.push("... (truncated, showing first 60 days)");
      break;
    }
  }

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  return `Date range: ${startDateStr} to ${endDateStr} (${totalDays} days)\n\n${days.join("\n")}`;
}
