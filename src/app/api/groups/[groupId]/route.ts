// API routes for specific group operations
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/groups/[groupId] - Get group details and messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = await params;

  try {
    // Check if user is a member
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member", needsJoin: true },
        { status: 403 }
      );
    }

    // Fetch group with members and messages
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        createdBy: {
          select: { id: true, name: true, image: true, email: true },
        },
        members: {
          where: { isActive: true },
          include: {
            user: {
              select: { id: true, name: true, image: true, email: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200, // Last 200 messages
        },
      },
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Check which members have calendar connected
    const memberUserIds = group.members.map((m) => m.userId);
    const accounts = await prisma.account.findMany({
      where: {
        userId: { in: memberUserIds },
        provider: "google",
        scope: { contains: "calendar" },
      },
      select: { userId: true },
    });
    const usersWithCalendar = new Set(accounts.map((a) => a.userId));

    // Build participants list (users + their assistants)
    const participants = [];
    for (const member of group.members) {
      // Add human participant
      participants.push({
        id: member.userId,
        kind: "human" as const,
        displayName: member.user.name || member.user.email || "User",
        image: member.user.image,
        hasCalendar: usersWithCalendar.has(member.userId),
      });
      // Add assistant participant
      participants.push({
        id: `${member.userId}-assistant`,
        kind: "assistant" as const,
        displayName: `${member.user.name?.split(" ")[0] || "User"}'s Assistant`,
        ownerHumanId: member.userId,
        hasCalendar: usersWithCalendar.has(member.userId),
      });
    }

    // Parse canonical state
    let canonicalState;
    try {
      canonicalState = JSON.parse(group.canonicalState);
    } catch {
      canonicalState = null;
    }

    // Format messages
    const messages = group.messages.map((m) => ({
      id: m.id,
      roomId: groupId,
      createdAt: m.createdAt.toISOString(),
      role: m.role,
      authorId: m.authorId,
      authorName: m.authorName,
      content: m.content,
      citations: m.citations ? JSON.parse(m.citations) : undefined,
    }));

    return NextResponse.json({
      group: {
        id: group.id,
        title: group.title,
        goal: group.goal,
        createdBy: group.createdBy,
        participants,
        messages,
        canonicalState,
        summary: group.summary,
        lastActiveAt: group.lastActiveAt,
        createdAt: group.createdAt,
      },
      myRole: membership.role,
      myUserId: session.user.id,
    });
  } catch (error) {
    console.error("Error fetching group:", error);
    return NextResponse.json(
      { error: "Failed to fetch group" },
      { status: 500 }
    );
  }
}

// PATCH /api/groups/[groupId] - Update group (goal, title)
export async function PATCH(
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
    const { title, goal } = body;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (goal !== undefined) {
      updateData.goal = goal;
      // Also update canonical state goal
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { canonicalState: true },
      });
      if (group) {
        const state = JSON.parse(group.canonicalState);
        state.goal = goal;
        state.lastUpdatedAt = new Date().toISOString();
        state.lastUpdatedBy = session.user.id;
        updateData.canonicalState = JSON.stringify(state);
      }
    }

    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: updateData,
    });

    return NextResponse.json({ success: true, group: updatedGroup });
  } catch (error) {
    console.error("Error updating group:", error);
    return NextResponse.json(
      { error: "Failed to update group" },
      { status: 500 }
    );
  }
}

// DELETE /api/groups/[groupId] - Delete group (creator only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = await params;

  try {
    // Get group and verify ownership
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { createdById: true },
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (group.createdById !== session.user.id) {
      return NextResponse.json(
        { error: "Only the creator can delete this group" },
        { status: 403 }
      );
    }

    // Delete the group (cascades to members and messages due to schema)
    await prisma.group.delete({
      where: { id: groupId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting group:", error);
    return NextResponse.json(
      { error: "Failed to delete group" },
      { status: 500 }
    );
  }
}
