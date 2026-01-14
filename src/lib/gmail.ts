// Gmail service for reading user emails
import { google, gmail_v1 } from "googleapis";
import { prisma } from "./db";

// Types
export interface GmailMessage {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  to?: string;
  date: string;
  snippet: string;
  bodyExcerpt: string;
  bodyText?: string;
  gmailUrl: string;
  hasAttachments: boolean;
  attachments?: Array<{ filename: string; mimeType: string; size: number }>;
}

export interface GmailThread {
  threadId: string;
  subject: string;
  messages: GmailMessage[];
  gmailUrl: string;
}

export interface GmailSearchResult {
  messages: GmailMessage[];
  resultCount: number;
}

export interface GmailError {
  error: string;
  code?: string;
  needsReconnect?: boolean;
}

// OAuth2 client result type
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
type OAuth2Result =
  | { error: string; needsReconnect: boolean }
  | { client: OAuth2Client };

/**
 * Get OAuth2 client with user's tokens
 */
async function getOAuth2Client(userId: string): Promise<OAuth2Result> {
  // Find accounts with gmail scope specifically
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      provider: "google",
    },
  });

  // Prefer account with gmail scope
  const account = accounts.find(a => a.scope?.includes("gmail")) || accounts[0];

  if (!account) {
    return { error: "No Google account connected", needsReconnect: true };
  }

  if (!account.access_token) {
    return { error: "No access token available", needsReconnect: true };
  }

  // Check if Gmail scope is present
  if (!account.scope?.includes("gmail")) {
    return { error: "Gmail access not granted. Please reconnect Google.", needsReconnect: true };
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

  // Handle token refresh
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
 * Generate Gmail URL for a thread
 */
export function getGmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

/**
 * Generate Gmail URL for a message
 */
export function getGmailMessageUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

/**
 * Decode base64url content from Gmail
 */
function decodeBase64Url(data: string): string {
  try {
    // Replace base64url characters with base64 standard
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * Extract plain text body from Gmail message payload
 */
function extractBodyText(
  payload: gmail_v1.Schema$MessagePart | undefined,
  maxLength: number = 8000
): { bodyText: string; bodyExcerpt: string } {
  if (!payload) {
    return { bodyText: "", bodyExcerpt: "" };
  }

  let plainText = "";
  let htmlText = "";

  // Recursive function to find text parts
  function findTextParts(part: gmail_v1.Schema$MessagePart): void {
    const mimeType = part.mimeType || "";

    if (mimeType === "text/plain" && part.body?.data) {
      plainText += decodeBase64Url(part.body.data);
    } else if (mimeType === "text/html" && part.body?.data) {
      htmlText += decodeBase64Url(part.body.data);
    }

    // Check nested parts
    if (part.parts) {
      for (const subPart of part.parts) {
        findTextParts(subPart);
      }
    }
  }

  findTextParts(payload);

  // Prefer plain text, fall back to stripped HTML
  let bodyText = plainText;
  if (!bodyText && htmlText) {
    // Strip HTML tags and decode entities
    bodyText = htmlText
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  // Truncate to max length
  if (bodyText.length > maxLength) {
    bodyText = bodyText.slice(0, maxLength) + "...";
  }

  // Create excerpt (first ~1000 chars)
  const excerptLength = 1000;
  const bodyExcerpt =
    bodyText.length > excerptLength
      ? bodyText.slice(0, excerptLength) + "..."
      : bodyText;

  return { bodyText, bodyExcerpt };
}

/**
 * Extract header value from message headers
 */
function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  if (!headers) return "";
  const header = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "";
}

/**
 * Extract attachments info from message payload
 */
function extractAttachments(
  payload: gmail_v1.Schema$MessagePart | undefined
): Array<{ filename: string; mimeType: string; size: number }> {
  const attachments: Array<{ filename: string; mimeType: string; size: number }> = [];

  function findAttachments(part: gmail_v1.Schema$MessagePart): void {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
      });
    }
    if (part.parts) {
      for (const subPart of part.parts) {
        findAttachments(subPart);
      }
    }
  }

  if (payload) {
    findAttachments(payload);
  }

  return attachments;
}

/**
 * Parse Gmail message into our format
 */
function parseMessage(
  message: gmail_v1.Schema$Message,
  includeFullBody: boolean = false
): GmailMessage {
  const headers = message.payload?.headers;
  const { bodyText, bodyExcerpt } = extractBodyText(
    message.payload,
    includeFullBody ? 8000 : 2000
  );
  const attachments = extractAttachments(message.payload);

  return {
    messageId: message.id || "",
    threadId: message.threadId || "",
    subject: getHeader(headers, "Subject") || "(No Subject)",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To") || undefined,
    date: getHeader(headers, "Date"),
    snippet: message.snippet || "",
    bodyExcerpt,
    bodyText: includeFullBody ? bodyText : undefined,
    gmailUrl: getGmailThreadUrl(message.threadId || ""),
    hasAttachments: attachments.length > 0,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

/**
 * Search Gmail messages
 */
export async function searchGmailMessages(
  userId: string,
  query: string,
  maxResults: number = 10
): Promise<GmailSearchResult | GmailError> {
  const result = await getOAuth2Client(userId);

  if ("error" in result) {
    return { error: result.error, needsReconnect: result.needsReconnect };
  }

  const gmail = google.gmail({ version: "v1", auth: result.client });

  try {
    // Search for messages
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: Math.min(maxResults, 20),
    });

    const messageIds = listResponse.data.messages || [];

    if (messageIds.length === 0) {
      return { messages: [], resultCount: 0 };
    }

    // Fetch message details (metadata + snippet)
    const messages: GmailMessage[] = [];

    for (const msg of messageIds) {
      if (!msg.id) continue;

      try {
        const messageResponse = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "To", "Date"],
        });

        messages.push(parseMessage(messageResponse.data, false));
      } catch (err) {
        console.error(`Error fetching message ${msg.id}:`, err);
      }
    }

    return {
      messages,
      resultCount: listResponse.data.resultSizeEstimate || messages.length,
    };
  } catch (error: unknown) {
    console.error("Error searching Gmail:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes("invalid_grant") ||
      errorMessage.includes("Token has been expired")
    ) {
      return { error: "Gmail access expired", needsReconnect: true };
    }

    if (errorMessage.includes("Insufficient Permission")) {
      return {
        error: "Gmail access not granted. Please reconnect Google.",
        needsReconnect: true,
      };
    }

    return { error: "Failed to search Gmail" };
  }
}

/**
 * Get a Gmail thread with all messages
 */
export async function getGmailThread(
  userId: string,
  threadId: string
): Promise<GmailThread | GmailError> {
  const result = await getOAuth2Client(userId);

  if ("error" in result) {
    return { error: result.error, needsReconnect: result.needsReconnect };
  }

  const gmail = google.gmail({ version: "v1", auth: result.client });

  try {
    const threadResponse = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const thread = threadResponse.data;
    const messages = (thread.messages || []).map((m) => parseMessage(m, true));

    // Get subject from first message
    const subject = messages[0]?.subject || "(No Subject)";

    return {
      threadId: thread.id || threadId,
      subject,
      messages,
      gmailUrl: getGmailThreadUrl(threadId),
    };
  } catch (error: unknown) {
    console.error("Error getting Gmail thread:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes("invalid_grant") ||
      errorMessage.includes("Token has been expired")
    ) {
      return { error: "Gmail access expired", needsReconnect: true };
    }

    return { error: "Failed to fetch email thread" };
  }
}

/**
 * Get a single Gmail message
 */
export async function getGmailMessage(
  userId: string,
  messageId: string
): Promise<GmailMessage | GmailError> {
  const result = await getOAuth2Client(userId);

  if ("error" in result) {
    return { error: result.error, needsReconnect: result.needsReconnect };
  }

  const gmail = google.gmail({ version: "v1", auth: result.client });

  try {
    const messageResponse = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    return parseMessage(messageResponse.data, true);
  } catch (error: unknown) {
    console.error("Error getting Gmail message:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes("invalid_grant") ||
      errorMessage.includes("Token has been expired")
    ) {
      return { error: "Gmail access expired", needsReconnect: true };
    }

    return { error: "Failed to fetch email" };
  }
}

/**
 * Format search results for display
 */
export function formatGmailSearchForDisplay(result: GmailSearchResult): string {
  if (result.messages.length === 0) {
    return "No emails found matching your search.";
  }

  return result.messages
    .map((msg, i) => {
      let line = `${i + 1}. **${msg.subject}**\n`;
      line += `   From: ${msg.from}\n`;
      line += `   Date: ${msg.date}\n`;
      line += `   ${msg.snippet.slice(0, 150)}${msg.snippet.length > 150 ? "..." : ""}\n`;
      line += `   [Open in Gmail](${msg.gmailUrl})`;
      if (msg.hasAttachments) {
        line += ` (has attachments)`;
      }
      return line;
    })
    .join("\n\n");
}

/**
 * Format thread for display
 */
export function formatGmailThreadForDisplay(thread: GmailThread): string {
  let output = `**Thread: ${thread.subject}**\n`;
  output += `[Open in Gmail](${thread.gmailUrl})\n\n`;

  for (const msg of thread.messages) {
    output += `---\n`;
    output += `**From:** ${msg.from}\n`;
    output += `**Date:** ${msg.date}\n\n`;
    output += msg.bodyExcerpt + "\n\n";
  }

  return output;
}

/**
 * Format single message for display
 */
export function formatGmailMessageForDisplay(msg: GmailMessage): string {
  let output = `**Subject:** ${msg.subject}\n`;
  output += `**From:** ${msg.from}\n`;
  if (msg.to) output += `**To:** ${msg.to}\n`;
  output += `**Date:** ${msg.date}\n`;
  output += `[Open in Gmail](${msg.gmailUrl})\n\n`;
  output += msg.bodyText || msg.bodyExcerpt;

  if (msg.attachments && msg.attachments.length > 0) {
    output += `\n\n**Attachments:**\n`;
    for (const att of msg.attachments) {
      output += `- ${att.filename} (${att.mimeType})\n`;
    }
  }

  return output;
}

/**
 * Validate that Gmail access is actually working (not just that token exists)
 * Makes a lightweight API call to verify the token is valid
 */
export async function validateGmailAccess(userId: string): Promise<boolean> {
  const result = await getOAuth2Client(userId);

  if ("error" in result) {
    return false;
  }

  const gmail = google.gmail({ version: "v1", auth: result.client });

  try {
    // Make a minimal API call - just get profile (very lightweight)
    await gmail.users.getProfile({ userId: "me" });
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log("Gmail validation failed:", errorMessage);
    return false;
  }
}
