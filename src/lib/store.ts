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

// Seeded preferences for each human
export const HUMAN_PREFERENCES: Record<string, string> = {
  alice: `Alice's baseline preferences (treat as priors, not hard constraints):
- Generally prefers calm and quiet environments
- Usually likes earlier nights (not too late)
- Tends to be budget-conscious
- Vegetarian-friendly food is typically important
- Often values relaxing, low-key activities`,

  bob: `Bob's baseline preferences (treat as priors, not hard constraints):
- Generally social and enjoys lively atmospheres
- Usually flexible on timing
- Often adventurous with food choices
- Typically okay with moderate cost
- Tends to be open to trying new experiences`,
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
