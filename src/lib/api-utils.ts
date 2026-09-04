/**
 * Shared utility functions used by both group-orchestrator and private chat route.
 */

import { prisma } from "./db";

const RATE_LIMIT_RETRY_DELAY_MS = 2000;
const MAX_RATE_LIMIT_RETRIES = 2;

// Default timezone - must match calendar.ts
export const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "America/Los_Angeles";

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function zonedMidnightToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string
): Date {
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;

  // Resolve the timezone offset at the target date. A second pass handles DST
  // boundaries where the initial UTC guess falls under a different offset.
  for (let attempt = 0; attempt < 2; attempt++) {
    const actual = getZonedParts(new Date(candidate), timeZone);
    const representedAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    candidate += target - representedAsUtc;
  }

  return new Date(candidate);
}

/** Get today's half-open time range in the configured application timezone. */
export function getTodayRange(): { timeMin: string; timeMax: string } {
  const today = getZonedParts(new Date(), DEFAULT_TIMEZONE);
  const nextDay = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const start = zonedMidnightToUtc(today.year, today.month, today.day, DEFAULT_TIMEZONE);
  const end = zonedMidnightToUtc(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    DEFAULT_TIMEZONE
  );

  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

/**
 * Strip <cite> tags from web search results while preserving inner content.
 */
export function stripCiteTags(text: string): string {
  return text.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, "$1");
}

/**
 * Retry an async function with exponential backoff on rate limit errors.
 */
export async function callWithRetry<T>(
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

/**
 * Get current date/time formatted for LLM prompts with timezone context.
 */
export function getCurrentDateTime(): string {
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

  return `${formatted}
ISO Date: ${isoDate}
Timezone: ${DEFAULT_TIMEZONE}
Current Year: ${year}
Current Month Number: ${month + 1}

IMPORTANT: When the user names a month without a year, interpret the next occurrence: use ${year} if that month/date has not passed, otherwise use ${year + 1}.`;
}

/**
 * Get which users in a set of user IDs have calendar and/or gmail scopes connected.
 * Returns Sets of user IDs for each scope.
 */
export async function getUserScopes(userIds: string[]): Promise<{
  usersWithCalendar: Set<string>;
  usersWithGmail: Set<string>;
}> {
  const accounts = await prisma.account.findMany({
    where: {
      userId: { in: userIds },
      provider: "google",
    },
    select: { userId: true, scope: true },
  });

  return {
    usersWithCalendar: new Set(
      accounts.filter((a) => a.scope?.includes("calendar")).map((a) => a.userId)
    ),
    usersWithGmail: new Set(
      accounts.filter((a) => a.scope?.includes("gmail")).map((a) => a.userId)
    ),
  };
}
