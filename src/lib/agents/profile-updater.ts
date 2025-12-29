// CHANGED: Profile update engine with conflict resolution via LLM
import Anthropic from "@anthropic-ai/sdk";
import { ProfileChange } from "../profile";

const anthropic = new Anthropic();
const PROFILE_MODEL = process.env.SUMMARY_MODEL || "claude-haiku-4-5";

// Tool for structured profile update output
const PROFILE_UPDATE_TOOL = {
  name: "update_profile",
  description: "Output the updated profile after analyzing the conversation",
  input_schema: {
    type: "object" as const,
    properties: {
      updated_profile: {
        type: "array",
        items: { type: "string" },
        description:
          "The complete updated profile as a list of preference/fact strings. Use format like 'Diet: vegetarian' or 'Timing: prefers early nights'.",
      },
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["added", "updated", "removed"],
            },
            before: {
              type: "string",
              description: "The old item (for updates/removals)",
            },
            after: {
              type: "string",
              description: "The new item (for adds/updates)",
            },
            reason: {
              type: "string",
              description: "Brief explanation of why this change was made",
            },
          },
          required: ["type", "reason"],
        },
        description: "List of changes made to the profile",
      },
      no_changes: {
        type: "boolean",
        description: "Set to true if no profile updates are needed",
      },
    },
    required: ["updated_profile", "changes", "no_changes"],
  },
};

// System prompt for profile updater
const PROFILE_UPDATE_SYSTEM_PROMPT = `You are a profile update engine. Your job is to analyze a conversation and update the user's profile accordingly.

## Rules for Profile Updates

1. **Only extract what the user actually said** - Don't invent facts or preferences
2. **Use clear labels** - Format items like "Diet: vegetarian", "Timing: prefers early nights"
3. **Resolve conflicts** - If new info contradicts existing info:
   - UPDATE the relevant item to reflect the new preference
   - Do NOT keep both contradictory items
   - You can merge nuance: "Usually prefers calm, but open to lively nights occasionally"
4. **Keep it concise** - Target 8-20 items max. If growing too large, merge related items
5. **Latest user intent wins** - If user explicitly states something new, that's authoritative

## Profile Categories (for reference)
- Diet/Food preferences
- Timing preferences (early/late nights, mornings)
- Vibe preferences (calm, lively, adventurous)
- Budget preferences
- Activity preferences
- Location/travel preferences
- Schedule constraints
- Personal facts (allergies, hobbies, work schedule)

## Output Requirements
- Call the update_profile tool with the complete updated profile
- Include all changes with clear reasons
- If no updates needed, set no_changes: true and return the existing profile unchanged`;

export interface ProfileUpdateResult {
  updatedProfile: string[];
  changes: ProfileChange[];
  hasChanges: boolean;
}

/**
 * CHANGED: Dedicated profile update engine that uses LLM to intelligently
 * merge new information with existing profile, resolving conflicts
 */
export async function runProfileUpdate(
  existingProfileItems: string[],
  newConversationTurns: Array<{ role: string; content: string }>
): Promise<ProfileUpdateResult> {
  // If no new conversation, return existing profile
  if (newConversationTurns.length === 0) {
    return {
      updatedProfile: existingProfileItems,
      changes: [],
      hasChanges: false,
    };
  }

  // Format existing profile
  const existingProfile =
    existingProfileItems.length > 0
      ? existingProfileItems.map((item) => `- ${item}`).join("\n")
      : "No existing profile items.";

  // Format recent conversation (focus on user messages)
  const conversationText = newConversationTurns
    .slice(-6) // Last 6 messages for context
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const userPrompt = `## Current Profile
${existingProfile}

## Recent Conversation
${conversationText}

Analyze the conversation and update the profile if the user revealed new preferences or facts. Remember to resolve any conflicts by updating (not duplicating) items.`;

  try {
    const response = await anthropic.messages.create({
      model: PROFILE_MODEL,
      max_tokens: 1024,
      system: PROFILE_UPDATE_SYSTEM_PROMPT,
      tools: [PROFILE_UPDATE_TOOL as unknown as Anthropic.Messages.Tool],
      tool_choice: { type: "tool", name: "update_profile" },
      messages: [{ role: "user", content: userPrompt }],
    });

    // Parse response
    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "update_profile") {
        const input = block.input as {
          updated_profile: string[];
          changes: Array<{
            type: "added" | "updated" | "removed";
            before?: string;
            after?: string;
            reason: string;
          }>;
          no_changes: boolean;
        };

        const changes: ProfileChange[] = input.changes.map((c) => ({
          type: c.type,
          before: c.before,
          after: c.after,
          reason: c.reason,
          timestamp: new Date().toISOString(),
        }));

        return {
          updatedProfile: input.updated_profile,
          changes,
          hasChanges: !input.no_changes && changes.length > 0,
        };
      }
    }

    // Fallback - return existing profile
    return {
      updatedProfile: existingProfileItems,
      changes: [],
      hasChanges: false,
    };
  } catch (error) {
    console.error("Error running profile update:", error);
    // On error, return existing profile unchanged
    return {
      updatedProfile: existingProfileItems,
      changes: [],
      hasChanges: false,
    };
  }
}

/**
 * CHANGED: Simpler version that checks if profile update is needed
 * before running the full LLM call
 */
export function mightNeedProfileUpdate(userMessage: string): boolean {
  // Quick heuristics to check if message might contain profile-relevant info
  const profileKeywords = [
    // Preferences
    "prefer", "like", "love", "hate", "don't like", "usually", "always", "never",
    "favorite", "favourite",
    // Food/Diet
    "vegetarian", "vegan", "allergic", "allergy", "diet", "eat", "food",
    // Timing
    "morning", "evening", "night", "early", "late", "weekend",
    // Vibe
    "quiet", "calm", "loud", "lively", "adventure", "relax",
    // Budget
    "budget", "expensive", "cheap", "afford", "money",
    // Activities
    "hobby", "hobbies", "sport", "exercise", "work", "job",
    // Explicit preference statements
    "i am", "i'm", "i have", "i do", "i can", "i know",
  ];

  const lowerMessage = userMessage.toLowerCase();
  return profileKeywords.some((keyword) => lowerMessage.includes(keyword));
}
