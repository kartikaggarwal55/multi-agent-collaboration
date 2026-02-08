// Maps/Places tools for venue discovery and directions
import Anthropic from "@anthropic-ai/sdk";
import {
  searchPlaces,
  getPlaceDetails,
  getDirections,
  formatPlaceSearchForDisplay,
  formatPlaceDetailsForDisplay,
  formatDirectionsForDisplay,
  PlaceResult,
  PlaceDetails,
  DirectionsResult,
} from "../maps";

// Maps tool names
const MAPS_TOOL_NAMES = ["maps_search_places", "maps_get_place_details", "maps_directions"];

/**
 * Check if a tool name is a Maps tool
 */
export function isMapsTool(toolName: string): boolean {
  return MAPS_TOOL_NAMES.includes(toolName);
}

/**
 * Maps tools definition
 */
export const MAPS_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "maps_search_places",
    description: `Search for places, restaurants, venues, or businesses. Returns up to 5 results with ratings, addresses, and Google Maps links.

Good queries:
- "vegetarian restaurants near Park Slope Brooklyn"
- "quiet coffee shops downtown Manhattan"
- "hiking trails Hudson Valley NY"
- "Italian restaurant Upper East Side cozy"
- "Nobu NYC" (specific restaurant name)

Tips:
- Include location in query for best results
- Be specific about cuisine, vibe, or type
- Can search by name or by description`,
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query including place type and location (e.g., 'vegetarian restaurants in Brooklyn')",
        },
        maxResults: {
          type: "number",
          description: "Maximum results to return (default 5, max 10)",
        },
      },
      required: ["query"],
    },
  } as unknown as Anthropic.Messages.Tool,
  {
    name: "maps_get_place_details",
    description: `Get detailed information about a specific place including hours, phone, website, and reviews. Use after searching to get more info about a place.`,
    input_schema: {
      type: "object" as const,
      properties: {
        placeId: {
          type: "string",
          description: "The place ID from a search result",
        },
      },
      required: ["placeId"],
    },
  } as unknown as Anthropic.Messages.Tool,
  {
    name: "maps_directions",
    description: `Get directions and travel time between two locations. Returns distance, duration, and a Google Maps directions link.`,
    input_schema: {
      type: "object" as const,
      properties: {
        origin: {
          type: "string",
          description: "Starting location (address or place name)",
        },
        destination: {
          type: "string",
          description: "Ending location (address or place name)",
        },
        mode: {
          type: "string",
          enum: ["driving", "walking", "transit", "bicycling"],
          description: "Travel mode (default: driving)",
        },
      },
      required: ["origin", "destination"],
    },
  } as unknown as Anthropic.Messages.Tool,
];

/**
 * Execute a Maps tool
 */
export async function executeMapsTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  if (toolName === "maps_search_places") {
    const { query, maxResults } = input as {
      query: string;
      maxResults?: number;
    };

    const result = await searchPlaces(query, {
      maxResults: Math.min(maxResults || 5, 10),
    });

    if ("error" in result) {
      if (result.code === "NO_API_KEY") {
        return `Maps search is not configured. Please set GOOGLE_MAPS_API_KEY in the environment.`;
      }
      return `Error searching places: ${result.error}`;
    }

    if (result.length === 0) {
      return `No places found matching: "${query}". Try a more specific or different search.`;
    }

    return formatPlaceSearchForDisplay(result);
  }

  if (toolName === "maps_get_place_details") {
    const { placeId } = input as { placeId: string };

    const result = await getPlaceDetails(placeId);

    if ("error" in result) {
      return `Error getting place details: ${result.error}`;
    }

    return formatPlaceDetailsForDisplay(result);
  }

  if (toolName === "maps_directions") {
    const { origin, destination, mode } = input as {
      origin: string;
      destination: string;
      mode?: "driving" | "walking" | "transit" | "bicycling";
    };

    const result = await getDirections(origin, destination, mode || "driving");

    if ("error" in result) {
      return `Error getting directions: ${result.error}`;
    }

    return formatDirectionsForDisplay(result);
  }

  return `Unknown Maps tool: ${toolName}`;
}

/**
 * Check if Maps is configured (API key present)
 */
export function isMapsConfigured(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

// Re-export types and utilities for convenience
export type { PlaceResult, PlaceDetails, DirectionsResult };
