// Privacy Filter - Lightweight LLM layer to filter sensitive information
// Uses a fast model (Haiku) to ensure only necessary information is disclosed
// Based on "minimum necessary disclosure" principle

import Anthropic from "@anthropic-ai/sdk";
import { CanonicalState } from "../types";

const anthropic = new Anthropic();
const FILTER_MODEL = "claude-3-5-haiku-20241022";

interface PrivacyFilterContext {
  conversationGoal: string;
  currentStage: string;
  ownerName: string;
  recipientNames: string[]; // Who will see this message
}

interface FilterResult {
  filteredMessage: string;
  wasModified: boolean;
  modifications?: string[]; // Brief descriptions of what was redacted
}

/**
 * Information Disclosure Framework
 *
 * Categories of information and their disclosure rules:
 *
 * 1. CALENDAR DATA
 *    - Disclose: Available time slots, general busy periods, conflicts with proposed times
 *    - Redact: Meeting titles, attendees, meeting descriptions, private event details
 *    - Exception: If meeting is directly relevant to goal (e.g., planning dinner and existing reservation)
 *
 * 2. EMAIL DATA
 *    - Disclose: Confirmation numbers, booking references, relevant dates/times
 *    - Redact: Full email content, sender details (unless relevant), unrelated correspondence
 *    - Exception: When user explicitly asked to share specific email content
 *
 * 3. PERSONAL PREFERENCES
 *    - Disclose: Preferences directly relevant to the current decision (dietary, budget range)
 *    - Redact: Preferences not relevant to current goal
 *
 * 4. FINANCIAL DETAILS
 *    - Disclose: Budget ranges, price preferences ("under $200")
 *    - Redact: Exact account balances, specific transaction history
 *
 * 5. LOCATION/SCHEDULE
 *    - Disclose: General availability, travel constraints
 *    - Redact: Specific addresses (unless pickup/dropoff needed), detailed daily schedules
 */

function buildFilterPrompt(
  rawMessage: string,
  context: PrivacyFilterContext
): string {
  return `You are a privacy filter for a collaborative planning assistant. Your job is to review a message before it's shared in a group chat and redact unnecessary sensitive details.

## Conversation Context
- **Goal**: ${context.conversationGoal || "General planning/coordination"}
- **Stage**: ${context.currentStage}
- **Message Author**: ${context.ownerName}'s Assistant
- **Recipients**: ${context.recipientNames.join(", ")}

## Privacy Rules - Apply These Strictly

### Calendar Information
- ✅ KEEP: "I'm free on Saturday afternoon" or "${context.ownerName} has a conflict 2-4pm"
- ❌ REDACT: "Meeting with Dr. Smith" → "has an appointment"
- ❌ REDACT: "Interview at Google" → "has a commitment"
- ❌ REDACT: "Therapy session" → "has an appointment"
The goal is scheduling, so availability matters, not what the events are.

### Email Information
- ✅ KEEP: Confirmation numbers, booking references, dates, prices for planned items
- ❌ REDACT: Full email quotes (summarize instead)
- ❌ REDACT: Unrelated correspondence mentioned
- ✅ KEEP: Relevant booking details being discussed

### Meeting/Event Details
When calendar shows existing events:
- ✅ KEEP: Time blocks, duration, "has a conflict"
- ❌ REDACT: Event titles, attendee names, event descriptions
- Exception: If the event IS the topic being planned

### Financial Details
- ✅ KEEP: Budget preferences ("prefers budget options", "under $200/night")
- ❌ REDACT: Exact amounts from unrelated transactions
- ✅ KEEP: Prices of options being discussed

### Personal Information
- ✅ KEEP: Preferences relevant to current decision (dietary restrictions for restaurant planning)
- ❌ REDACT: Preferences not relevant to current topic

## Task

Review this message and return a filtered version. Only modify parts that violate the privacy rules above. Keep the message natural and helpful - don't over-redact.

If the message is already appropriate, return it unchanged.

## Original Message
${rawMessage}

## Response Format
Return ONLY the filtered message, nothing else. No explanations, no prefixes.`;
}

/**
 * Filter an assistant message for privacy before sending to group
 *
 * @param rawMessage - The original message from the assistant
 * @param canonicalState - Current conversation state (for context)
 * @param ownerName - Name of the assistant's owner
 * @param allParticipantNames - Names of all participants who will see the message
 * @returns Filtered message with sensitive info redacted
 */
export async function filterMessageForPrivacy(
  rawMessage: string,
  canonicalState: CanonicalState,
  ownerName: string,
  allParticipantNames: string[]
): Promise<FilterResult> {
  // Skip filtering for very short messages (likely simple responses)
  if (rawMessage.length < 50) {
    return { filteredMessage: rawMessage, wasModified: false };
  }

  // Skip if message doesn't seem to contain potentially sensitive info
  const sensitivePatterns = [
    /calendar|schedule|appointment|meeting|event/i,
    /email|gmail|inbox|message from/i,
    /\$\d+|budget|cost|price|paid/i,
    /address|location|where.*live/i,
    /doctor|therapy|medical|health/i,
    /interview|job|work.*meeting/i,
  ];

  const mightContainSensitiveInfo = sensitivePatterns.some(pattern =>
    pattern.test(rawMessage)
  );

  if (!mightContainSensitiveInfo) {
    return { filteredMessage: rawMessage, wasModified: false };
  }

  const context: PrivacyFilterContext = {
    conversationGoal: canonicalState.goal || canonicalState.leadingOption || "",
    currentStage: canonicalState.stage,
    ownerName,
    recipientNames: allParticipantNames.filter(n => n !== `${ownerName}'s Assistant`),
  };

  try {
    const response = await anthropic.messages.create({
      model: FILTER_MODEL,
      max_tokens: 2048,
      temperature: 0, // Deterministic for consistency
      messages: [
        {
          role: "user",
          content: buildFilterPrompt(rawMessage, context),
        },
      ],
    });

    const filteredMessage = response.content[0].type === "text"
      ? response.content[0].text.trim()
      : rawMessage;

    // Check if message was actually modified
    const wasModified = filteredMessage !== rawMessage;

    return {
      filteredMessage,
      wasModified,
      modifications: wasModified ? ["Privacy filter applied"] : undefined,
    };
  } catch (error) {
    console.error("[PrivacyFilter] Error filtering message:", error);
    // On error, return original message rather than blocking
    return { filteredMessage: rawMessage, wasModified: false };
  }
}

/**
 * Quick check if a message likely needs privacy filtering
 * Used to skip the LLM call for obviously safe messages
 */
export function messageNeedsPrivacyReview(message: string): boolean {
  // Very short messages are usually safe
  if (message.length < 50) return false;

  // Check for sensitive topic indicators
  const sensitiveIndicators = [
    "checked your calendar",
    "found in your email",
    "your schedule shows",
    "you have a meeting",
    "searched your gmail",
    "appointment at",
    "event on",
  ];

  const lowerMessage = message.toLowerCase();
  return sensitiveIndicators.some(indicator => lowerMessage.includes(indicator));
}
