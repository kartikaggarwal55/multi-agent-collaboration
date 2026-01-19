// Privacy Filter - Lightweight LLM layer to filter sensitive information
// Uses a fast model (Haiku) to ensure only necessary information is disclosed
// Based on "minimum necessary disclosure" principle

import Anthropic from "@anthropic-ai/sdk";
import { CanonicalState } from "../types";

const anthropic = new Anthropic();
const FILTER_MODEL = "claude-3-5-haiku";

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

**ABSTRACT information when:**
- The specific detail isn't needed, but the implication is
- Example: "has a conflict" instead of the nature of the conflict
- Example: "found a reservation" instead of quoting full email content

**REMOVE information when:**
- It's unrelated to the current goal
- It reveals details about third parties not in the conversation
- It exposes private matters that aren't relevant to the decision at hand

## Category Guidelines

Apply the decision framework to these common categories:

**Time & Availability**: Share when someone is free/busy. Abstract the reason unless it's the topic being planned.

**Communications (email, messages)**: Share relevant confirmations, references, dates. Summarize rather than quote. Omit unrelated correspondence.

**Financial**: Share stated preferences and ranges. Share prices of discussed options. Abstract transaction details unless directly relevant.

**Locations**: Share what's needed for coordination. Abstract specific addresses unless pickup/meeting point is being planned.

**Personal details**: Share preferences that affect the current decision. Omit details about health, work, relationships unless the user raised them as relevant.

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

  // Check for indicators that private data sources were accessed
  // Focus on data access patterns, not specific content types
  const dataAccessIndicators = [
    "checked your",
    "found in your",
    "your calendar",
    "your email",
    "your schedule",
    "searched your",
    "looked at your",
    "based on your",
    "according to your",
  ];

  const lowerMessage = message.toLowerCase();
  return dataAccessIndicators.some(indicator => lowerMessage.includes(indicator));
}
