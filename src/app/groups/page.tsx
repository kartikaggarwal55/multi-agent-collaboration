"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatNav } from "@/components/chat-nav";

const LogOutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// Icons
const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const UsersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
  </svg>
);

const LinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const MessageIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

interface GroupMember {
  id: string;
  name: string | null;
  image: string | null;
  role: string;
}

interface Group {
  id: string;
  title: string | null;
  goal: string | null;
  memberCount: number;
  messageCount: number;
  members: GroupMember[];
  lastActiveAt: string;
  createdAt: string;
  myRole: string;
}

export default function GroupsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    } else if (status === "authenticated") {
      fetchGroups();
    }
  }, [status, router]);

  // Hidden demo mode activation via keyboard shortcut (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        localStorage.setItem("demoMode", "true");
        router.push("/");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  const fetchGroups = async () => {
    try {
      const response = await fetch("/api/groups");
      if (!response.ok) throw new Error("Failed to fetch groups");
      const data = await response.json();
      setGroups(data.groups || []);
    } catch (err) {
      console.error("Error fetching groups:", err);
      setError("Failed to load groups");
    } finally {
      setIsLoading(false);
    }
  };

  const createGroup = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newGroupTitle || null }),
      });

      if (!response.ok) throw new Error("Failed to create group");

      const data = await response.json();
      router.push(`/groups/${data.group.id}`);
    } catch (err) {
      console.error("Error creating group:", err);
      setError("Failed to create group");
      setIsCreating(false);
    }
  };

  const joinByLink = async () => {
    // Extract group ID from link or use as-is
    let groupId = joinCode.trim();

    // Handle full URLs
    if (groupId.includes("/groups/")) {
      const match = groupId.match(/\/groups\/([^/?]+)/);
      if (match) groupId = match[1];
    } else if (groupId.includes("/join/")) {
      const match = groupId.match(/\/join\/([^/?]+)/);
      if (match) groupId = match[1];
    }

    if (!groupId) {
      setError("Please enter a valid group link or ID");
      return;
    }

    router.push(`/join/${groupId}`);
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 mesh-gradient pointer-events-none" />
      <div className="absolute inset-0 noise-overlay pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
              <UsersIcon />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
              <p className="text-sm text-muted-foreground">
                Collaborate with AI assistants
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ChatNav />
            <Button
              onClick={() => setShowCreateModal(true)}
              className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90"
            >
              <PlusIcon />
              <span className="ml-2">New Group</span>
            </Button>
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

        {/* Join by Link */}
        <div className="mb-8 p-4 rounded-xl bg-card/50 border border-border/50">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
            <LinkIcon />
            Join by Link
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Paste group link or ID..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="flex-1 h-10 bg-background/50"
            />
            <Button
              onClick={joinByLink}
              variant="secondary"
              className="h-10 px-4"
            >
              Join
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
            {error}
          </div>
        )}

        {/* Groups List */}
        <div className="space-y-3">
          {groups.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <SparklesIcon />
              </div>
              <p className="text-muted-foreground text-sm mb-4">
                No groups yet. Create one to start collaborating!
              </p>
              <Button
                onClick={() => setShowCreateModal(true)}
                variant="secondary"
              >
                <PlusIcon />
                <span className="ml-2">Create Your First Group</span>
              </Button>
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.id}
                onClick={() => router.push(`/groups/${group.id}`)}
                className="p-4 rounded-xl bg-card/80 border border-border/50 cursor-pointer card-hover"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">
                      {group.title || "Untitled Group"}
                    </h3>
                    {group.goal && (
                      <p className="text-sm text-muted-foreground truncate mt-1">
                        {group.goal}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <UsersIcon />
                        {group.memberCount} members
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageIcon />
                        {group.messageCount} messages
                      </span>
                      <span>{formatRelativeTime(group.lastActiveAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {group.members.slice(0, 3).map((member) => (
                        <Avatar
                          key={member.id}
                          className="h-8 w-8 border-2 border-card"
                        >
                          <AvatarImage src={member.image || undefined} />
                          <AvatarFallback className="text-xs bg-muted">
                            {member.name?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {group.memberCount > 3 && (
                        <div className="h-8 w-8 rounded-full bg-muted border-2 border-card flex items-center justify-center text-xs">
                          +{group.memberCount - 3}
                        </div>
                      )}
                    </div>
                    <ArrowRightIcon />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 w-full max-w-md border border-border shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Create New Group</h2>
            <Input
              placeholder="Group name (optional)"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              className="mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewGroupTitle("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={createGroup}
                disabled={isCreating}
                className="bg-primary hover:bg-primary/90"
              >
                {isCreating ? "Creating..." : "Create Group"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
