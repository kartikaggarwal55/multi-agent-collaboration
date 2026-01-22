/**
 * API route to process voice session transcript and update user profile.
 * Stores conversation as individual messages and extracts profile updates from user messages only.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserProfile, updateUserProfile, ProfileChange } from "@/lib/profile";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const SUMMARY_MODEL = process.env.SUMMARY_MODEL || "claude-haiku-4-5";

interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const userId = session.user.id;
    const userName = session.user.name || "User";

    const { transcript } = await request.json();

    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
      return new Response(
        JSON.stringify({ error: "No transcript provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse transcript - can be either string[] or TranscriptEntry[]
    const entries: TranscriptEntry[] = transcript.map((item: string | TranscriptEntry) => {
      if (typeof item === 'string') {
        // Parse "[User]: text" or "[Assistant]: text" format
        const userMatch = item.match(/^\[User\]:\s*(.*)$/i);
        const assistantMatch = item.match(/^\[Assistant\]:\s*(.*)$/i);
        if (userMatch) {
          return { role: 'user' as const, text: userMatch[1] };
        } else if (assistantMatch) {
          return { role: 'assistant' as const, text: assistantMatch[1] };
        }
        // Default to user if no prefix
        return { role: 'user' as const, text: item };
      }
      return item;
    });

    console.log('Voice process: Parsed entries:', entries.length);

    // Extract only user messages for profile analysis
    const userMessages = entries
      .filter(e => e.role === 'user')
      .map(e => e.text)
      .filter(text => text.trim().length > 0);

    console.log('Voice process: User messages:', userMessages);

    // Analyze user messages for profile updates
    const changes: ProfileChange[] = [];
    if (userMessages.length > 0) {
      const currentItems = await getUserProfile(userId);

      const profileUpdates = await analyzeUserMessagesForProfile(
        userMessages,
        userName,
        currentItems // Pass current profile so LLM can make informed decisions
      );

      console.log('Voice process: Profile updates found:', JSON.stringify(profileUpdates));

      if (profileUpdates && profileUpdates.length > 0) {
        const newItems = [...currentItems];

        for (const update of profileUpdates) {
          const timestamp = new Date().toISOString();

          if (update.action === "add") {
            // Check for exact duplicates only
            const isDuplicate = newItems.some(
              item => item.toLowerCase() === update.item.toLowerCase()
            );

            if (!isDuplicate) {
              newItems.push(update.item);
              changes.push({
                type: "added",
                after: update.item,
                reason: update.reason,
                timestamp,
              });
              console.log(`Profile: Added "${update.item}"`);
            } else {
              console.log(`Profile: Skipped exact duplicate "${update.item}"`);
            }
          } else if (update.action === "replace") {
            // LLM specifies exactly which item to replace via index
            const replaceIndex = update.replaceIndex;
            if (replaceIndex !== undefined && replaceIndex >= 0 && replaceIndex < newItems.length) {
              const oldItem = newItems[replaceIndex];
              newItems[replaceIndex] = update.item;
              changes.push({
                type: "updated",
                before: oldItem,
                after: update.item,
                reason: update.reason,
                timestamp,
              });
              console.log(`Profile: Replaced [${replaceIndex}] "${oldItem}" → "${update.item}"`);
            } else {
              console.log(`Profile: Invalid replaceIndex ${replaceIndex}, adding instead`);
              newItems.push(update.item);
              changes.push({
                type: "added",
                after: update.item,
                reason: update.reason,
                timestamp,
              });
            }
          } else if (update.action === "remove") {
            const removeIndex = update.replaceIndex;
            if (removeIndex !== undefined && removeIndex >= 0 && removeIndex < newItems.length) {
              const removedItem = newItems.splice(removeIndex, 1)[0];
              changes.push({
                type: "removed",
                before: removedItem,
                reason: update.reason,
                timestamp,
              });
              console.log(`Profile: Removed [${removeIndex}] "${removedItem}"`);
            }
          }
        }

        if (changes.length > 0) {
          await updateUserProfile(userId, newItems, changes);
        }
      }
    }

    // Store each transcript entry as an individual message (sequentially to preserve order)
    const validEntries = entries.filter(e => e.text.trim().length > 0);

    if (validEntries.length > 0) {
      // Create messages one by one to ensure correct ordering by createdAt
      for (const entry of validEntries) {
        await prisma.privateMessage.create({
          data: {
            userId,
            role: entry.role === 'user' ? 'user' : 'assistant',
            // Add voice indicator to all user messages from voice
            content: entry.role === 'user'
              ? `🎤 ${entry.text}`
              : entry.text,
          },
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        changes,
        message: changes.length > 0
          ? `Updated ${changes.length} profile items`
          : "No profile updates needed",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Voice process error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process voice transcript" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

interface ProfileUpdate {
  action: "add" | "replace" | "remove";
  item: string;
  replaceIndex?: number; // Index of existing item to replace (only for "replace" action)
  reason: string;
}

/**
 * Analyze user messages for profile updates with awareness of current profile.
 * This allows the LLM to make smart decisions about adding vs replacing vs skipping.
 */
async function analyzeUserMessagesForProfile(
  userMessages: string[],
  userName: string,
  currentProfile: string[]
): Promise<ProfileUpdate[]> {
  try {
    const messagesText = userMessages.map((m, i) => `${i + 1}. "${m}"`).join('\n');

    const profileText = currentProfile.length > 0
      ? currentProfile.map((item, i) => `[${i}] ${item}`).join('\n')
      : "(empty - no preferences yet)";

    const response = await anthropic.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 1024,
      system: `You analyze what a user said and determine how to update their profile.

CURRENT PROFILE:
${profileText}

Your job is to extract preferences/facts from user messages and decide the appropriate action:

1. **ADD** - Use when the user shares NEW information not already in the profile
   - "I like Chinese food" when profile has no Chinese food preference → ADD
   - New preferences that don't conflict with existing ones → ADD

2. **REPLACE** - Use ONLY when new info DIRECTLY CONTRADICTS an existing item
   - "I'm not vegetarian anymore" contradicts "Vegetarian" → REPLACE with index
   - "I moved to LA" contradicts "Lives in NYC" → REPLACE with index
   - IMPORTANT: Only replace if there's a genuine contradiction!

3. **SKIP** (return empty array) - Use when:
   - Info is already captured in the profile
   - Message is a task/schedule item, not a preference
   - Message is about someone else

CRITICAL RULES:
- "I like X" does NOT replace "I like Y" - a person can like multiple things. ADD instead.
- A specific preference does NOT replace a general one. "Likes Chinese food" should be ADDED alongside "Vegetarian", not replace it.
- Only REPLACE when there's a logical contradiction (can't be both true).
- Never let a short/simple item replace a detailed/rich item unless it's a true contradiction.

Output format - JSON array:
- ADD: {"action": "add", "item": "The preference", "reason": "Why adding"}
- REPLACE: {"action": "replace", "item": "New value", "replaceIndex": 0, "reason": "What it contradicts"}
- REMOVE: {"action": "remove", "replaceIndex": 0, "item": "", "reason": "Why removing"}

Return [] if nothing to extract.`,
      messages: [
        {
          role: "user",
          content: `Here's what ${userName} said. Determine profile updates:\n\n${messagesText}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type === "text") {
      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('Voice process: Claude extracted:', parsed);
        return parsed;
      }
    }

    return [];
  } catch (error) {
    console.error("Profile analysis error:", error);
    return [];
  }
}

