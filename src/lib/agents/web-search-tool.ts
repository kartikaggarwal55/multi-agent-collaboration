/**
 * Web search tool for voice assistant.
 * Routes search queries through Anthropic's built-in web_search tool
 * so we don't need a separate search API key.
 */

import Anthropic from "@anthropic-ai/sdk";
import { stripCiteTags } from "@/lib/api-utils";

const anthropic = new Anthropic();
const SEARCH_MODEL = "claude-haiku-4-5";

export function isWebSearchTool(toolName: string): boolean {
  return toolName === "web_search";
}

/**
 * Execute a web search by routing through Anthropic's web_search tool.
 * Returns a concise summary of search results suitable for voice.
 */
export async function executeWebSearch(query: string): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: SEARCH_MODEL,
      max_tokens: 1024,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        } as unknown as Anthropic.Messages.Tool,
      ],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: `Search the web for: ${query}\n\nProvide a concise summary of the top results. Keep it brief and conversational — this will be read aloud by a voice assistant. Include specific facts, numbers, and names. Do not include URLs or links.`,
        },
      ],
    });

    // Collect all text blocks (Anthropic interleaves text with search results)
    let allText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        allText += block.text + "\n";
      }
    }

    // If model needed another round (tool_use response), continue the conversation
    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === "tool_use"
      );

      // Web search results are server-side — they're already in the response
      // Just need to continue so the model can summarize
      const hasOnlyWebSearch = toolUseBlocks.every(t => t.name === "web_search");

      if (hasOnlyWebSearch) {
        const followUp = await anthropic.messages.create({
          model: SEARCH_MODEL,
          max_tokens: 1024,
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 3,
            } as unknown as Anthropic.Messages.Tool,
          ],
          messages: [
            {
              role: "user",
              content: `Search the web for: ${query}\n\nProvide a concise summary of the top results. Keep it brief and conversational — this will be read aloud by a voice assistant. Include specific facts, numbers, and names. Do not include URLs or links.`,
            },
            { role: "assistant", content: response.content },
            {
              role: "user",
              content: "Now summarize the search results concisely for a voice assistant.",
            },
          ],
        });

        for (const block of followUp.content) {
          if (block.type === "text") {
            allText += block.text + "\n";
          }
        }
      }
    }

    const result = stripCiteTags(allText).trim();
    return result || "No results found for that search.";
  } catch (error) {
    console.error("Web search error:", error);
    return `Sorry, the web search failed. ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}
