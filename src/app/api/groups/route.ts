// API routes for group management
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/groups - List user's groups
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const memberships = await prisma.groupMember.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
      },
      include: {
        group: {
          include: {
            createdBy: {
              select: { id: true, name: true, image: true },
            },
            members: {
              where: { isActive: true },
              include: {
                user: {
                  select: { id: true, name: true, image: true },
                },
              },
            },
            _count: {
              select: { messages: true },
            },
          },
        },
      },
      orderBy: {
        group: {
          lastActiveAt: "desc",
        },
      },
    });

    const groups = memberships.map((m) => ({
      id: m.group.id,
      title: m.group.title,
      createdBy: m.group.createdBy,
      memberCount: m.group.members.length,
      messageCount: m.group._count.messages,
      members: m.group.members.map((gm) => ({
        id: gm.user.id,
        name: gm.user.name,
        image: gm.user.image,
        role: gm.role,
      })),
      lastActiveAt: m.group.lastActiveAt,
      createdAt: m.group.createdAt,
      myRole: m.role,
    }));

    return NextResponse.json({ groups });
  } catch (error) {
    console.error("Error fetching groups:", error);
    return NextResponse.json(
      { error: "Failed to fetch groups" },
      { status: 500 }
    );
  }
}

// POST /api/groups - Create a new group
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title } = body;

    // Create group with creator as first member
    const group = await prisma.group.create({
      data: {
        title: title || null,
        createdById: session.user.id,
        canonicalState: JSON.stringify({
          goal: "",
          leadingOption: "",
          statusSummary: [],
          constraints: [],
          openQuestions: [],
          pendingDecisions: [],
          suggestedNextSteps: [],
          stage: "negotiating",
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: "system",
        }),
        members: {
          create: {
            userId: session.user.id,
            role: "creator",
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      group: {
        id: group.id,
        title: group.title,
        members: group.members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          image: m.user.image,
          role: m.role,
        })),
        createdAt: group.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating group:", error);
    return NextResponse.json(
      { error: "Failed to create group" },
      { status: 500 }
    );
  }
}
