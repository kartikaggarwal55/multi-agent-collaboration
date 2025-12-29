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

export interface RoomState {
  id: string;
  goal?: string;
  participants: Participant[];
  messages: Message[];
  summary: string;
}

// Preferences for each human participant
export interface HumanPreferences {
  humanId: string;
  preferences: string;
}
