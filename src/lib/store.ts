// In-memory store for the demo room

import {
  Participant,
  Message,
  RoomState,
  CanonicalState,
  StatePatch,
  OpenQuestion,
  ParticipantConstraint,
} from "./types";

// Seeded participants
const PARTICIPANTS: Participant[] = [
  { id: "alice", kind: "human", displayName: "Alice" },
  { id: "bob", kind: "human", displayName: "Bob" },
  {
    id: "alice-assistant",
    kind: "assistant",
    displayName: "Alice's Assistant",
    ownerHumanId: "alice",
  },
  {
    id: "bob-assistant",
    kind: "assistant",
    displayName: "Bob's Assistant",
    ownerHumanId: "bob",
  },
];

// Seeded preferences for each human - rich profiles for demo
export const HUMAN_PREFERENCES: Record<string, string> = {
  alice: `Alice's Profile (treat as priors that can be overridden by explicit statements in conversation):

**Personal Info:**
- Lives in Brooklyn, NY (Park Slope area)
- Works as a UX Designer at a tech startup, typically 9am-6pm
- Has a 7-year-old daughter, Emma, who stays with her ex on weekends
- Partner: Dating Marcus (together 8 months), who lives in Manhattan

**Schedule & Availability:**
- Weekday evenings free after 7pm (after Emma's bedtime on her custody days)
- Weekends much more flexible when Emma is with her dad
- Prefers meetings/events to end by 10pm on work nights
- Tuesday evenings reserved for yoga class (7-8:30pm)
- Thursday mornings she does school drop-off, so can't meet before 9:30am

**Food & Dining:**
- Strict vegetarian for 12 years (no meat, no fish)
- Mild dairy intolerance - can have small amounts but prefers dairy-free
- Loves Thai, Indian, and Mediterranean cuisines
- Avoids overly loud restaurants (hard to have conversations)
- Prefers restaurants with good veggie options, not just "one sad salad"
- Budget: Usually $30-50/person for nice dinners, can stretch for special occasions

**Activities & Interests:**
- Avid hiker - loves trails in the Hudson Valley
- Enjoys museums, especially modern art
- Practices yoga 2-3x per week
- Book club meets first Monday of each month
- Not a fan of loud bars or nightclubs
- Enjoys wine but rarely drinks more than 2 glasses

**Travel & Transportation:**
- Doesn't own a car, relies on subway and occasional Uber
- Gets motion sick on long car rides (prefers train for longer trips)
- Has never been to Europe, dreams of visiting Italy
- Prefers nature/hiking vacations over beach resorts

**Social Style:**
- Introvert who enjoys small group gatherings (4-6 people ideal)
- Needs quiet time to recharge after big social events
- Values deep conversations over small talk
- Punctual - dislikes when people are significantly late`,

  bob: `Bob's Profile (treat as priors that can be overridden by explicit statements in conversation):

**Personal Info:**
- Lives in Jersey City, NJ (near the Grove Street PATH)
- Works as a Sales Director, often has client dinners and flexible hours
- Divorced, no kids - more schedule flexibility
- Has a golden retriever named Charlie who needs walking

**Schedule & Availability:**
- Very flexible schedule but often has last-minute client meetings
- Prefers not to plan too far in advance (1-2 days ideal)
- Can do late nights without issue
- Works out at 6am, so mornings before 9am are tough for social plans
- Often travels for work (2-3 days per month)

**Food & Dining:**
- Loves trying new restaurants, especially trendy spots
- Meat lover - enjoys steakhouses and BBQ
- Recently trying to eat healthier, but no strict diet
- Adventurous eater - will try anything once
- Has a shellfish allergy (serious - needs to avoid cross-contamination)
- Budget: Happy to spend $60-100/person for good dining experiences
- Enjoys craft beer and whiskey

**Activities & Interests:**
- Big sports fan - watches football and basketball regularly
- Golfs on weekends when weather permits
- Enjoys live music and concerts
- Likes hiking but prefers easier trails (not super athletic hikes)
- Recently got into cooking (watching a lot of YouTube cooking videos)
- Enjoys poker nights with his friends (monthly)

**Travel & Transportation:**
- Has a car, happy to drive
- Loves road trips and spontaneous weekend getaways
- Prefers beach vacations, has been to Caribbean multiple times
- Goes to Vegas once a year with college friends

**Social Style:**
- Extrovert who energizes from social gatherings
- Enjoys larger group events and parties
- Tends to be 10-15 minutes late to everything (working on it)
- Great with small talk, can chat with anyone
- Sometimes talks over people when excited (aware and trying to improve)

**Logistics with Alice:**
- Would need to figure out meeting spots between Brooklyn and Jersey City
- PATH + subway connection works, or can drive to Brooklyn
- Both enjoy hiking - good shared activity to explore`,
};

// Single demo room
const DEMO_ROOM_ID = "demo";

// CHANGED: Initial canonical state factory
function createInitialCanonicalState(): CanonicalState {
  return {
    goal: "",
    leadingOption: "",
    statusSummary: [],
    constraints: [],
    openQuestions: [],
    pendingDecisions: [],
    suggestedNextSteps: [],
    stage: "negotiating",
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: "system",
  };
}

// In-memory state (will reset on server restart)
let roomState: RoomState = {
  id: DEMO_ROOM_ID,
  goal: undefined,
  participants: [...PARTICIPANTS],
  messages: [],
  summary: "No conversation yet. Set a goal and start chatting to see the assistants collaborate!",
  canonicalState: createInitialCanonicalState(), // CHANGED: Added canonical state
};

// CHANGED: Track active run for cancellation
let activeRunId: string | null = null;

// Store operations
export function getRoom(): RoomState {
  return {
    ...roomState,
    canonicalState: { ...roomState.canonicalState }, // CHANGED: Deep copy canonical state
  };
}

export function setGoal(goal: string): void {
  roomState.goal = goal;
  // CHANGED: Also update canonical state goal
  roomState.canonicalState.goal = goal;
  roomState.canonicalState.lastUpdatedAt = new Date().toISOString();
  roomState.canonicalState.lastUpdatedBy = "user";
}

export function addMessage(message: Omit<Message, "id" | "createdAt" | "roomId">): Message {
  const newMessage: Message = {
    ...message,
    id: crypto.randomUUID(),
    roomId: DEMO_ROOM_ID,
    createdAt: new Date().toISOString(),
  };
  roomState.messages.push(newMessage);
  return newMessage;
}

export function updateSummary(summary: string): void {
  roomState.summary = summary;
}

// CHANGED: Apply a state patch to canonical state with deduplication
export function applyStatePatch(patch: Partial<StatePatch>, updatedBy: string): void {
  const state = roomState.canonicalState;
  const now = new Date().toISOString();

  if (patch.leading_option !== undefined) {
    state.leadingOption = patch.leading_option;
  }

  if (patch.status_summary !== undefined) {
    state.statusSummary = patch.status_summary;
  }

  if (patch.suggested_next_steps !== undefined) {
    state.suggestedNextSteps = patch.suggested_next_steps;
  }

  if (patch.stage !== undefined) {
    state.stage = patch.stage;
  }

  // CHANGED: Add constraints with deduplication
  if (patch.add_constraints) {
    for (const c of patch.add_constraints) {
      const exists = state.constraints.some(
        (existing) =>
          existing.participantId === c.participantId &&
          existing.constraint.toLowerCase() === c.constraint.toLowerCase()
      );
      if (!exists) {
        state.constraints.push({
          participantId: c.participantId,
          constraint: c.constraint,
          source: "session_statement",
          addedAt: now,
        });
      }
    }
  }

  // CHANGED: Add questions with deduplication
  if (patch.add_questions) {
    for (const q of patch.add_questions) {
      const exists = state.openQuestions.some(
        (existing) =>
          !existing.resolved &&
          existing.target === q.target &&
          existing.question.toLowerCase().includes(q.question.toLowerCase().slice(0, 30))
      );
      if (!exists) {
        state.openQuestions.push({
          id: crypto.randomUUID(),
          target: q.target,
          question: q.question,
          askedBy: updatedBy,
          askedAt: now,
          resolved: false,
        });
      }
    }
  }

  // CHANGED: Resolve questions by ID
  if (patch.resolve_questions) {
    for (const qId of patch.resolve_questions) {
      const question = state.openQuestions.find((q) => q.id === qId);
      if (question) {
        question.resolved = true;
      }
    }
  }

  state.lastUpdatedAt = now;
  state.lastUpdatedBy = updatedBy;
}

// CHANGED: Compute state signature for stall detection
export function computeStateSignature(): string {
  const state = roomState.canonicalState;
  const signatureObj = {
    goal: state.goal,
    leadingOption: state.leadingOption,
    openQuestions: state.openQuestions
      .filter((q) => !q.resolved)
      .map((q) => q.question)
      .sort(),
    nextSteps: state.suggestedNextSteps.slice().sort(),
    stage: state.stage,
  };
  return JSON.stringify(signatureObj);
}

// CHANGED: Get unresolved questions
export function getUnresolvedQuestions(): OpenQuestion[] {
  return roomState.canonicalState.openQuestions.filter((q) => !q.resolved);
}

// CHANGED: Update stage based on stop reason
export function updateStage(stage: CanonicalState["stage"]): void {
  roomState.canonicalState.stage = stage;
  roomState.canonicalState.lastUpdatedAt = new Date().toISOString();
}

// CHANGED: Active run management for cancellation
export function setActiveRun(runId: string | null): void {
  activeRunId = runId;
}

export function getActiveRun(): string | null {
  return activeRunId;
}

export function shouldCancelRun(runId: string): boolean {
  return activeRunId !== runId;
}

// CHANGED: Add session constraint from user statement (overrides stored prefs)
export function addSessionConstraint(
  participantId: string,
  constraint: string
): void {
  const state = roomState.canonicalState;
  // Remove conflicting stored preference constraints for this participant
  state.constraints = state.constraints.filter(
    (c) =>
      !(c.participantId === participantId && c.source === "stored_preference")
  );
  // Add the new session constraint
  state.constraints.push({
    participantId,
    constraint,
    source: "session_statement",
    addedAt: new Date().toISOString(),
  });
}

// CHANGED: Get effective constraints for a participant (session overrides stored)
export function getEffectiveConstraints(participantId: string): ParticipantConstraint[] {
  const state = roomState.canonicalState;
  const sessionConstraints = state.constraints.filter(
    (c) => c.participantId === participantId && c.source === "session_statement"
  );
  // If there are session constraints, those take precedence
  if (sessionConstraints.length > 0) {
    return sessionConstraints;
  }
  return state.constraints.filter((c) => c.participantId === participantId);
}

export function getParticipant(id: string): Participant | undefined {
  return roomState.participants.find((p) => p.id === id);
}

export function getHumans(): Participant[] {
  return roomState.participants.filter((p) => p.kind === "human");
}

export function getAssistants(): Participant[] {
  return roomState.participants.filter((p) => p.kind === "assistant");
}

export function getAssistantForHuman(humanId: string): Participant | undefined {
  return roomState.participants.find(
    (p) => p.kind === "assistant" && p.ownerHumanId === humanId
  );
}

export function getPreferencesForHuman(humanId: string): string {
  return HUMAN_PREFERENCES[humanId] || "No specific preferences defined.";
}

// Reset room (useful for testing)
export function resetRoom(): void {
  roomState = {
    id: DEMO_ROOM_ID,
    goal: undefined,
    participants: [...PARTICIPANTS],
    messages: [],
    summary: "No conversation yet. Set a goal and start chatting to see the assistants collaborate!",
    canonicalState: createInitialCanonicalState(), // CHANGED: Reset canonical state
  };
  activeRunId = null; // CHANGED: Reset active run
}

// CHANGED: Generate summary from canonical state for legacy compatibility
export function generateSummaryFromCanonicalState(): string {
  const state = roomState.canonicalState;
  const parts: string[] = [];

  // Stage indicator
  if (state.stage === "waiting_for_user") {
    parts.push("**Status:** Waiting for user input\n");
  } else if (state.stage === "converged") {
    parts.push("**Status:** Ready for review\n");
  } else if (state.stage === "searching") {
    parts.push("**Status:** Searching for options...\n");
  } else {
    parts.push("**Status:** Assistants are coordinating\n");
  }

  // Leading option
  if (state.leadingOption) {
    parts.push(`### Leading Option\n${state.leadingOption}\n`);
  }

  // Status summary
  if (state.statusSummary.length > 0) {
    parts.push(`### Current Status\n${state.statusSummary.map((s) => `- ${s}`).join("\n")}\n`);
  }

  // Open questions (grouped by target)
  const unresolvedQuestions = state.openQuestions.filter((q) => !q.resolved);
  if (unresolvedQuestions.length > 0) {
    parts.push("### Waiting For Input");
    const byTarget: Record<string, OpenQuestion[]> = {};
    for (const q of unresolvedQuestions) {
      if (!byTarget[q.target]) byTarget[q.target] = [];
      byTarget[q.target].push(q);
    }
    for (const [target, questions] of Object.entries(byTarget)) {
      parts.push(`\n**${target}:**`);
      for (const q of questions) {
        parts.push(`- ${q.question}`);
      }
    }
    parts.push("");
  }

  // Constraints
  const sessionConstraints = state.constraints.filter((c) => c.source === "session_statement");
  if (sessionConstraints.length > 0) {
    parts.push("### Session Constraints");
    for (const c of sessionConstraints) {
      const participant = roomState.participants.find((p) => p.id === c.participantId);
      parts.push(`- **${participant?.displayName || c.participantId}:** ${c.constraint}`);
    }
    parts.push("");
  }

  // Next steps
  if (state.suggestedNextSteps.length > 0) {
    parts.push(`### Next Steps\n${state.suggestedNextSteps.map((s) => `- ${s}`).join("\n")}\n`);
  }

  return parts.join("\n") || "Waiting for conversation to begin...";
}
