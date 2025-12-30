// API route for sending messages to a group
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  orchestrateGroupRun,
  GroupParticipant,
  GroupMessageData,
} from "@/lib/agents/group-orchestrator";
import { CanonicalState } from "@/lib/types";

// POST /api/groups/[groupId]/message - Send a message and trigger orchestration
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = await params;

  try {
    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const body = await request.json();
    const { content, goal } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: "Content required" }, { status: 400 });
    }

    // Get group with members
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          where: { isActive: true },
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 100,
        },
      },
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Update goal if provided
    if (goal !== undefined) {
      await prisma.group.update({
        where: { id: groupId },
        data: { goal },
      });
    }

    // Get user's display name
    const senderMember = group.members.find((m) => m.userId === session.user.id);
    const senderName = senderMember?.user.name || session.user.email || "User";

    // Create user message
    const userMessage = await prisma.groupMessage.create({
      data: {
        groupId,
        authorId: session.user.id,
        authorName: senderName,
        role: "user",
        content: content.trim(),
      },
    });

    // Check which members have calendar and gmail connected
    const memberUserIds = group.members.map((m) => m.userId);
    const accounts = await prisma.account.findMany({
      where: {
        userId: { in: memberUserIds },
        provider: "google",
      },
      select: { userId: true, scope: true },
    });
    const usersWithCalendar = new Set(
      accounts.filter((a) => a.scope?.includes("calendar")).map((a) => a.userId)
    );
    const usersWithGmail = new Set(
      accounts.filter((a) => a.scope?.includes("gmail")).map((a) => a.userId)
    );

    // Build participants list
    const participants: GroupParticipant[] = [];
    for (const member of group.members) {
      // Human participant
      participants.push({
        id: member.userId,
        kind: "human",
        displayName: member.user.name || member.user.email || "User",
        userId: member.userId,
        hasCalendar: usersWithCalendar.has(member.userId),
        hasGmail: usersWithGmail.has(member.userId),
      });
      // Assistant participant
      participants.push({
        id: `${member.userId}-assistant`,
        kind: "assistant",
        displayName: `${(member.user.name || "User").split(" ")[0]}'s Assistant`,
        ownerHumanId: member.userId,
        userId: member.userId,
        hasCalendar: usersWithCalendar.has(member.userId),
        hasGmail: usersWithGmail.has(member.userId),
      });
    }

    // Format existing messages
    const existingMessages: GroupMessageData[] = [
      ...group.messages.map((m) => ({
        id: m.id,
        groupId: m.groupId,
        authorId: m.authorId,
        authorName: m.authorName,
        role: m.role as "user" | "assistant",
        content: m.content,
        citations: m.citations ? JSON.parse(m.citations) : undefined,
        createdAt: m.createdAt.toISOString(),
      })),
      // Add the new user message
      {
        id: userMessage.id,
        groupId,
        authorId: session.user.id,
        authorName: senderName,
        role: "user" as const,
        content: content.trim(),
        createdAt: userMessage.createdAt.toISOString(),
      },
    ];

    // Parse canonical state
    let canonicalState: CanonicalState;
    try {
      canonicalState = JSON.parse(group.canonicalState);
    } catch {
      canonicalState = {
        goal: goal || group.goal || "",
        leadingOption: "",
        statusSummary: [],
        constraints: [],
        openQuestions: [],
        suggestedNextSteps: [],
        stage: "negotiating",
        lastUpdatedAt: new Date().toISOString(),
        lastUpdatedBy: "system",
      };
    }

    // Update goal in canonical state if provided
    if (goal) {
      canonicalState.goal = goal;
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;

        const sendEvent = (event: string, data: unknown) => {
          if (isClosed) return; // Guard against sending after close
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch (e) {
            // Controller may be closed, ignore
            console.warn("Failed to send SSE event:", e);
          }
        };

        try {
          // Send the user message first
          sendEvent("message", {
            id: userMessage.id,
            groupId,
            authorId: session.user.id,
            authorName: senderName,
            role: "user",
            content: content.trim(),
            createdAt: userMessage.createdAt.toISOString(),
          });

          // Run orchestration
          for await (const event of orchestrateGroupRun(
            groupId,
            userMessage.id,
            participants,
            existingMessages,
            canonicalState,
            goal || group.goal || ""
          )) {
            switch (event.type) {
              case "message":
                sendEvent("message", event.message);
                break;
              case "state_update":
                sendEvent("state", event.state);
                break;
              case "status":
                sendEvent("status", { status: event.status });
                break;
              case "error":
                sendEvent("error", { error: event.error });
                break;
              case "done":
                // Get final state
                const finalGroup = await prisma.group.findUnique({
                  where: { id: groupId },
                  select: { canonicalState: true },
                });
                let finalState = canonicalState;
                if (finalGroup) {
                  try {
                    finalState = JSON.parse(finalGroup.canonicalState);
                  } catch {
                    // Keep current state
                  }
                }
                sendEvent("done", {
                  stopReason: event.stopReason,
                  canonicalState: finalState,
                });
                break;
            }
          }
        } catch (error) {
          console.error("Orchestration error:", error);
          sendEvent("error", {
            error: error instanceof Error ? error.message : "Orchestration failed",
          });
          sendEvent("done", { stopReason: "ERROR" });
        } finally {
          isClosed = true;
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in group message:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
