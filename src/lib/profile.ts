// CHANGED: Profile management functions for private assistant
import { prisma } from "./db";

// Profile item type
export interface ProfileItem {
  text: string;
}

// Profile change log entry
export interface ProfileChange {
  type: "added" | "updated" | "removed";
  before?: string;
  after?: string;
  reason: string;
  timestamp: string;
}

// Get or create user profile
export async function getUserProfile(userId: string): Promise<string[]> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
  });

  if (!profile) {
    // Create empty profile if doesn't exist
    await prisma.profile.create({
      data: {
        userId,
        items: "[]",
        changeLog: "[]",
      },
    });
    return [];
  }

  try {
    return JSON.parse(profile.items) as string[];
  } catch {
    return [];
  }
}

// Get profile change log
export async function getProfileChangeLog(userId: string): Promise<ProfileChange[]> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
  });

  if (!profile) return [];

  try {
    const changes = JSON.parse(profile.changeLog) as ProfileChange[];
    // Return last 10 changes
    return changes.slice(-10);
  } catch {
    return [];
  }
}

// Update user profile with new items and log changes
export async function updateUserProfile(
  userId: string,
  newItems: string[],
  changes: ProfileChange[]
): Promise<void> {
  // Get existing change log
  const existingChanges = await getProfileChangeLog(userId);

  // Append new changes (keep last 20)
  const updatedChangeLog = [...existingChanges, ...changes].slice(-20);

  await prisma.profile.upsert({
    where: { userId },
    update: {
      items: JSON.stringify(newItems),
      changeLog: JSON.stringify(updatedChangeLog),
    },
    create: {
      userId,
      items: JSON.stringify(newItems),
      changeLog: JSON.stringify(updatedChangeLog),
    },
  });
}

// Format profile for display
export function formatProfileForDisplay(items: string[]): string {
  if (items.length === 0) {
    return "No preferences learned yet. Tell me about yourself!";
  }
  return items.map((item) => `• ${item}`).join("\n");
}

// Format profile for system prompt
export function formatProfileForPrompt(items: string[]): string {
  if (items.length === 0) {
    return "No profile information yet - this is a new user.";
  }
  return items.map((item) => `- ${item}`).join("\n");
}
