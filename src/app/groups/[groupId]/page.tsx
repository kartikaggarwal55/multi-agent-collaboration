"use client";

import { useState, useEffect, useRef, use } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CanonicalState } from "@/lib/types";
import { ChatNav } from "@/components/chat-nav";
import { ThemeToggle } from "@/components/theme-toggle";

const LogOutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// Icons
const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6V12L16 14" />
  </svg>
);

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const UserIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const BotIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <circle cx="8" cy="16" r="1" fill="currentColor" />
    <circle cx="16" cy="16" r="1" fill="currentColor" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const LinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

interface Participant {
  id: string;
  kind: "human" | "assistant";
  displayName: string;
  image?: string;
  ownerHumanId?: string;
  hasCalendar?: boolean;
}

// Parse and style @mentions in message content
function renderMentions(
  content: string,
  currentUserName: string | null | undefined,
  participants: Participant[]
): React.ReactNode[] {
  // Build list of all participant names including first names (sorted by length descending for longest-match-first)
  // This allows matching @FirstName when the system knows the full name
  const participantNames: { name: string; displayName: string }[] = [];
  for (const p of participants) {
    // Add full display name
    participantNames.push({ name: p.displayName, displayName: p.displayName });
    // Add first name if it's different from display name (for human participants)
    const firstName = p.displayName.split(' ')[0];
    if (firstName && firstName !== p.displayName && !p.displayName.includes("'")) {
      participantNames.push({ name: firstName, displayName: p.displayName });
    }
  }
  // Sort by name length descending for longest-match-first
  participantNames.sort((a, b) => b.name.length - a.name.length);

  const userFirstName = currentUserName?.split(' ')[0] || '';
  const userFullName = currentUserName || '';

  const parts: React.ReactNode[] = [];
  let remaining = content;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Find the next @ symbol
    const atIndex = remaining.indexOf('@');

    if (atIndex === -1) {
      // No more @, add remaining text
      parts.push(remaining);
      break;
    }

    // Add text before the @
    if (atIndex > 0) {
      parts.push(remaining.slice(0, atIndex));
    }

    // Check if text after @ matches any participant name (case-insensitive)
    const afterAt = remaining.slice(atIndex + 1);
    let matched = false;

    for (const participant of participantNames) {
      // Check if afterAt starts with this name (case-insensitive)
      if (afterAt.toLowerCase().startsWith(participant.name.toLowerCase())) {
        // Make sure it's a word boundary (not followed by alphanumeric)
        const nextChar = afterAt[participant.name.length];
        if (!nextChar || !/\w/.test(nextChar)) {
          const mentionText = '@' + afterAt.slice(0, participant.name.length);

          // Check if this is the current user (not their assistant)
          // Use displayName to check against current user's full name
          const isCurrentUser = (
            participant.displayName.toLowerCase() === userFullName.toLowerCase() ||
            participant.displayName.toLowerCase() === userFirstName.toLowerCase()
          ) && !participant.displayName.toLowerCase().includes("'");

          parts.push(
            <span
              key={keyIndex++}
              className={`font-semibold px-1 py-0.5 rounded ${
                isCurrentUser
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-foreground/10 text-foreground/80'
              }`}
            >
              {mentionText}
            </span>
          );

          remaining = afterAt.slice(participant.name.length);
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // No participant match, just add the @ and continue
      parts.push('@');
      remaining = afterAt;
    }
  }

  return parts.length > 0 ? parts : [content];
}

// Helper to handle ReactMarkdown children (can be string, element, or array)
function renderMentionsInChildren(
  children: React.ReactNode,
  currentUserName: string | null | undefined,
  participants: Participant[]
): React.ReactNode {
  if (typeof children === 'string') {
    return renderMentions(children, currentUserName, participants);
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string') {
        return <span key={i}>{renderMentions(child, currentUserName, participants)}</span>;
      }
      return child;
    });
  }

  return children;
}

interface Message {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  role: "user" | "assistant";
  content: string;
  citations?: { url: string; title?: string }[];
  createdAt: string;
}

interface GroupData {
  id: string;
  title: string | null;
  participants: Participant[];
  messages: Message[];
  canonicalState: CanonicalState | null;
  createdBy?: { id: string; name: string | null };
}

// Generate consistent colors for participants - Orange, black, white scheme
const PARTICIPANT_COLORS = [
  { bg: "bg-[oklch(0.65_0.15_55)]", text: "text-white", border: "border-[oklch(0.65_0.15_55)]" }, // Orange
  { bg: "bg-[oklch(0.60_0.14_50)]", text: "text-white", border: "border-[oklch(0.60_0.14_50)]" }, // Darker orange
  { bg: "bg-[oklch(0.70_0.16_60)]", text: "text-white", border: "border-[oklch(0.70_0.16_60)]" }, // Lighter orange
  { bg: "bg-[oklch(0.55_0.13_45)]", text: "text-white", border: "border-[oklch(0.55_0.13_45)]" }, // Deep orange
  { bg: "bg-[oklch(0.68_0.15_58)]", text: "text-white", border: "border-[oklch(0.68_0.15_58)]" }, // Warm orange
];

const ASSISTANT_COLORS = [
  { bg: "bg-[oklch(0.25_0.02_55)]", text: "text-[oklch(0.70_0.12_55)]", border: "border-[oklch(0.35_0.03_55)]" },
  { bg: "bg-[oklch(0.25_0.02_50)]", text: "text-[oklch(0.70_0.12_50)]", border: "border-[oklch(0.35_0.03_50)]" },
  { bg: "bg-[oklch(0.25_0.02_60)]", text: "text-[oklch(0.70_0.12_60)]", border: "border-[oklch(0.35_0.03_60)]" },
  { bg: "bg-[oklch(0.25_0.02_45)]", text: "text-[oklch(0.70_0.12_45)]", border: "border-[oklch(0.35_0.03_45)]" },
  { bg: "bg-[oklch(0.25_0.02_58)]", text: "text-[oklch(0.70_0.12_58)]", border: "border-[oklch(0.35_0.03_58)]" },
];

export default function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [currentlyTyping, setCurrentlyTyping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const isInitialLoad = useRef(true);
  const [participantColorMap, setParticipantColorMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/join/${groupId}`);
    } else if (status === "authenticated") {
      fetchGroup();
    }
  }, [status, groupId, router]);

  // Smart scroll: only auto-scroll if user is near bottom or on initial load
  useEffect(() => {
    if (isInitialLoad.current || shouldAutoScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: isInitialLoad.current ? "instant" : "smooth" });
      if (group?.messages && group.messages.length > 0) {
        isInitialLoad.current = false;
      }
    }
  }, [group?.messages]);

  // Track scroll position to determine if user is near bottom
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    // Consider "near bottom" if within 150px
    shouldAutoScroll.current = distanceFromBottom < 150;
  };

  // Poll for new messages when tab is visible and not actively loading
  useEffect(() => {
    if (status !== "authenticated" || isLoading || isFetching) return;

    const pollInterval = 5000; // 5 seconds
    let timeoutId: NodeJS.Timeout;

    const pollForMessages = async () => {
      // Only poll if document is visible
      if (document.hidden) {
        timeoutId = setTimeout(pollForMessages, pollInterval);
        return;
      }

      try {
        const response = await fetch(`/api/groups/${groupId}`);
        if (response.ok) {
          const data = await response.json();
          const newMessages = data.group?.messages || [];
          const newParticipants = data.group?.participants || [];

          // Update if messages, participants, or canonical state changed
          setGroup((prev) => {
            if (!prev) return prev;
            const prevMessages = prev.messages || [];
            const prevParticipants = prev.participants || [];

            // Check message count
            if (prevMessages.length !== newMessages.length) {
              return { ...prev, ...data.group };
            }
            // Check last message ID
            if (prevMessages.length > 0 && newMessages.length > 0 &&
                prevMessages[prevMessages.length - 1].id !== newMessages[newMessages.length - 1].id) {
              return { ...prev, ...data.group };
            }
            // Check participant count (new member joined/left)
            if (prevParticipants.length !== newParticipants.length) {
              return { ...prev, ...data.group };
            }
            // Check if any participant's capabilities changed (calendar/gmail connected)
            const prevCaps = prevParticipants.map((p: { id: string; hasCalendar?: boolean; hasGmail?: boolean }) =>
              `${p.id}:${p.hasCalendar}:${p.hasGmail}`).join(',');
            const newCaps = newParticipants.map((p: { id: string; hasCalendar?: boolean; hasGmail?: boolean }) =>
              `${p.id}:${p.hasCalendar}:${p.hasGmail}`).join(',');
            if (prevCaps !== newCaps) {
              return { ...prev, ...data.group };
            }
            return prev;
          });
        }
      } catch (err) {
        console.error("Polling error:", err);
      }

      timeoutId = setTimeout(pollForMessages, pollInterval);
    };

    timeoutId = setTimeout(pollForMessages, pollInterval);

    return () => clearTimeout(timeoutId);
  }, [status, isLoading, isFetching, groupId]);

  // Assign colors to participants
  useEffect(() => {
    if (group?.participants) {
      const humans = group.participants.filter((p) => p.kind === "human");
      const colorMap = new Map<string, number>();
      humans.forEach((h, i) => {
        colorMap.set(h.id, i % PARTICIPANT_COLORS.length);
      });
      setParticipantColorMap(colorMap);
    }
  }, [group?.participants]);

  const fetchGroup = async () => {
    try {
      const response = await fetch(`/api/groups/${groupId}`);
      if (!response.ok) {
        const data = await response.json();
        if (data.needsJoin) {
          router.push(`/join/${groupId}`);
          return;
        }
        throw new Error(data.error || "Failed to fetch group");
      }

      const data = await response.json();
      setGroup(data.group);
    } catch (err) {
      console.error("Error fetching group:", err);
      setError("Failed to load group");
    } finally {
      setIsFetching(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || isLoading) return;

    // Always scroll to bottom when user sends a message
    shouldAutoScroll.current = true;

    setIsLoading(true);
    setError(null);
    setMessage("");

    const assistants = group?.participants.filter((p) => p.kind === "assistant") || [];
    if (assistants.length > 0) {
      setCurrentlyTyping(assistants[0].displayName);
    }

    try {
      const response = await fetch(`/api/groups/${groupId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message,
        }),
      });

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (eventType === "message") {
                  setGroup((prev) => {
                    if (!prev) return prev;
                    const exists = prev.messages.some((m) => m.id === data.id);
                    if (exists) return prev;
                    // Sort by createdAt to handle out-of-order SSE arrivals
                    // Use id as tiebreaker for same-millisecond messages
                    const newMessages = [...prev.messages, data].sort((a, b) => {
                      const timeA = new Date(a.createdAt).getTime() || 0;
                      const timeB = new Date(b.createdAt).getTime() || 0;
                      if (timeA !== timeB) return timeA - timeB;
                      return a.id.localeCompare(b.id); // Stable tiebreaker
                    });
                    return { ...prev, messages: newMessages };
                  });

                  // Update typing indicator
                  if (data.role === "assistant") {
                    const currentIndex = assistants.findIndex(
                      (a) => a.id === data.authorId
                    );
                    const nextAssistant = assistants[(currentIndex + 1) % assistants.length];
                    if (nextAssistant) {
                      setCurrentlyTyping(nextAssistant.displayName);
                    }
                  }
                } else if (eventType === "state") {
                  setGroup((prev) =>
                    prev ? { ...prev, canonicalState: data } : prev
                  );
                } else if (eventType === "status") {
                  setCurrentlyTyping(data.status);
                } else if (eventType === "error") {
                  setError(data.error);
                } else if (eventType === "done") {
                  if (data.canonicalState) {
                    setGroup((prev) =>
                      prev ? { ...prev, canonicalState: data.canonicalState } : prev
                    );
                  }
                  setCurrentlyTyping(null);
                }
              } catch (e) {
                console.error("Failed to parse SSE data:", e);
              }
            }
          }
        }
      } else {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to send message");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      console.error(err);
    } finally {
      setIsLoading(false);
      setCurrentlyTyping(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/join/${groupId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteGroup = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete group");
      }

      router.push("/groups");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete group");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const isCreator = session?.user?.id && group?.createdBy?.id === session.user.id;

  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getParticipantColor = (authorId: string, role: string) => {
    // For assistants, get the owner's color
    const ownerId = authorId.replace("-assistant", "");
    const colorIndex = participantColorMap.get(ownerId) || 0;

    if (role === "assistant" || authorId.includes("-assistant")) {
      return ASSISTANT_COLORS[colorIndex % ASSISTANT_COLORS.length];
    }
    return PARTICIPANT_COLORS[colorIndex % PARTICIPANT_COLORS.length];
  };

  const formatTime = (isoString: string): string => {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (status === "loading" || isFetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !group) return null;

  const isMyMessage = (authorId: string) => authorId === session.user?.id;

  return (
    <div className="flex h-screen w-full bg-background relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 mesh-gradient pointer-events-none" />
      <div className="absolute inset-0 noise-overlay pointer-events-none" />

      {/* Main chat area */}
      <div className="flex flex-1 flex-col relative overflow-hidden">
        {/* Header */}
        <header className="px-6 py-4 border-b border-border/50 bg-background/80 backdrop-blur-xl relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                <SparklesIcon />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">
                  {group.title || "Collaboration Room"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {group.participants.filter((p) => p.kind === "human").length} participants
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ChatNav />
              <Button
                variant="secondary"
                size="sm"
                onClick={copyInviteLink}
                className="gap-2"
              >
                <LinkIcon />
                {copied ? "Copied!" : "Invite"}
              </Button>
              <ThemeToggle />
              {isCreator && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                  title="Delete group"
                >
                  <TrashIcon />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
                title="Sign out"
              >
                <LogOutIcon />
              </Button>
            </div>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0" viewportRef={scrollContainerRef} onScroll={handleScroll}>
          <div className="px-6 py-4 space-y-4">
            {group.messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="relative">
                  <div className="absolute inset-0 empty-state-glow scale-150" />
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6 border border-primary/20 shadow-lg">
                    <SparklesIcon />
                  </div>
                </div>
                <h3 className="text-foreground font-semibold text-lg mb-2">Ready to collaborate</h3>
                <p className="text-muted-foreground text-[15px] max-w-xs leading-relaxed">
                  Send your first message to begin planning together
                </p>
              </div>
            )}

            {group.messages.map((msg, index) => {
              const isUser = msg.role === "user";
              const isMe = isMyMessage(msg.authorId.replace("-assistant", ""));
              // Only right-align if it's the current user's own message (not assistant)
              const alignRight = isUser && isMe;
              const colors = getParticipantColor(msg.authorId, msg.role);
              const participant = group.participants.find((p) => p.id === msg.authorId);

              return (
                <div
                  key={msg.id}
                  className={`animate-message-enter flex ${alignRight ? "justify-end" : "justify-start"}`}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className={`flex gap-3 max-w-[85%] ${alignRight ? "flex-row-reverse" : ""}`}>
                    <Avatar className={`h-8 w-8 shrink-0 border-2 ${colors.border}`}>
                      {participant?.image ? (
                        <AvatarImage src={participant.image} />
                      ) : null}
                      <AvatarFallback className={`text-xs font-semibold ${colors.bg} ${colors.text}`}>
                        {getInitials(msg.authorName)}
                      </AvatarFallback>
                    </Avatar>

                    <div className={`flex flex-col ${alignRight ? "items-end" : "items-start"}`}>
                      <div className={`flex items-center gap-2 mb-1.5 ${alignRight ? "flex-row-reverse" : ""}`}>
                        <span className="text-xs font-medium text-foreground/90">{msg.authorName}</span>
                        {msg.role === "assistant" && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground border border-border/50">
                            AI
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/70">
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>

                      <div
                        className={`rounded-xl px-4 py-3 ${
                          alignRight
                            ? `${colors.bg} ${colors.text} shadow-sm border ${colors.border}`
                            : msg.role === "assistant"
                              ? "bg-card/90 border border-border/50 shadow-sm backdrop-blur-sm message-ai"
                              : "bg-card/80 border border-border/50 shadow-sm backdrop-blur-sm"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <div className="prose prose-sm prose-invert max-w-none prose-chat">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({ children }) => (
                                  <p className="text-[15px] mb-2.5 last:mb-0 leading-[1.65] text-foreground/90">
                                    {renderMentionsInChildren(children, session.user?.name, group.participants)}
                                  </p>
                                ),
                                ul: ({ children }) => (
                                  <ul className="text-[15px] list-none pl-0 mb-2.5 space-y-2">{children}</ul>
                                ),
                                li: ({ children }) => (
                                  <li className="text-[15px] leading-[1.65] flex items-start gap-2.5 text-foreground/90">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-[9px] shrink-0" />
                                    <span>{renderMentionsInChildren(children, session.user?.name, group.participants)}</span>
                                  </li>
                                ),
                                a: ({ href, children }) => (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors font-medium"
                                  >
                                    {children}
                                  </a>
                                ),
                                table: ({ children }) => (
                                  <div className="overflow-x-auto my-3">
                                    <table className="min-w-full text-sm border-collapse">{children}</table>
                                  </div>
                                ),
                                thead: ({ children }) => (
                                  <thead className="bg-muted/50">{children}</thead>
                                ),
                                th: ({ children }) => (
                                  <th className="px-3 py-2 text-left font-semibold text-foreground/90 border-b border-border">{children}</th>
                                ),
                                td: ({ children }) => (
                                  <td className="px-3 py-2 text-foreground/80 border-b border-border/50">{children}</td>
                                ),
                                tr: ({ children }) => (
                                  <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
                                ),
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-[15px] whitespace-pre-wrap leading-[1.65] text-foreground/95">
                            {renderMentions(msg.content, session.user?.name, group.participants)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {isLoading && currentlyTyping && (
              <div className="flex items-center gap-3 animate-message-enter">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                  <BotIcon />
                </div>
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border/50">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs text-muted-foreground ml-1">{currentlyTyping}</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Error */}
        {error && (
          <div className="px-6 py-2">
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              {error}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-6 py-4 border-t border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative input-glow rounded-lg">
              <Input
                placeholder="Type your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="h-10 bg-card/50 border-border/50 rounded-lg text-sm"
              />
            </div>
            <Button
              onClick={sendMessage}
              disabled={isLoading || !message.trim()}
              className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90"
            >
              <SendIcon />
            </Button>
          </div>
        </div>
      </div>

      {/* Right panel - State */}
      <div className="w-[340px] shrink-0 border-l border-border/30 glass-panel relative overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="px-5 py-4 border-b border-border/30">
            <h2 className="text-sm font-semibold tracking-tight">Session State</h2>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-4">
              <StatePanel
                canonicalState={group.canonicalState}
                participants={group.participants}
                getParticipantColor={getParticipantColor}
                getInitials={getInitials}
              />
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 w-full max-w-sm border border-border shadow-xl">
            <h2 className="text-lg font-semibold mb-2">Delete Group</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete this group? This action cannot be undone and all messages will be lost.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                onClick={deleteGroup}
                disabled={isDeleting}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {isDeleting ? "Deleting..." : "Delete Group"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatePanel({
  canonicalState,
  participants,
  getParticipantColor,
  getInitials,
}: {
  canonicalState: CanonicalState | null;
  participants: Participant[];
  getParticipantColor: (id: string, role: string) => { bg: string; text: string; border: string };
  getInitials: (name: string) => string;
}) {
  const [constraintsExpanded, setConstraintsExpanded] = useState(false);

  if (!canonicalState) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-8 h-[2px] bg-primary/40 mb-4" />
        <p className="text-[13px] text-foreground/40 tracking-wide">Awaiting conversation</p>
      </div>
    );
  }

  const sessionConstraints = canonicalState.constraints?.filter((c) => c.source === "session_statement") || [];

  // Section header component for consistency
  const SectionHeader = ({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) => (
    <div className="flex items-center gap-3 mb-4">
      <span className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${accent ? 'text-primary' : 'text-foreground/40'}`}>
        {children}
      </span>
      <div className={`flex-1 h-[1px] ${accent ? 'bg-primary/30' : 'bg-border/40'}`} />
    </div>
  );

  return (
    <div className="space-y-7">
      {/* Current Plan - Hero Section */}
      {canonicalState.leadingOption && (
        <div className="pb-1">
          <SectionHeader accent>Current Plan</SectionHeader>
          <p className="text-[15px] leading-[1.7] text-foreground font-medium">
            {canonicalState.leadingOption}
          </p>
        </div>
      )}

      {/* Next Steps - Action items */}
      {canonicalState.suggestedNextSteps && canonicalState.suggestedNextSteps.length > 0 && (
        <div>
          <SectionHeader accent>Next Steps</SectionHeader>
          <ol className="space-y-3">
            {canonicalState.suggestedNextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-[14px] leading-[1.6]">
                <span className="w-6 h-6 rounded-lg bg-primary/15 text-primary font-semibold text-[12px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <span className="text-foreground/85">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Constraints - Collapsible */}
      {sessionConstraints.length > 0 && (
        <div>
          <button
            onClick={() => setConstraintsExpanded(!constraintsExpanded)}
            className="w-full flex items-center gap-3 text-left group"
          >
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground/40 group-hover:text-foreground/60 transition-colors">
              Constraints ({sessionConstraints.length})
            </span>
            <div className="flex-1 h-[1px] bg-border/40" />
            <span className="text-foreground/30 group-hover:text-foreground/50 transition-colors">
              <ChevronIcon expanded={constraintsExpanded} />
            </span>
          </button>
          {constraintsExpanded && (
            <ul className="space-y-2.5 list-none mt-4">
              {sessionConstraints.map((c, i) => {
                // Strip any leading dash/bullet from constraint text
                const constraintText = c.constraint.replace(/^[-–—•]\s*/, '').trim();
                return (
                  <li key={i} className="flex items-start gap-3 text-[14px] text-foreground/55 leading-[1.6]">
                    <span className="w-1.5 h-1.5 rounded-full bg-foreground/25 mt-[9px] shrink-0" />
                    <span className="flex-1">{constraintText}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Participants */}
      <div>
        <SectionHeader>Participants</SectionHeader>
        <div className="grid grid-cols-1 gap-2.5">
          {participants.map((p) => {
            const isAI = p.kind === "assistant";
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-foreground/5 transition-colors -mx-3"
              >
                <Avatar className={`h-7 w-7 border ${isAI ? 'border-primary/30' : 'border-border/50'}`}>
                  {p.image ? <AvatarImage src={p.image} /> : null}
                  <AvatarFallback className={`text-[11px] font-semibold ${isAI ? 'bg-primary/10 text-primary' : 'bg-foreground/10 text-foreground/70'}`}>
                    {getInitials(p.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <span className="text-[14px] text-foreground/85 truncate block">{p.displayName}</span>
                </div>
                {isAI && (
                  <span className="text-[10px] font-semibold text-primary/70 uppercase tracking-wider bg-primary/10 px-1.5 py-0.5 rounded">AI</span>
                )}
                {p.hasCalendar && (
                  <CalendarIcon />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
