// API route for joining a group
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST /api/groups/[groupId]/join - Join a group
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
    // Check if group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, title: true },
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Check if already a member (upsert to handle idempotency)
    const existingMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: session.user.id,
        },
      },
    });

    if (existingMember) {
      // Reactivate if inactive
      if (!existingMember.isActive) {
        await prisma.groupMember.update({
          where: { id: existingMember.id },
          data: { isActive: true },
        });
      }
      return NextResponse.json({
        success: true,
        message: "Already a member",
        groupId: group.id,
      });
    }

    // Create membership
    await prisma.groupMember.create({
      data: {
        groupId,
        userId: session.user.id,
        role: "member",
      },
    });

    // Update group's lastActiveAt
    await prisma.group.update({
      where: { id: groupId },
      data: { lastActiveAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: "Joined group",
      groupId: group.id,
    });
  } catch (error) {
    console.error("Error joining group:", error);
    return NextResponse.json(
      { error: "Failed to join group" },
      { status: 500 }
    );
  }
}

// GET /api/groups/[groupId]/join - Check if can join (for non-members)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const session = await auth();
  const { groupId } = await params;

  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        createdBy: {
          select: { name: true, image: true },
        },
        members: {
          where: { isActive: true },
          select: { userId: true },
        },
      },
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const isMember = session?.user?.id
      ? group.members.some((m) => m.userId === session.user.id)
      : false;

    return NextResponse.json({
      group: {
        id: group.id,
        title: group.title,
        goal: group.goal,
        createdBy: group.createdBy,
        memberCount: group.members.length,
      },
      isMember,
      isAuthenticated: !!session?.user?.id,
    });
  } catch (error) {
    console.error("Error checking group:", error);
    return NextResponse.json(
      { error: "Failed to check group" },
      { status: 500 }
    );
  }
}
