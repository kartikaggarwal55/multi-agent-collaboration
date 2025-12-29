// GET /api/room - Returns the demo room state

import { NextResponse } from "next/server";
import { getRoom } from "@/lib/store";

export async function GET() {
  try {
    const room = getRoom();
    return NextResponse.json({ room });
  } catch (error) {
    console.error("Error fetching room:", error);
    return NextResponse.json(
      { error: "Failed to fetch room state" },
      { status: 500 }
    );
  }
}
