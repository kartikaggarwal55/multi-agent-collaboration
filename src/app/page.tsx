"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RoomState, Message, Participant, CanonicalState } from "@/lib/types";

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

const TargetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17L4 12" />
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6V12L16 14" />
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

const ExitIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// Demo mode check - hidden by default
function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("demoMode") === "true";
}

export default function Home() {
  const router = useRouter();
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [speakerId, setSpeakerId] = useState<string>("alice");
  const [message, setMessage] = useState("");
  const [goal, setGoal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentlyTyping, setCurrentlyTyping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Check demo mode on mount
  useEffect(() => {
    const isDemo = isDemoMode();
    setDemoMode(isDemo);
    if (!isDemo) {
      router.replace("/groups");
    }
  }, [router]);

  useEffect(() => {
    if (demoMode) {
      fetchRoom();
    }
  }, [demoMode]);

  // Scroll to bottom when messages change or on mount
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [room?.messages]);

  const exitDemoMode = () => {
    localStorage.removeItem("demoMode");
    router.push("/groups");
  };

  // Show loading while checking demo mode
  if (demoMode === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // If not in demo mode, redirect happens in useEffect
  if (!demoMode) {
    return null;
  }

  const fetchRoom = async () => {
    try {
      const response = await fetch("/api/room");
      const data = await response.json();
      if (data.room) {
        setRoom(data.room);
        if (data.room.goal) {
          setGoal(data.room.goal);
        }
      }
    } catch (err) {
      setError("Failed to load room state");
      console.error(err);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setMessage("");
    const assistants = room?.participants.filter(p => p.kind === "assistant") || [];
    if (assistants.length > 0) {
      setCurrentlyTyping(assistants[0].displayName);
    }

    try {
      const response = await fetch("/api/room/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerId,
          content: message,
          goal: goal || undefined,
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
              const data = JSON.parse(line.slice(6));

              if (eventType === "message") {
                setRoom((prev) => {
                  if (!prev) return prev;
                  const exists = prev.messages.some((m) => m.id === data.message.id);
                  if (exists) return prev;
                  return { ...prev, messages: [...prev.messages, data.message] };
                });
                const currentIndex = assistants.findIndex(a => a.id === data.message.authorId);
                const nextAssistant = assistants[(currentIndex + 1) % assistants.length];
                if (nextAssistant && data.message.role === "assistant") {
                  setCurrentlyTyping(nextAssistant.displayName);
                }
              } else if (eventType === "summary") {
                setRoom((prev) => prev ? { ...prev, summary: data.summary } : prev);
              } else if (eventType === "status") {
                setCurrentlyTyping(data.status);
              } else if (eventType === "error") {
                setError(data.error);
              } else if (eventType === "done") {
                setRoom(data.room);
                setCurrentlyTyping(null);
              }
            }
          }
        }
      } else {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to send message");
        setRoom(data.room);
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

  const getHumans = (): Participant[] => {
    return room?.participants.filter((p) => p.kind === "human") || [];
  };

  const getInitials = (name: string): string => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getParticipantColor = (authorId: string): { bg: string; text: string; border: string } => {
    if (authorId === "alice") return { bg: "bg-[oklch(0.72_0.18_330)]", text: "text-white", border: "border-[oklch(0.72_0.18_330)]" };
    if (authorId === "bob") return { bg: "bg-[oklch(0.68_0.14_200)]", text: "text-white", border: "border-[oklch(0.68_0.14_200)]" };
    if (authorId === "alice-assistant") return { bg: "bg-[oklch(0.28_0.08_330)]", text: "text-[oklch(0.85_0.12_330)]", border: "border-[oklch(0.40_0.10_330)]" };
    if (authorId === "bob-assistant") return { bg: "bg-[oklch(0.26_0.06_200)]", text: "text-[oklch(0.82_0.10_200)]", border: "border-[oklch(0.38_0.08_200)]" };
    return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  };

  const formatTime = (isoString: string): string => {
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex h-screen w-full bg-background relative overflow-hidden">
      {/* Background gradient mesh */}
      <div className="absolute inset-0 mesh-gradient pointer-events-none" />
      <div className="absolute inset-0 noise-overlay pointer-events-none" />

      {/* Main chat area - takes remaining space */}
      <div className="flex flex-1 flex-col relative overflow-hidden">
        {/* Header */}
        <header className="px-6 py-4 border-b border-border/50 bg-background/80 backdrop-blur-xl relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                <SparklesIcon />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Collaboration Room</h1>
                <p className="text-xs text-muted-foreground">Demo mode - Alice & Bob</p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={exitDemoMode}
              className="gap-2"
            >
              <ExitIcon />
              Exit Demo
            </Button>
          </div>
        </header>

        {/* Goal input - full width */}
        <div className="px-6 py-3 border-b border-border/30 bg-card/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-muted-foreground shrink-0">
              <TargetIcon />
              <span className="text-xs font-medium uppercase tracking-wider">Goal</span>
            </div>
            <Input
              placeholder="What are we planning today?"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="flex-1 h-10 bg-background/50 border-border/50 rounded-lg text-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
            />
          </div>
        </div>

        {/* Messages - FULL WIDTH, no max-width constraint */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-3">
            {room?.messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mb-4 border border-border/50">
                  <SparklesIcon />
                </div>
                <p className="text-muted-foreground text-sm font-medium">Ready to collaborate</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Set a goal and start the conversation</p>
              </div>
            )}

            {room?.messages.map((msg, index) => {
              const isUser = msg.role === "user";
              const colors = getParticipantColor(msg.authorId);
              const isAlice = msg.authorId.includes("alice");

              return (
                <div
                  key={msg.id}
                  className={`animate-message-enter flex ${isUser ? "justify-end" : "justify-start"}`}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className={`flex gap-3 max-w-[85%] ${isUser ? "flex-row-reverse" : ""}`}>
                    <Avatar className={`h-8 w-8 shrink-0 border-2 ${colors.border}`}>
                      <AvatarFallback className={`text-xs font-semibold ${colors.bg} ${colors.text}`}>
                        {getInitials(msg.authorName)}
                      </AvatarFallback>
                    </Avatar>

                    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                      <div className={`flex items-center gap-2 mb-1 ${isUser ? "flex-row-reverse" : ""}`}>
                        <span className="text-xs font-medium">{msg.authorName}</span>
                        {msg.role === "assistant" && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isAlice ? "badge-alice" : "badge-bob"}`}>
                            AI
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                      </div>

                      <div
                        className={`rounded-xl px-4 py-3 ${
                          isUser
                            ? `${colors.text}`
                            : "bg-card border border-border/50"
                        }`}
                        style={isUser ? {
                          background: `linear-gradient(to right, rgba(255,255,255,0.18), rgba(255,255,255,0.06) 50%, transparent 100%), ${
                            msg.authorId === "alice"
                              ? "oklch(0.72 0.18 330)"
                              : "oklch(0.68 0.14 200)"
                          }`
                        } : undefined}
                      >
                        {msg.role === "assistant" ? (
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
                                strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                                a: ({ href, children }) => (
                                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    {children}
                                  </a>
                                ),
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
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

            {/* Scroll anchor */}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Error display */}
        {error && (
          <div className="px-6 py-2">
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              {error}
            </div>
          </div>
        )}

        {/* Input area - FULL WIDTH */}
        <div className="px-6 py-4 border-t border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Select value={speakerId} onValueChange={setSpeakerId}>
              <SelectTrigger className="w-32 h-10 rounded-lg border-border/50 bg-card/50 text-sm">
                <SelectValue placeholder="Speaker" />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                {getHumans().map((human) => (
                  <SelectItem key={human.id} value={human.id} className="rounded-md">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${human.id === "alice" ? "bg-[oklch(0.72_0.18_330)]" : "bg-[oklch(0.68_0.14_200)]"}`} />
                      {human.displayName}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex-1 relative input-glow rounded-lg">
              <Input
                placeholder="Type your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="h-10 bg-card/50 border-border/50 rounded-lg text-sm pr-12 focus:ring-0 focus:border-primary/50"
              />
            </div>

            <Button
              onClick={sendMessage}
              disabled={isLoading || !message.trim()}
              className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all disabled:opacity-40"
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
              <StatePanel room={room} canonicalState={room?.canonicalState} getParticipantColor={getParticipantColor} getInitials={getInitials} />
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function StatePanel({
  room,
  canonicalState,
  getParticipantColor,
  getInitials,
}: {
  room: RoomState | null;
  canonicalState: CanonicalState | undefined;
  getParticipantColor: (id: string) => { bg: string; text: string; border: string };
  getInitials: (name: string) => string;
}) {
  if (!room) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!canonicalState) {
    return (
      <div className="text-sm text-muted-foreground leading-relaxed">
        <ReactMarkdown>{room.summary || "Waiting for conversation to begin..."}</ReactMarkdown>
      </div>
    );
  }

  const unresolvedQuestions = canonicalState.openQuestions?.filter(q => !q.resolved) || [];
  const sessionConstraints = canonicalState.constraints?.filter(c => c.source === "session_statement") || [];

  const questionsByTarget: Record<string, typeof unresolvedQuestions> = {};
  for (const q of unresolvedQuestions) {
    if (!questionsByTarget[q.target]) questionsByTarget[q.target] = [];
    questionsByTarget[q.target].push(q);
  }

  return (
    <div className="space-y-5">
      {/* Goal */}
      {canonicalState.goal && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <TargetIcon />
            Goal
          </div>
          <p className="text-sm leading-relaxed">{canonicalState.goal}</p>
        </div>
      )}

      {/* Leading Option */}
      {canonicalState.leadingOption && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-primary uppercase tracking-wider">
            <CheckIcon />
            Leading Option
          </div>
          <div className="p-3 rounded-lg bg-[oklch(0.24_0.04_55/0.15)] border border-[oklch(0.50_0.08_55/0.3)]">
            <p className="text-sm leading-relaxed">{canonicalState.leadingOption}</p>
          </div>
        </div>
      )}

      {/* Status */}
      {canonicalState.statusSummary && canonicalState.statusSummary.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</div>
          <ul className="space-y-1.5">
            {canonicalState.statusSummary.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/50 mt-2 shrink-0" />
                <span className="leading-relaxed text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Open Questions */}
      {unresolvedQuestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-amber-500 uppercase tracking-wider">
            <ClockIcon />
            Waiting For
          </div>
          <div className="space-y-2">
            {Object.entries(questionsByTarget).map(([target, questions]) => (
              <div key={target} className="p-3 rounded-lg bg-[oklch(0.24_0.06_80/0.15)] border border-[oklch(0.55_0.12_80/0.3)]">
                <p className="text-[10px] font-semibold text-amber-500 mb-1.5">{target}</p>
                <ul className="space-y-1">
                  {questions.map((q) => (
                    <li key={q.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-amber-500 text-xs">?</span>
                      <span className="leading-relaxed">{q.question}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Constraints */}
      {sessionConstraints.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Constraints</div>
          <ul className="space-y-1.5">
            {sessionConstraints.map((c, i) => {
              const participant = room.participants.find(p => p.id === c.participantId);
              const colors = getParticipantColor(c.participantId);
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Avatar className={`h-4 w-4 mt-0.5 shrink-0 border ${colors.border}`}>
                    <AvatarFallback className={`text-[8px] ${colors.bg} ${colors.text}`}>
                      {getInitials(participant?.displayName || c.participantId)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="leading-relaxed text-muted-foreground">{c.constraint}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Next Steps */}
      {canonicalState.suggestedNextSteps && canonicalState.suggestedNextSteps.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <ArrowRightIcon />
            Next Steps
          </div>
          <ol className="space-y-1.5">
            {canonicalState.suggestedNextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-relaxed text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Participants */}
      <div className="space-y-2 pt-4 border-t border-border/30">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Participants</div>
        <div className="grid grid-cols-2 gap-1.5">
          {room.participants.map((p) => {
            const colors = getParticipantColor(p.id);
            return (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-[oklch(0.22_0.01_250)] border border-[oklch(0.30_0.015_250)] card-hover">
                <Avatar className={`h-6 w-6 border ${colors.border}`}>
                  <AvatarFallback className={`text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                    {getInitials(p.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.displayName}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {p.kind === "assistant" ? <BotIcon /> : <UserIcon />}
                    {p.kind === "assistant" ? "AI" : "Human"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
