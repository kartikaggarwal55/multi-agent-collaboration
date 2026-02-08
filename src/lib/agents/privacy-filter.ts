// Privacy Filter - Lightweight LLM layer to filter sensitive information
// Uses a fast model (Haiku) to ensure only necessary information is disclosed
// Based on "minimum necessary disclosure" principle

import Anthropic from "@anthropic-ai/sdk";
import { CanonicalState } from "../types";

const anthropic = new Anthropic();
const FILTER_MODEL = "claude-haiku-4-5";

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
 * Privacy Filter - Goal-Oriented Disclosure Framework
 *
 * Core principle: For each piece of information, ask:
 * 1. Is this necessary to achieve the current goal?
 * 2. Would a more abstract version serve the same purpose?
 * 3. Does the audience need this specific detail, or just the implication?
 *
 * Decision types:
 * - KEEP: Directly enables progress, removing would confuse, user chose to share
 * - ABSTRACT: Implication matters but specific detail doesn't
 * - REMOVE: Unrelated to goal, third-party details, irrelevant private matters
 *
 * The goal is privacy protection while preserving message usefulness.
 */

function buildFilterPrompt(
  rawMessage: string,
  context: PrivacyFilterContext
): string {
  return `You are a privacy filter for a collaborative assistant. Review this message before it's shared in a group chat and apply the minimum necessary disclosure principle.

## Context
- **Current Goal**: ${context.conversationGoal || "General coordination"}
- **Stage**: ${context.currentStage}
- **Author**: ${context.ownerName}'s Assistant
- **Audience**: ${context.recipientNames.join(", ")}

## Core Principle: Goal-Oriented Disclosure

For each piece of information in the message, ask:
1. **Is this necessary to achieve the current goal?**
2. **Would a more abstract version serve the same purpose?**
3. **Does the audience need this specific detail, or just the implication?**

The goal is to preserve the message's usefulness while removing details that don't contribute to the shared objective.

## Decision Framework

**KEEP information when:**
- It directly enables progress on the current goal
- Removing it would make the message unhelpful or confusing
- The user explicitly chose to share it
- It's about options/plans being actively discussed
- The audience and goal context warrant the level of detail

**ABSTRACT information when:**
- The implication matters but the specific detail doesn't
- Example: "has a conflict" vs. the nature of the conflict (when scheduling)
- Example: "found a reservation" vs. quoting full email content
- The detail involves third parties not in the conversation

**REMOVE information when:**
- It's clearly unrelated to the current goal
- It exposes private matters with no bearing on the decision at hand
- Including it would be surprising or uncomfortable for the owner

**Context matters**: The same detail might be appropriate in one context and not another. A medical appointment might be relevant when family is coordinating care, but just "has an appointment" when colleagues are scheduling a meeting.

## Category Guidelines

For each category, consider: Does the specific detail serve the goal, or would an abstraction work just as well?

**Time & Availability**:
- The key question: Does the audience need to know WHY someone is busy, or just WHEN?
- If coordinating schedules: Usually just the time blocks matter ("busy 2-4pm")
- If the event IS the topic (e.g., discussing a shared meeting): Details are relevant
- Third-party names in calendar events should generally be abstracted unless directly relevant
- Example: For schedule coordination, "has a conflict" usually suffices over "meeting with Dr. Smith"

**Communications (email, messages)**: Share relevant confirmations, references, dates. Summarize rather than quote. Omit unrelated correspondence.

**Financial**: Share stated preferences and ranges. Share prices of discussed options. Abstract transaction details unless directly relevant.

**Locations**: Share what's needed for coordination. Abstract specific addresses unless the location itself is being planned/discussed.

**Personal details**: Share preferences that affect the current decision. Consider whether health, work, or relationship details are necessary for the goal or just incidental.

## Important: Avoid Over-Filtering

- Don't redact so aggressively that the message becomes unhelpful
- If unsure whether something is relevant, lean toward keeping it
- Preserve the natural flow and helpfulness of the message
- The goal is privacy protection, not information minimization

## Message to Review
${rawMessage}

## Response
Return ONLY the filtered message. No explanations, prefixes, or commentary. If no changes needed, return the message exactly as-is.`;
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

  // Skip if message doesn't reference data sources that might contain private info
  // These patterns detect when the assistant accessed private data, not specific content
  const dataAccessPatterns = [
    /calendar|schedule|checked.*availability|looked.*at.*events/i,
    /email|gmail|inbox|searched.*messages|found.*in.*mail/i,
    /\bprofile\b|preferences|based on.*history/i,
    /your.*account|your.*records/i,
  ];

  const mightContainSensitiveInfo = dataAccessPatterns.some(pattern =>
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

    // Detailed logging for debugging
    if (wasModified) {
      console.log("\n╔══════════════════════════════════════════════════════════════");
      console.log("║ [PrivacyFilter] MESSAGE MODIFIED");
      console.log("╠══════════════════════════════════════════════════════════════");
      console.log("║ BEFORE:");
      console.log("╟──────────────────────────────────────────────────────────────");
      rawMessage.split("\n").forEach(line => console.log(`║ ${line}`));
      console.log("╠══════════════════════════════════════════════════════════════");
      console.log("║ AFTER:");
      console.log("╟──────────────────────────────────────────────────────────────");
      filteredMessage.split("\n").forEach(line => console.log(`║ ${line}`));
      console.log("╚══════════════════════════════════════════════════════════════\n");
    } else {
      console.log("[PrivacyFilter] No changes needed - message passed through");
    }

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

