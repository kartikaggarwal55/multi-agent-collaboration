// Core types for the multi-agent collaboration system

export interface Participant {
  id: string;
  kind: "human" | "assistant";
  displayName: string;
  /** For assistants, the human they represent */
  ownerHumanId?: string;
}

export interface Citation {
  url: string;
  title?: string;
  citedText?: string;
}

export interface Message {
  id: string;
  roomId: string;
  createdAt: string; // ISO timestamp
  role: "user" | "assistant";
  authorId: string;
  authorName: string;
  content: string;
  citations?: Citation[];
}

// CHANGED: Added OpenQuestion type for structured question tracking
export interface OpenQuestion {
  id: string;
  target: "Alice" | "Bob" | "All";
  question: string;
  askedBy: string;
  askedAt: string;
  resolved: boolean;
}

// CHANGED: Added constraint tracking per participant
export interface ParticipantConstraint {
  participantId: string;
  constraint: string;
  source: "stored_preference" | "session_statement";
  addedAt: string;
}

// CHANGED: Added structured canonical state for right panel
export interface CanonicalState {
  goal: string;
  leadingOption: string;
  statusSummary: string[];
  constraints: ParticipantConstraint[];
  openQuestions: OpenQuestion[];
  suggestedNextSteps: string[];
  stage: "negotiating" | "searching" | "waiting_for_user" | "converged";
  lastUpdatedAt: string;
  lastUpdatedBy: string;
}

// CHANGED: Added TurnMeta for structured assistant output
export type NextAction = "CONTINUE" | "WAIT_FOR_USER" | "HANDOFF_DONE";

export interface TurnMeta {
  next_action: NextAction;
  questions_for_user: Array<{ target: "Alice" | "Bob" | "All"; question: string }>;
  state_patch: Partial<StatePatch>;
  confidence: number;
  reason_brief: string;
  next_speaker?: "alice-assistant" | "bob-assistant";
}

// CHANGED: State patch structure for incremental updates
export interface StatePatch {
  leading_option?: string;
  status_summary?: string[];
  add_constraints?: Array<{ participantId: string; constraint: string }>;
  add_questions?: Array<{ target: "Alice" | "Bob" | "All"; question: string }>;
  resolve_questions?: string[]; // question IDs to mark resolved
  suggested_next_steps?: string[];
  stage?: CanonicalState["stage"];
}

// CHANGED: Updated RoomState with canonical structured state
export interface RoomState {
  id: string;
  goal?: string;
  participants: Participant[];
  messages: Message[];
  summary: string; // Legacy field for backwards compat
  canonicalState: CanonicalState; // CHANGED: New structured state
}

// CHANGED: Added stop reason enum for orchestrator
export type StopReason =
  | "WAIT_FOR_USER"
  | "HANDOFF_DONE"
  | "CAP_REACHED"
  | "STALL_DETECTED"
  | "ERROR"
  | "CANCELLED";

// CHANGED: Added run state for orchestrator
export interface OrchestratorRunState {
  runId: string;
  turnCount: number;
  lastSpeaker: string | null;
  stopReason: StopReason | null;
  stateSignatures: string[]; // For stall detection
  handoffDoneBy: Set<string>; // Track which assistants have signaled done
  cancelled: boolean;
}

// Preferences for each human participant
export interface HumanPreferences {
  humanId: string;
  preferences: string;
}
