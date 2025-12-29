"use client";

// CHANGED: Private 1:1 assistant chat page with redesigned UI
import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatNav } from "@/components/chat-nav";

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
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchChatData = async () => {
    try {
      const response = await fetch("/api/me/chat");
      if (!response.ok) throw new Error("Failed to fetch chat data");
      const data = await response.json();
      setMessages(data.messages || []);
      setProfile(data.profile || []);
    } catch (err) {
      console.error("Error fetching chat:", err);
      setError("Failed to load chat history");
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
              >
                <LogOutIcon />
              </Button>
            </div>
          </div>
        </header>

        {/* Messages - FULL WIDTH */}
        <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
          <div className="px-6 py-4 space-y-4">
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
                  <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/20 text-primary text-xs">
                    AI
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

        {/* Input - FULL WIDTH */}
        <div className="px-6 py-4 border-t border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative input-glow rounded-lg">
              <Input
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="h-10 bg-card/50 border-border/50 rounded-lg text-sm focus:ring-0 focus:border-primary/50"
              />
            </div>
            <Button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all disabled:opacity-40"
            >
              <SendIcon />
            </Button>
          </div>
        </div>
      </div>

      {/* Right panel - Profile */}
      <div className="w-[320px] shrink-0 border-l border-border/30 glass-panel relative overflow-hidden">
        <div className="h-full flex flex-col">
          {/* User info */}
          <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-primary/30">
              <AvatarImage src={session.user?.image || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary font-medium">
                {session.user?.name?.[0] || <UserIcon />}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.user?.name || "User"}</p>
              <p className="text-[11px] text-muted-foreground truncate">{session.user?.email}</p>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-4 space-y-5">
              {/* Profile section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <TagIcon />
                  My Profile
                </div>
                {profile.length === 0 ? (
                  <div className="p-4 rounded-lg bg-[oklch(0.22_0.01_250)] border border-[oklch(0.30_0.015_250)] text-center">
                    <p className="text-xs text-muted-foreground">
                      No preferences yet. Chat with your assistant to build your profile.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {profile.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2.5 rounded-lg bg-[oklch(0.22_0.01_250)] border border-[oklch(0.30_0.015_250)] card-hover"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span className="text-sm leading-relaxed">{item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent changes */}
              {recentChanges.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <HistoryIcon />
                    Recent Changes
                  </div>
                  <div className="space-y-1.5">
                    {recentChanges.map((change, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-[oklch(0.20_0.01_250)] border border-[oklch(0.28_0.015_250)]"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              change.type === "added"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : change.type === "updated"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {change.type}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
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
            <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/20 text-primary text-xs font-medium">
              AI
            </AvatarFallback>
          )}
        </Avatar>

        <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
          <div
            className={`rounded-xl px-4 py-3 ${
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border/50"
            }`}
          >
            {isUser ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
            ) : (
              <div className="prose prose-sm prose-invert max-w-none prose-chat">
                <ReactMarkdown
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
