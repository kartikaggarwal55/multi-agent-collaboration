"use client";

// CHANGED: Private 1:1 assistant chat page with redesigned UI
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatNav } from "@/components/chat-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { useVoiceSession } from "@/hooks/useVoiceSession";

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

const LogOutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const TagIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
    <path d="M7 7h.01" />
  </svg>
);

const HistoryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

const MicOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" x2="22" y1="2" y2="22" />
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
    <path d="M5 10v2a7 7 0 0 0 12 5" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const BrainIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24A2.5 2.5 0 0 1 9.5 2" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24A2.5 2.5 0 0 0 14.5 2" />
  </svg>
);

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ProfileChange {
  type: "added" | "updated" | "removed";
  before?: string;
  after?: string;
  reason: string;
  timestamp: string;
}

export default function PrivateAssistantPage() {
  const { data: session, status } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [profile, setProfile] = useState<string[]>([]);
  const [recentChanges, setRecentChanges] = useState<ProfileChange[]>([]);
  const [hasCalendar, setHasCalendar] = useState<boolean | null>(null);
  const [hasGmail, setHasGmail] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const isInitialLoad = useRef(true);

  // Voice session hook
  const {
    error: voiceError,
    startSession: startVoiceSession,
    endSession: endVoiceSession,
    isActive: isVoiceActive,
    isConnecting: isVoiceConnecting,
  } = useVoiceSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/auth/signin");
    }
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchChatData();
    }
  }, [status]);

  // Poll for new messages when tab is visible and not actively loading
  useEffect(() => {
    if (status !== "authenticated" || isLoading) return;

    const pollInterval = 5000; // 5 seconds
    let timeoutId: NodeJS.Timeout;

    const pollForMessages = async () => {
      // Only poll if document is visible
      if (document.hidden) {
        timeoutId = setTimeout(pollForMessages, pollInterval);
        return;
      }

      try {
        const response = await fetch("/api/me/chat");
        if (response.ok) {
          const data = await response.json();
          const newMessages = data.messages || [];

          // Only update if message count changed (simple check to avoid unnecessary rerenders)
          setMessages((prev) => {
            if (prev.length !== newMessages.length) {
              return newMessages;
            }
            // Check if last message ID differs
            if (prev.length > 0 && newMessages.length > 0 &&
                prev[prev.length - 1].id !== newMessages[newMessages.length - 1].id) {
              return newMessages;
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
  }, [status, isLoading]);

  // Smart scroll: only auto-scroll if user is near bottom or on initial load
  useEffect(() => {
    if (isInitialLoad.current || shouldAutoScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: isInitialLoad.current ? "instant" : "smooth" });
      if (messages.length > 0) {
        isInitialLoad.current = false;
      }
    }
  }, [messages]);

  // Track scroll position to determine if user is near bottom
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    // Consider "near bottom" if within 150px
    shouldAutoScroll.current = distanceFromBottom < 150;
  };

  const fetchChatData = async () => {
    try {
      const response = await fetch("/api/me/chat");
      if (!response.ok) throw new Error("Failed to fetch chat data");
      const data = await response.json();
      setMessages(data.messages || []);
      setProfile(data.profile || []);
      setHasCalendar(data.hasCalendar ?? null);
      setHasGmail(data.hasGmail ?? null);
    } catch (err) {
      console.error("Error fetching chat:", err);
      setError("Failed to load chat history");
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    // Always scroll to bottom when user sends a message
    shouldAutoScroll.current = true;

    setIsLoading(true);
    setError(null);
    const messageContent = input;
    setInput("");

    try {
      const response = await fetch("/api/me/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageContent }),
      });

      if (!response.ok) throw new Error("Failed to send message");

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
            const data = JSON.parse(line.slice(6));

            if (eventType === "message") {
              setMessages((prev) => {
                const exists = prev.some((m) => m.id === data.id);
                if (exists) return prev;
                return [...prev, data];
              });
            } else if (eventType === "profile") {
              setProfile(data.items || []);
              if (data.changes) {
                setRecentChanges((prev) => [...prev, ...data.changes].slice(-5));
              }
            } else if (eventType === "error") {
              setError(data.error);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = async () => {
    if (!confirm("Clear all messages? This cannot be undone.")) return;

    try {
      const response = await fetch("/api/me/chat", { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to clear chat");
      setMessages([]);
      setRecentChanges([]);
    } catch (err) {
      console.error("Error clearing chat:", err);
      setError("Failed to clear chat");
    }
  };

  // Handle starting to edit a preference
  const startEditing = (index: number, currentValue: string) => {
    setEditingIndex(index);
    setEditValue(currentValue);
    setTimeout(() => {
      if (editInputRef.current) {
        editInputRef.current.focus();
        editInputRef.current.style.height = "auto";
        editInputRef.current.style.height = editInputRef.current.scrollHeight + "px";
      }
    }, 0);
  };

  // Handle saving an edited preference
  const saveEdit = async () => {
    if (editingIndex === null || !editValue.trim()) return;

    try {
      const response = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: editingIndex, value: editValue.trim() }),
      });

      if (!response.ok) throw new Error("Failed to update preference");

      const data = await response.json();
      setProfile(data.profile);
      setEditingIndex(null);
      setEditValue("");
    } catch (err) {
      console.error("Error updating preference:", err);
      setError("Failed to update preference");
    }
  };

  // Handle deleting a preference
  const deletePreference = async (index: number) => {
    try {
      const response = await fetch("/api/me/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });

      if (!response.ok) throw new Error("Failed to delete preference");

      const data = await response.json();
      setProfile(data.profile);
    } catch (err) {
      console.error("Error deleting preference:", err);
      setError("Failed to delete preference");
    }
  };

  // Handle voice session toggle
  const handleVoiceToggle = useCallback(async () => {
    if (isVoiceActive || isVoiceConnecting) {
      // End session and process transcript
      setIsProcessingVoice(true);
      try {
        const finalTranscript = await endVoiceSession();

        if (finalTranscript.length > 0) {
          // Process transcript for profile updates and storage
          const response = await fetch("/api/me/voice/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: finalTranscript }),
          });

          // Always refresh to show stored conversation
          fetchChatData();

          if (response.ok) {
            const data = await response.json();
            if (data.changes && data.changes.length > 0) {
              setRecentChanges((prev) => [...prev, ...data.changes.map((c: { type: string; reason: string }) => ({
                type: c.type,
                reason: c.reason,
                timestamp: new Date().toISOString(),
              }))].slice(-5));
            }
          }
        }
      } catch (err) {
        console.error("Error processing voice session:", err);
      } finally {
        setIsProcessingVoice(false);
      }
    } else {
      // Start new session
      await startVoiceSession();
    }
  }, [isVoiceActive, isVoiceConnecting, endVoiceSession, startVoiceSession, fetchChatData]);

  const reconnectGoogle = () => {
    // Sign out and redirect to sign-in page which will trigger fresh OAuth consent
    signOut({ callbackUrl: "/auth/signin?prompt=consent" });
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex h-screen w-full bg-background relative overflow-hidden">
      {/* Background gradient mesh */}
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
                <h1 className="text-lg font-semibold tracking-tight">My Assistant</h1>
                <p className="text-xs text-muted-foreground">Personal AI that learns your preferences</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ChatNav />
              <ThemeToggle />
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
                className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                title="Clear chat"
              >
                <TrashIcon />
              </Button>
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

        {/* Messages - FULL WIDTH */}
        <ScrollArea className="flex-1 min-h-0" viewportRef={scrollContainerRef} onScroll={handleScroll}>
          <div className="px-6 py-4 space-y-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mb-4 border border-primary/20">
                  <SparklesIcon />
                </div>
                <p className="text-foreground text-sm font-medium">
                  Hi {session.user?.name?.split(" ")[0] || "there"}!
                </p>
                <p className="text-muted-foreground text-xs mt-1 max-w-sm">
                  I'm your personal assistant. Tell me about yourself and I'll remember your preferences.
                </p>
              </div>
            )}

            {messages.map((msg, index) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                user={session.user}
                animationDelay={index * 30}
              />
            ))}

            {isLoading && (
              <div className="flex items-center gap-3 animate-message-enter">
                <Avatar className="h-8 w-8 border-2 border-primary/30">
                  <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/20 text-primary">
                    <BrainIcon />
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border/50">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs text-muted-foreground ml-1">Thinking...</span>
                </div>
              </div>
            )}

            {/* Scroll anchor */}
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

        {/* Voice error */}
        {voiceError && (
          <div className="px-6 py-2">
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20 flex items-center gap-2">
              <MicOffIcon />
              <span>Voice error: {voiceError}</span>
            </div>
          </div>
        )}

        {/* Input - FULL WIDTH */}
        <div className="px-6 py-4 border-t border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative input-glow rounded-lg">
              <Input
                placeholder={isVoiceActive ? "Voice session active..." : "Type a message..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading || isVoiceActive}
                className="h-10 bg-card/50 border-border/50 rounded-lg text-sm focus:ring-0 focus:border-primary/50"
              />
            </div>
            <Button
              onClick={handleVoiceToggle}
              disabled={isLoading || isProcessingVoice}
              className={`h-10 w-10 p-0 rounded-lg transition-all ${
                isVoiceActive || isVoiceConnecting
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                  : "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              }`}
              title={isVoiceActive ? "End voice session" : "Start voice session"}
            >
              {isVoiceActive ? (
                <div className="flex items-center justify-center gap-0.5">
                  <span className="w-0.5 h-3 bg-white rounded-full animate-[voice-bar_0.5s_ease-in-out_infinite]" />
                  <span className="w-0.5 h-4 bg-white rounded-full animate-[voice-bar_0.5s_ease-in-out_infinite_0.15s]" />
                  <span className="w-0.5 h-2 bg-white rounded-full animate-[voice-bar_0.5s_ease-in-out_infinite_0.3s]" />
                  <span className="w-0.5 h-4 bg-white rounded-full animate-[voice-bar_0.5s_ease-in-out_infinite_0.45s]" />
                  <span className="w-0.5 h-3 bg-white rounded-full animate-[voice-bar_0.5s_ease-in-out_infinite_0.6s]" />
                </div>
              ) : isVoiceConnecting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <MicIcon />
              )}
            </Button>
            <Button
              onClick={sendMessage}
              disabled={isLoading || !input.trim() || isVoiceActive}
              className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all disabled:opacity-40"
            >
              <SendIcon />
            </Button>
          </div>
        </div>
      </div>

      {/* Right panel - Profile */}
      <div className="w-[340px] shrink-0 border-l border-border/30 glass-panel relative overflow-hidden">
        <div className="h-full flex flex-col">
          {/* User info with connection status */}
          <div className="px-5 py-4 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar className="h-10 w-10 border-2 border-primary/30">
                  <AvatarImage src={session.user?.image || undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary font-medium">
                    {session.user?.name?.[0] || <UserIcon />}
                  </AvatarFallback>
                </Avatar>
                {/* Red dot indicator if reconnection needed */}
                {(hasCalendar === false || hasGmail === false) && (
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-background" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{session.user?.name || "User"}</p>
                <p className="text-[11px] text-muted-foreground truncate">{session.user?.email}</p>
              </div>
            </div>
            {/* Reconnect banner - only shows when needed */}
            {(hasCalendar === false || hasGmail === false) && (
              <button
                onClick={reconnectGoogle}
                className="mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/15 transition-colors text-left"
              >
                <span className="text-[12px]">Google access expired</span>
                <span className="text-[11px] font-medium">Reconnect →</span>
              </button>
            )}
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-4 space-y-5">
              {/* Profile section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <TagIcon />
                  My Profile
                </div>
                {profile.length === 0 ? (
                  <div className="p-4 rounded-lg bg-muted/50 border border-border/50 text-center">
                    <p className="text-xs text-muted-foreground">
                      No preferences yet. Chat with your assistant to build your profile.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {profile.map((item, i) => (
                      <div
                        key={i}
                        className="group relative flex items-start gap-2 p-2.5 rounded-lg bg-secondary/50 border border-border/50 card-hover"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        {editingIndex === i ? (
                          <textarea
                            ref={editInputRef}
                            value={editValue}
                            onChange={(e) => {
                              setEditValue(e.target.value);
                              e.target.style.height = "auto";
                              e.target.style.height = e.target.scrollHeight + "px";
                            }}
                            onBlur={saveEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                saveEdit();
                              } else if (e.key === "Escape") {
                                setEditingIndex(null);
                                setEditValue("");
                              }
                            }}
                            rows={1}
                            className="flex-1 text-[13px] leading-relaxed text-foreground/90 bg-background border border-border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary resize-none overflow-hidden"
                            style={{ height: "auto" }}
                          />
                        ) : (
                          <>
                            <span className="flex-1 text-[13px] leading-relaxed text-foreground/90 pr-12">{item}</span>
                            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => startEditing(i, item)}
                                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                                title="Edit"
                              >
                                <EditIcon />
                              </button>
                              <button
                                onClick={() => deletePreference(i)}
                                className="p-1 rounded text-muted-foreground hover:text-red-500 transition-colors"
                                title="Delete"
                              >
                                <XIcon />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent changes */}
              {recentChanges.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <HistoryIcon />
                    Recent Changes
                  </div>
                  <div className="space-y-2">
                    {recentChanges.map((change, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-muted/30 border border-border/40"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${
                              change.type === "added"
                                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                : change.type === "updated"
                                ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                : "bg-red-500/20 text-red-600 dark:text-red-400"
                            }`}
                          >
                            {change.type}
                          </span>
                        </div>
                        <p className="text-[13px] text-muted-foreground leading-relaxed">
                          {change.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// Message bubble component
function MessageBubble({
  message,
  user,
  animationDelay,
}: {
  message: Message;
  user: { name?: string | null; image?: string | null };
  animationDelay: number;
}) {
  const isUser = message.role === "user";
  // Detect voice messages (start with 🎤)
  const isVoiceMessage = message.content.startsWith("🎤");
  // Remove the 🎤 prefix for display
  const displayContent = isVoiceMessage ? message.content.slice(2).trim() : message.content;

  return (
    <div
      className={`animate-message-enter flex ${isUser ? "justify-end" : "justify-start"}`}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className={`flex gap-3 max-w-[85%] ${isUser ? "flex-row-reverse" : ""}`}>
        <Avatar className={`h-8 w-8 shrink-0 border-2 ${isUser ? "border-primary/30" : "border-primary/30"}`}>
          {isUser ? (
            <>
              <AvatarImage src={user.image || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                {user.name?.[0] || "U"}
              </AvatarFallback>
            </>
          ) : (
            <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/20 text-primary">
              <BrainIcon />
            </AvatarFallback>
          )}
        </Avatar>

        <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
          <div
            className={`rounded-xl px-4 py-3 ${
              isUser
                ? isVoiceMessage
                  ? "bg-[oklch(0.65_0.15_55/0.6)] text-white/90 shadow-sm border border-[oklch(0.65_0.15_55/0.4)]"
                  : "bg-[oklch(0.65_0.15_55)] text-white shadow-sm border border-[oklch(0.65_0.15_55)]"
                : "bg-card/80 border border-border/50 shadow-sm backdrop-blur-sm"
            }`}
          >
            {isUser ? (
              isVoiceMessage ? (
                <p className="text-sm whitespace-pre-wrap leading-relaxed italic">"{displayContent}"</p>
              ) : (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
              )
            ) : (
              <div className="prose prose-sm prose-invert max-w-none prose-chat">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="text-sm mb-2 last:mb-0 leading-relaxed">{children}</p>,
                    ul: ({ children }) => <ul className="text-sm list-none pl-0 mb-2 space-y-1.5">{children}</ul>,
                    ol: ({ children }) => <ol className="text-sm list-decimal pl-4 mb-2 space-y-1.5">{children}</ol>,
                    li: ({ children }) => (
                      <li className="text-sm leading-relaxed flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-primary/60 mt-2 shrink-0" />
                        <span>{children}</span>
                      </li>
                    ),
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
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
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
