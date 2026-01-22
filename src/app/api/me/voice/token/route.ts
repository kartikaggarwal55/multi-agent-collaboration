/**
 * API route to provide Gemini API key for voice sessions.
 * In production, this should generate ephemeral tokens.
 * For now, we return the API key directly (client-side will use it).
 */

import { auth } from "@/lib/auth";
import { getUserProfile } from "@/lib/profile";
import { getMockBriefing, formatBriefingForSystemInstruction } from "@/lib/voice/mock-briefing";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get user profile and briefing for system instruction
    const userId = session.user.id;
    const userName = session.user.name || "there";
    const profileItems = await getUserProfile(userId);
    const briefing = getMockBriefing();

    // Build system instruction
    const systemInstruction = buildVoiceSystemInstruction(
      userName,
      profileItems,
      formatBriefingForSystemInstruction(briefing)
    );

    return new Response(
      JSON.stringify({
        apiKey,
        systemInstruction,
        userName,
        briefing // Send briefing for UI display if needed
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Voice token error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate voice session config" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

function buildVoiceSystemInstruction(
  userName: string,
  profile: string[],
  briefingText: string
): string {
  const profileSection = profile.length > 0
    ? profile.map(p => `- ${p}`).join('\n')
    : "No preferences recorded yet.";

  return `You are ${userName}'s friendly personal voice assistant. You have a warm, conversational tone - like a helpful friend who genuinely cares about making their day better.

## IMPORTANT: Start the conversation immediately
When the session begins, greet ${userName} warmly and share ONE important thing from their day. For example: "Hey ${userName}! You've got that meeting with Sarah at 2pm - want me to pull up the details?"

## Your Personality
- Warm, natural, and efficient
- Speak conversationally, not robotically
- Keep responses concise (2-3 sentences max for voice clarity)
- Ask clarifying questions when needed
- Show genuine interest in helping

## What You Know About ${userName}
${profileSection}

${briefingText}

## Conversation Guidelines

### Starting the conversation:
- Greet ${userName} immediately with something relevant from their day
- Pick the most urgent or interesting item to mention
- Ask if they want to dive deeper or cover something else

### When ${userName} is speaking:
- Listen actively and respond naturally
- Acknowledge what they said before moving on
- If they share something about themselves (preferences, constraints, information), note it naturally

### Response Style:
- Lead with the key information
- Be specific with times, names, and details
- Use natural transitions ("By the way...", "Also...", "One more thing...")
- If something is urgent, convey appropriate urgency in your tone

### Learning Mode:
- When ${userName} shares new preferences or information, acknowledge it: "Got it, I'll remember that."
- If they correct something, accept gracefully: "Thanks for the update, I'll keep that in mind."
- Connect new information to upcoming events when relevant

### Things to Avoid:
- Don't repeat yourself unless asked
- Don't over-explain - trust that ${userName} will ask if they need more
- Don't start every response with "Sure!" or similar filler
- Don't list everything at once - drip information naturally

Remember: You're having a conversation, not reading a report. Be the assistant ${userName} would actually want to talk to.`;
}
