"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { RoomState, Message, Participant } from "@/lib/types";

export default function Home() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [speakerId, setSpeakerId] = useState<string>("alice");
  const [message, setMessage] = useState("");
  const [goal, setGoal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentlyTyping, setCurrentlyTyping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch initial room state
  useEffect(() => {
    fetchRoom();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [room?.messages]);

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
    setMessage(""); // Clear input immediately
    // Set initial typing indicator to first assistant
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

      // Check if response is SSE stream
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("text/event-stream")) {
        // Handle SSE streaming
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              const data = JSON.parse(line.slice(6));

              if (eventType === "message") {
                // Add message to room state
                setRoom((prev) => {
                  if (!prev) return prev;
                  // Check if message already exists
                  const exists = prev.messages.some((m) => m.id === data.message.id);
                  if (exists) return prev;
                  return {
                    ...prev,
                    messages: [...prev.messages, data.message],
                  };
                });
                // Update typing indicator to show next assistant
                const assistants = room?.participants.filter(p => p.kind === "assistant") || [];
                const currentIndex = assistants.findIndex(a => a.id === data.message.authorId);
                const nextAssistant = assistants[(currentIndex + 1) % assistants.length];
                if (nextAssistant && data.message.role === "assistant") {
                  setCurrentlyTyping(nextAssistant.displayName);
                }
              } else if (eventType === "summary") {
                // Update summary - generating summary is the last step
                setCurrentlyTyping("Generating summary...");
                setRoom((prev) => {
                  if (!prev) return prev;
                  return { ...prev, summary: data.summary };
                });
              } else if (eventType === "error") {
                setError(data.error);
              } else if (eventType === "done") {
                // Final room state update
                setRoom(data.room);
                setCurrentlyTyping(null);
              }
            }
          }
        }
      } else {
        // Handle non-streaming response (error case)
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to send message");
        }
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
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (authorId: string): string => {
    if (authorId === "alice") return "bg-purple-500";
    if (authorId === "bob") return "bg-blue-500";
    if (authorId === "alice-assistant") return "bg-purple-300";
    if (authorId === "bob-assistant") return "bg-blue-300";
    return "bg-gray-500";
  };

  const formatTime = (isoString: string): string => {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Left side: Chat */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="border-b px-6 py-4">
          <h1 className="text-xl font-semibold">Collaboration Room</h1>
          <p className="text-sm text-muted-foreground">
            Two humans + their AI assistants planning together
          </p>
        </header>

        {/* Goal input */}
        <div className="border-b px-6 py-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              Goal:
            </label>
            <Input
              placeholder="e.g., Plan a low-stress dinner for Friday night"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="flex-1"
            />
          </div>
        </div>

        {/* Messages area */}
        <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef}>
          <div className="space-y-4">
            {room?.messages.length === 0 && (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                <p>No messages yet. Set a goal and start the conversation!</p>
              </div>
            )}

            {room?.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                getInitials={getInitials}
                getAvatarColor={getAvatarColor}
                formatTime={formatTime}
              />
            ))}

            {isLoading && currentlyTyping && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 animate-pulse">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-sm text-muted-foreground">
                  {currentlyTyping} is typing...
                </span>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Error display */}
        {error && (
          <div className="px-6 py-2">
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="border-t px-6 py-4">
          <div className="flex items-center gap-3">
            <Select value={speakerId} onValueChange={setSpeakerId}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Speaker" />
              </SelectTrigger>
              <SelectContent>
                {getHumans().map((human) => (
                  <SelectItem key={human.id} value={human.id}>
                    {human.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="flex-1"
            />

            <Button onClick={sendMessage} disabled={isLoading || !message.trim()}>
              {isLoading ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </div>

      {/* Right side: State panel */}
      <div className="w-80 border-l bg-muted/30">
        <Card className="h-full rounded-none border-0">
          <CardHeader>
            <CardTitle className="text-lg">Current State</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-120px)]">
              {room?.goal && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-1">
                    Goal
                  </h3>
                  <p className="text-sm">{room.goal}</p>
                </div>
              )}

              <Separator className="my-4" />

              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold mt-3 mb-1">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-sm mb-2">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="text-sm list-disc pl-4 mb-2 space-y-1">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="text-sm list-decimal pl-4 mb-2 space-y-1">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-sm">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold">{children}</strong>
                    ),
                  }}
                >
                  {room?.summary || "Waiting for conversation to begin..."}
                </ReactMarkdown>
              </div>

              <Separator className="my-4" />

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                  Participants
                </h3>
                <div className="space-y-2">
                  {room?.participants.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback
                          className={`text-xs text-white ${getAvatarColor(p.id)}`}
                        >
                          {getInitials(p.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{p.displayName}</span>
                      {p.kind === "assistant" && (
                        <span className="text-xs text-muted-foreground">(AI)</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Message bubble component
function MessageBubble({
  message,
  getInitials,
  getAvatarColor,
  formatTime,
}: {
  message: Message;
  getInitials: (name: string) => string;
  getAvatarColor: (id: string) => string;
  formatTime: (iso: string) => string;
}) {
  const isAssistant = message.role === "assistant";

  return (
    <div className={`flex gap-3 ${isAssistant ? "bg-muted/50 -mx-2 px-2 py-3 rounded-lg" : ""}`}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          className={`text-xs text-white ${getAvatarColor(message.authorId)}`}
        >
          {getInitials(message.authorName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-medium text-sm">{message.authorName}</span>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
        </div>

        {isAssistant ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p className="text-sm mb-2 last:mb-0">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="text-sm list-disc pl-4 mb-2 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="text-sm list-decimal pl-4 mb-2 space-y-1">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-sm">{children}</li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold">{children}</strong>
                ),
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
        ) : (
          <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        )}

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Sources:
            </p>
            <ul className="text-xs space-y-1">
              {message.citations.map((citation, i) => (
                <li key={i}>
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {citation.title || citation.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
