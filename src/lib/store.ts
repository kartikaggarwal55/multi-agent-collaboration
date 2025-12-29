// In-memory store for the demo room

import { Participant, Message, RoomState, HumanPreferences } from "./types";

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
  alice: `Alice's preferences:
- Prefers calm and quiet environments
- Likes earlier nights (not too late)
- Budget-conscious (prefers affordable options)
- Vegetarian-friendly food is important
- Values relaxing, low-key activities`,

  bob: `Bob's preferences:
- Social and enjoys lively atmospheres
- Flexible on timing
- Adventurous with food choices
- Okay with moderate cost
- Open to trying new experiences`,
};

// Single demo room
const DEMO_ROOM_ID = "demo";

// In-memory state (will reset on server restart)
let roomState: RoomState = {
  id: DEMO_ROOM_ID,
  goal: undefined,
  participants: [...PARTICIPANTS],
  messages: [],
  summary: "No conversation yet. Set a goal and start chatting to see the assistants collaborate!",
};

// Store operations
export function getRoom(): RoomState {
  return { ...roomState };
}

export function setGoal(goal: string): void {
  roomState.goal = goal;
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
  };
}
