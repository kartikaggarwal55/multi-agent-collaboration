// Step Completion Detector - Uses Haiku to detect truly completed steps
// Distinguishes between: completed, rephrased, or removed steps

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const DETECTOR_MODEL = "claude-haiku-4-5";

interface StepCompletionResult {
  completedSteps: string[]; // Steps that were actually completed
  reasoning?: string; // For debugging
}

/**
 * Detect which steps were truly completed vs rephrased/refined
 *
 * @param previousSteps - Steps from before the update
 * @param currentSteps - Steps after the update
 * @param recentMessage - The most recent assistant message (provides context)
 * @returns Steps that were genuinely completed
 */
export async function detectCompletedSteps(
  previousSteps: string[],
  currentSteps: string[],
  recentMessage: string
): Promise<StepCompletionResult> {
  // Quick exit: if no previous steps, nothing to complete
  if (!previousSteps || previousSteps.length === 0) {
    return { completedSteps: [] };
  }

  // Quick exit: if steps are identical, nothing changed
  if (JSON.stringify(previousSteps) === JSON.stringify(currentSteps)) {
    return { completedSteps: [] };
  }

  // Find steps that disappeared (not in current list)
  const disappeared = previousSteps.filter(
    prev => !currentSteps.some(curr => curr.toLowerCase() === prev.toLowerCase())
  );

  // Quick exit: if nothing disappeared, nothing completed
  if (disappeared.length === 0) {
    return { completedSteps: [] };
  }

  // Use LLM to determine which disappeared steps were truly completed
  const prompt = `Analyze which steps were COMPLETED vs REPHRASED/REFINED.

## Previous Steps
${previousSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Current Steps
${currentSteps.length > 0 ? currentSteps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "(none)"}

## Recent Conversation Context
${recentMessage.slice(0, 1000)}

## Steps That Disappeared
${disappeared.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Task
For each disappeared step, determine if it was:
- **COMPLETED**: The task was done (e.g., "Book flights" disappeared after "I've booked the flights")
- **REPHRASED**: The step was refined/reworded in the current list (e.g., "Book flights" → "Book flights for June 15")
- **REMOVED**: The step is no longer relevant (e.g., plans changed)

Return ONLY steps that were genuinely COMPLETED as a JSON array of strings.

## Response Format
Return valid JSON only, no explanation:
{"completed": ["step text 1", "step text 2"]}

If no steps were completed, return: {"completed": []}`;

  try {
    const response = await anthropic.messages.create({
      model: DETECTOR_MODEL,
      max_tokens: 512,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";

    // Parse JSON response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const completed = Array.isArray(parsed.completed) ? parsed.completed : [];

      if (completed.length > 0) {
        console.log(`[StepDetector] Completed: ${completed.join(", ")}`);
      }

      return { completedSteps: completed };
    }

    return { completedSteps: [] };
  } catch (error) {
    console.error("[StepDetector] Error detecting completed steps:", error);
    return { completedSteps: [] };
  }
}
