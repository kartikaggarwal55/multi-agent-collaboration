/**
 * Shared utility functions used by both group-orchestrator and private chat route.
 */

import { prisma } from "./db";

const RATE_LIMIT_RETRY_DELAY_MS = 2000;
const MAX_RATE_LIMIT_RETRIES = 2;

// Default timezone - must match calendar.ts
const DEFAULT_TIMEZONE = "America/Los_Angeles";

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

  // Determine the year for upcoming months
  const nextYear = year + 1;
  const upcomingMonthYear = month >= 10 ? nextYear : year; // Nov/Dec → next year for Jan/Feb

  return `${formatted}
ISO Date: ${isoDate}
Timezone: ${DEFAULT_TIMEZONE}
Current Year: ${year}

IMPORTANT: When user mentions upcoming months like "January", "February", etc., use ${upcomingMonthYear} as the year (not ${year} if that month has passed).`;
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
