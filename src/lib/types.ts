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

// Block-based message rendering types

/** A single data row within options/comparison/timeline blocks */
export interface DetailItem {
  title: string;
  subtitle?: string;
  fields: Record<string, string>;
  link?: string;
  tag?: string;
}

export interface TextBlock {
  type: "text";
  content: string;
  priority?: "high" | "normal";
}

export interface OptionsBlock {
  type: "options";
  label: string;
  columns: string[];
  items: DetailItem[];
  recommended?: number;
  layout?: "cards" | "list";
}

export interface ComparisonBlock {
  type: "comparison";
  label: string;
  columns: string[];
  items: DetailItem[];
  recommended?: number;
}

export interface TimelineBlock {
  type: "timeline";
  label: string;
  items: DetailItem[];
}

export interface AccordionBlock {
  type: "accordion";
  label: string;
  content: string;
  defaultOpen?: boolean;
}

export interface AlertBlock {
  type: "alert";
  style: "info" | "warning" | "success" | "error";
  content: string;
}

export type MessageBlock =
  | TextBlock
  | OptionsBlock
  | ComparisonBlock
  | TimelineBlock
  | AccordionBlock
  | AlertBlock;

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

// Structured question tracking
export interface OpenQuestion {
  id: string;
  target: string; // Dynamic participant name or "All"
  question: string;
  askedBy: string;
  askedAt: string;
  resolved: boolean;
}

// Constraint tracking per participant
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

// Structured canonical state for right panel
export interface CanonicalState {
  goal: string;
  leadingOption: string;
  statusSummary: string[];
  constraints: ParticipantConstraint[];
  openQuestions: OpenQuestion[];
  pendingDecisions: PendingDecision[];
  suggestedNextSteps: string[];
  completedNextSteps: string[]; // Steps that have been completed (detected by LLM)
  stage: "negotiating" | "searching" | "waiting_for_user" | "converged";
  lastUpdatedAt: string;
  lastUpdatedBy: string;
}

/** Create a fresh canonical state with default values */
export function createDefaultCanonicalState(): CanonicalState {
  return {
    goal: "",
    leadingOption: "",
    statusSummary: [],
    constraints: [],
    openQuestions: [],
    pendingDecisions: [],
    suggestedNextSteps: [],
    completedNextSteps: [],
    stage: "negotiating",
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: "system",
  };
}

// Structured assistant output metadata
export type NextAction = "CONTINUE" | "WAIT_FOR_USER" | "HANDOFF_DONE";

export interface TurnMeta {
  next_action: NextAction;
  questions_for_user: Array<{ target: string; question: string }>; // Dynamic participant names
  state_patch: Partial<StatePatch>;
  confidence: number;
  reason_brief: string;
  next_speaker?: string; // Dynamic assistant ID
}

// State patch structure for incremental updates
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

// Stop reason enum for orchestrator
export type StopReason =
  | "WAIT_FOR_USER"
  | "HANDOFF_DONE"
  | "CAP_REACHED"
  | "STALL_DETECTED"
  | "ERROR"
  | "CANCELLED";

// Run state for orchestrator
export interface OrchestratorRunState {
  runId: string;
  turnCount: number;
  lastSpeaker: string | null;
  stopReason: StopReason | null;
  stateSignatures: string[]; // For stall detection
  handoffDoneBy: Set<string>; // Track which assistants have signaled done
  cancelled: boolean;
}

