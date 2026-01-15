// Core types for the multi-agent collaboration system

// Assistant status for turn indicator - broadcast to all users
export type AssistantStatusType =
  | "thinking"
  | "searching_calendar"
  | "searching_gmail"
  | "searching_web"
  | "searching_maps"
  | "writing_response";

export interface AssistantStatus {
  type: AssistantStatusType;
  assistantId: string;       // e.g., "userId-assistant"
  assistantName: string;     // e.g., "Kartik's Assistant"
  detail?: string;           // e.g., "Checking January availability..."
  timestamp: number;         // For debouncing/staleness checks
}

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
  target: string; // Dynamic participant name or "All"
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

// Decision tracking - prevents implicit assumptions
export interface PendingDecision {
  topic: string;                    // e.g., "Resort choice", "Travel dates"
  status: "proposed" | "awaiting_confirmation" | "confirmed";
  options?: string[];               // The proposed options (if any)
  confirmedValue?: string;          // What was confirmed
  confirmationsNeeded?: string[];   // Participant IDs who need to confirm (for multi-user)
  confirmationsReceived?: string[]; // Participant IDs who have confirmed
}

// CHANGED: Added structured canonical state for right panel
export interface CanonicalState {
  goal: string;
  leadingOption: string;
  statusSummary: string[];
  constraints: ParticipantConstraint[];
  openQuestions: OpenQuestion[];
  pendingDecisions: PendingDecision[];
  suggestedNextSteps: string[];
  stage: "negotiating" | "searching" | "waiting_for_user" | "converged";
  lastUpdatedAt: string;
  lastUpdatedBy: string;
}

// CHANGED: Added TurnMeta for structured assistant output
export type NextAction = "CONTINUE" | "WAIT_FOR_USER" | "HANDOFF_DONE";

export interface TurnMeta {
  next_action: NextAction;
  questions_for_user: Array<{ target: string; question: string }>; // Dynamic participant names
  state_patch: Partial<StatePatch>;
  confidence: number;
  reason_brief: string;
  next_speaker?: string; // Dynamic assistant ID
}

// CHANGED: State patch structure for incremental updates
export interface StatePatch {
  leading_option?: string;
  status_summary?: string[];
  add_constraints?: Array<{ participantId: string; constraint: string }>;
  add_questions?: Array<{ target: string; question: string }>; // Dynamic participant names
  resolve_questions?: string[]; // question IDs to mark resolved
  pending_decisions?: PendingDecision[]; // Replace entire pending decisions list
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
