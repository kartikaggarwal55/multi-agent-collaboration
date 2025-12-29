"use client";

import { useState, useEffect, use } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Icons
const UsersIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

interface GroupInfo {
  id: string;
  title: string | null;
  goal: string | null;
  createdBy: {
    name: string | null;
    image: string | null;
  };
  memberCount: number;
}

export default function JoinGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGroupInfo();
  }, [groupId]);

  const fetchGroupInfo = async () => {
    try {
      const response = await fetch(`/api/groups/${groupId}/join`);
      if (!response.ok) {
        if (response.status === 404) {
          setError("Group not found");
        } else {
          throw new Error("Failed to fetch group info");
        }
        return;
      }

      const data = await response.json();
      setGroupInfo(data.group);
      setIsMember(data.isMember);

      // If already a member, redirect to group
      if (data.isMember) {
        router.push(`/groups/${groupId}`);
      }
    } catch (err) {
      console.error("Error fetching group:", err);
      setError("Failed to load group information");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!session) {
      // Redirect to sign in with callback to this page
      signIn("google", { callbackUrl: `/join/${groupId}` });
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const response = await fetch(`/api/groups/${groupId}/join`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to join group");
      }

      router.push(`/groups/${groupId}`);
    } catch (err) {
      console.error("Error joining group:", err);
      setError(err instanceof Error ? err.message : "Failed to join group");
      setIsJoining(false);
    }
  };

  if (isLoading || status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <UsersIcon />
          </div>
          <h1 className="text-xl font-semibold mb-2">Oops!</h1>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => router.push("/groups")} variant="secondary">
            Go to Groups
          </Button>
        </div>
      </div>
    );
  }

  if (!groupInfo) return null;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 mesh-gradient pointer-events-none" />
      <div className="absolute inset-0 noise-overlay pointer-events-none" />

      <div className="relative flex items-center justify-center min-h-screen px-6">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-2xl p-8 border border-border shadow-xl text-center">
            {/* Group Icon */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
              <UsersIcon />
            </div>

            {/* Group Info */}
            <h1 className="text-xl font-semibold mb-2">
              {groupInfo.title || "Collaboration Group"}
            </h1>
            {groupInfo.goal && (
              <p className="text-sm text-muted-foreground mb-4">
                {groupInfo.goal}
              </p>
            )}

            {/* Creator */}
            <div className="flex items-center justify-center gap-2 mb-6 text-sm text-muted-foreground">
              <Avatar className="h-6 w-6">
                <AvatarImage src={groupInfo.createdBy.image || undefined} />
                <AvatarFallback className="text-xs">
                  {groupInfo.createdBy.name?.[0] || "?"}
                </AvatarFallback>
              </Avatar>
              <span>Created by {groupInfo.createdBy.name || "Unknown"}</span>
            </div>

            {/* Member Count */}
            <div className="text-xs text-muted-foreground mb-6">
              {groupInfo.memberCount} member{groupInfo.memberCount !== 1 ? "s" : ""}
            </div>

            {/* Join Button */}
            {session ? (
              <Button
                onClick={handleJoin}
                disabled={isJoining}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-lg"
              >
                {isJoining ? "Joining..." : "Join Group"}
              </Button>
            ) : (
              <div className="space-y-3">
                <Button
                  onClick={handleJoin}
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-lg"
                >
                  Sign in to Join
                </Button>
                <p className="text-xs text-muted-foreground">
                  You'll need to sign in with Google to join this group
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
