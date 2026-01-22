import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  getUserProfile,
  updateUserProfile,
  ProfileChange,
} from "@/lib/profile";

const updateSchema = z.object({
  index: z.number().int().min(0),
  value: z.string().min(1).max(500),
});

const deleteSchema = z.object({
  index: z.number().int().min(0),
});

// PATCH - Update a single profile item
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { index, value } = parsed.data;
    const currentProfile = await getUserProfile(session.user.id);

    if (index >= currentProfile.length) {
      return new Response(
        JSON.stringify({ error: "Index out of bounds" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const oldValue = currentProfile[index];
    const newProfile = [...currentProfile];
    newProfile[index] = value;

    const change: ProfileChange = {
      type: "updated",
      before: oldValue,
      after: value,
      reason: "Manually edited by user",
      timestamp: new Date().toISOString(),
    };

    await updateUserProfile(session.user.id, newProfile, [change]);

    return new Response(
      JSON.stringify({ profile: newProfile }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error updating profile item:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// DELETE - Delete a single profile item
export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { index } = parsed.data;
    const currentProfile = await getUserProfile(session.user.id);

    if (index >= currentProfile.length) {
      return new Response(
        JSON.stringify({ error: "Index out of bounds" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const deletedItem = currentProfile[index];
    const newProfile = currentProfile.filter((_, i) => i !== index);

    const change: ProfileChange = {
      type: "removed",
      before: deletedItem,
      reason: "Manually removed by user",
      timestamp: new Date().toISOString(),
    };

    await updateUserProfile(session.user.id, newProfile, [change]);

    return new Response(
      JSON.stringify({ profile: newProfile }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error deleting profile item:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
