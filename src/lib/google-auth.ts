/**
 * Shared Google OAuth2 client factory.
 * Used by both calendar.ts and gmail.ts to avoid duplicating OAuth setup logic.
 */
import { google } from "googleapis";
import { prisma } from "./db";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export type OAuth2Result =
  | { error: string; needsReconnect: boolean }
  | { client: OAuth2Client };

/**
 * Get an OAuth2 client with a user's tokens.
 * @param userId - The user ID to look up tokens for
 * @param preferredScope - Prefer an account with this scope (e.g., "calendar", "gmail")
 */
export async function getOAuth2Client(
  userId: string,
  preferredScope?: string
): Promise<OAuth2Result> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      provider: "google",
    },
  });

  // Prefer account with the requested scope
  const account = preferredScope
    ? accounts.find(a => a.scope?.includes(preferredScope)) || accounts[0]
    : accounts[0];

  if (!account) {
    return { error: "No Google account connected", needsReconnect: true };
  }

  if (!account.access_token) {
    return { error: "No access token available", needsReconnect: true };
  }

  // For Gmail, verify the scope is actually present
  if (preferredScope === "gmail" && !account.scope?.includes("gmail")) {
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

  // Handle token refresh - persist new tokens to DB
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
