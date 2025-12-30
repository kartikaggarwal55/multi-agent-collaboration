// Gmail tools for both private and group orchestrators
import Anthropic from "@anthropic-ai/sdk";
import {
  searchGmailMessages,
  getGmailThread,
  getGmailMessage,
  formatGmailSearchForDisplay,
  formatGmailThreadForDisplay,
  formatGmailMessageForDisplay,
} from "../gmail";

// Gmail tool names
const GMAIL_TOOL_NAMES = ["gmail_search", "gmail_get_thread", "gmail_get_message"];

/**
 * Check if a tool name is a Gmail tool
 */
export function isGmailTool(toolName: string): boolean {
  return GMAIL_TOOL_NAMES.includes(toolName);
}

/**
 * Static Gmail tools (for private assistant)
 */
export const GMAIL_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "gmail_search",
    description: `Search your Gmail inbox. Supports Gmail query syntax:
- from:sender@example.com - emails from a specific sender
- to:recipient@example.com - emails to a recipient
- subject:keyword - emails with keyword in subject
- newer_than:7d - emails from last 7 days (use d for days, m for months)
- older_than:30d - emails older than 30 days
- has:attachment - emails with attachments
- filename:pdf - emails with PDF attachments
- "exact phrase" - emails containing exact phrase
- is:starred, is:unread, is:important - filtered by status

Examples:
- "from:amazon subject:order newer_than:30d"
- "subject:(reservation OR confirmation) newer_than:14d"
- "from:airline has:attachment"`,
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Gmail search query using Gmail query syntax",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of emails to return (default 5, max 20)",
        },
      },
      required: ["query"],
    },
  } as unknown as Anthropic.Messages.Tool,
  {
    name: "gmail_get_thread",
    description: `Get a full email thread/conversation with all messages. Use after searching to read the complete email thread.`,
    input_schema: {
      type: "object" as const,
      properties: {
        threadId: {
          type: "string",
          description: "The thread ID from a search result",
        },
      },
      required: ["threadId"],
    },
  } as unknown as Anthropic.Messages.Tool,
  {
    name: "gmail_get_message",
    description: `Get a single email message with full body content. Use when you need the complete content of a specific email.`,
    input_schema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "The message ID from a search result",
        },
      },
      required: ["messageId"],
    },
  } as unknown as Anthropic.Messages.Tool,
];

/**
 * Create Gmail tools for a specific user
 */
export function createGmailToolsForUser(
  ownerName: string
): Anthropic.Messages.Tool[] {
  return [
    {
      name: "gmail_search",
      description: `Search ${ownerName}'s Gmail inbox. Supports Gmail query syntax:
- from:sender@example.com - emails from a specific sender
- subject:keyword - emails with keyword in subject
- newer_than:7d - emails from last 7 days
- has:attachment - emails with attachments
- "exact phrase" - emails containing exact phrase

Examples:
- "from:amazon subject:order newer_than:30d"
- "subject:(reservation OR confirmation) newer_than:14d"`,
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Gmail search query using Gmail query syntax",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of emails to return (default 5, max 20)",
          },
        },
        required: ["query"],
      },
    } as unknown as Anthropic.Messages.Tool,
    {
      name: "gmail_get_thread",
      description: `Get a full email thread from ${ownerName}'s Gmail with all messages.`,
      input_schema: {
        type: "object" as const,
        properties: {
          threadId: {
            type: "string",
            description: "The thread ID from a search result",
          },
        },
        required: ["threadId"],
      },
    } as unknown as Anthropic.Messages.Tool,
    {
      name: "gmail_get_message",
      description: `Get a single email from ${ownerName}'s Gmail with full body content.`,
      input_schema: {
        type: "object" as const,
        properties: {
          messageId: {
            type: "string",
            description: "The message ID from a search result",
          },
        },
        required: ["messageId"],
      },
    } as unknown as Anthropic.Messages.Tool,
  ];
}

/**
 * Execute a Gmail tool for a specific user
 */
export async function executeGmailTool(
  userId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  if (toolName === "gmail_search") {
    const { query, maxResults } = input as {
      query: string;
      maxResults?: number;
    };

    const result = await searchGmailMessages(
      userId,
      query,
      Math.min(maxResults || 5, 20)
    );

    if ("error" in result) {
      if (result.needsReconnect) {
        return `Gmail access needs to be reconnected. Please go to settings and reconnect Google to grant Gmail access.`;
      }
      return `Error accessing Gmail: ${result.error}`;
    }

    if (result.messages.length === 0) {
      return `No emails found matching: "${query}"`;
    }

    return formatGmailSearchForDisplay(result);
  }

  if (toolName === "gmail_get_thread") {
    const { threadId } = input as { threadId: string };

    const result = await getGmailThread(userId, threadId);

    if ("error" in result) {
      if (result.needsReconnect) {
        return `Gmail access needs to be reconnected. Please go to settings and reconnect Google.`;
      }
      return `Error accessing Gmail: ${result.error}`;
    }

    return formatGmailThreadForDisplay(result);
  }

  if (toolName === "gmail_get_message") {
    const { messageId } = input as { messageId: string };

    const result = await getGmailMessage(userId, messageId);

    if ("error" in result) {
      if (result.needsReconnect) {
        return `Gmail access needs to be reconnected. Please go to settings and reconnect Google.`;
      }
      return `Error accessing Gmail: ${result.error}`;
    }

    return formatGmailMessageForDisplay(result);
  }

  return `Unknown Gmail tool: ${toolName}`;
}

/**
 * Check if a user has Gmail access
 */
export async function userHasGmailAccess(userId: string): Promise<boolean> {
  const { prisma } = await import("../db");

  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
      scope: { contains: "gmail" },
    },
  });

  return !!account?.access_token;
}
