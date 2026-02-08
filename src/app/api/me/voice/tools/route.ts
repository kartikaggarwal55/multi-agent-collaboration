/**
 * API route to execute voice session tool calls server-side.
 * Calendar, Gmail, and Maps tools require server-side API access.
 * Date tools are pure computation but kept here for consistency.
 */

import { auth } from "@/lib/auth";
import { isCalendarTool, executeCalendarTool } from "@/lib/agents/calendar-tools";
import { isGmailTool, executeGmailTool } from "@/lib/agents/gmail-tools";
import { isMapsTool, executeMapsTool } from "@/lib/agents/maps-tools";
import { isDateTool, executeDateTool } from "@/lib/agents/date-tools";
import { isWebSearchTool, executeWebSearch } from "@/lib/agents/web-search-tool";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { name, arguments: args } = await request.json();

    if (!name || typeof name !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing tool name" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const userId = session.user.id;
    let result: string;

    if (isCalendarTool(name)) {
      result = await executeCalendarTool(userId, name, args || {});
    } else if (isGmailTool(name)) {
      result = await executeGmailTool(userId, name, args || {});
    } else if (isMapsTool(name)) {
      result = await executeMapsTool(name, args || {});
    } else if (isDateTool(name)) {
      result = executeDateTool(name, args || {});
    } else if (isWebSearchTool(name)) {
      result = await executeWebSearch(args?.query || name);
    } else {
      result = `Unknown tool: ${name}`;
    }

    return new Response(
      JSON.stringify({ result }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Voice tool execution error:", error);
    return new Response(
      JSON.stringify({ error: "Tool execution failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
