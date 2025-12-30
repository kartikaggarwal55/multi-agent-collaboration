// Google Maps/Places service for location search and venue discovery

// Types
export interface PlaceResult {
  placeId: string;
  name: string;
  formattedAddress: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  types?: string[];
  website?: string;
  phone?: string;
  openNow?: boolean;
  mapsUrl: string;
}

export interface PlaceDetails extends PlaceResult {
  openingHours?: string[];
  reviews?: Array<{
    authorName: string;
    rating: number;
    text: string;
    time: string;
  }>;
}

export interface DirectionsResult {
  origin: string;
  destination: string;
  distanceText: string;
  durationText: string;
  mode: string;
  mapsUrl: string;
}

export interface MapsError {
  error: string;
  code?: string;
}

// Get API key from environment
function getApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY || null;
}

/**
 * Generate Google Maps URL for a place
 */
export function getMapsPlaceUrl(
  name: string,
  address: string,
  placeId?: string
): string {
  const query = encodeURIComponent(`${name} ${address}`);
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${placeId}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/**
 * Generate Google Maps directions URL
 */
export function getMapsDirectionsUrl(
  origin: string,
  destination: string,
  mode: string = "driving"
): string {
  const originEnc = encodeURIComponent(origin);
  const destEnc = encodeURIComponent(destination);
  return `https://www.google.com/maps/dir/?api=1&origin=${originEnc}&destination=${destEnc}&travelmode=${mode}`;
}

/**
 * Convert price level to human readable
 */
function formatPriceLevel(level: number | undefined): string {
  if (level === undefined) return "";
  return "$".repeat(level) || "$";
}

/**
 * Search for places using Google Places Text Search API
 */
export async function searchPlaces(
  query: string,
  options: {
    near?: { lat: number; lng: number };
    nearText?: string;
    maxResults?: number;
  } = {}
): Promise<PlaceResult[] | MapsError> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      error: "Google Maps API key not configured. Set GOOGLE_MAPS_API_KEY in environment.",
      code: "NO_API_KEY",
    };
  }

  try {
    // Build the query with location context
    let searchQuery = query;
    if (options.nearText) {
      searchQuery = `${query} near ${options.nearText}`;
    }

    // Use Places API Text Search
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", searchQuery);
    url.searchParams.set("key", apiKey);

    // Add location bias if coordinates provided
    if (options.near) {
      url.searchParams.set("location", `${options.near.lat},${options.near.lng}`);
      url.searchParams.set("radius", "10000"); // 10km radius
    }

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error("Places API error:", data.status, data.error_message);
      return {
        error: data.error_message || `Places API error: ${data.status}`,
        code: data.status,
      };
    }

    const results = (data.results || []).slice(0, options.maxResults || 5);

    return results.map((place: {
      place_id: string;
      name: string;
      formatted_address: string;
      rating?: number;
      user_ratings_total?: number;
      price_level?: number;
      types?: string[];
      opening_hours?: { open_now?: boolean };
    }) => ({
      placeId: place.place_id,
      name: place.name,
      formattedAddress: place.formatted_address,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      priceLevel: place.price_level,
      types: place.types,
      openNow: place.opening_hours?.open_now,
      mapsUrl: getMapsPlaceUrl(place.name, place.formatted_address, place.place_id),
    }));
  } catch (error) {
    console.error("Error searching places:", error);
    return {
      error: "Failed to search places",
    };
  }
}

/**
 * Get detailed information about a place
 */
export async function getPlaceDetails(
  placeId: string
): Promise<PlaceDetails | MapsError> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      error: "Google Maps API key not configured",
      code: "NO_API_KEY",
    };
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("key", apiKey);
    url.searchParams.set(
      "fields",
      "place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,price_level,types,opening_hours,reviews"
    );

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== "OK") {
      console.error("Place Details API error:", data.status, data.error_message);
      return {
        error: data.error_message || `Place Details API error: ${data.status}`,
        code: data.status,
      };
    }

    const place = data.result;

    return {
      placeId: place.place_id,
      name: place.name,
      formattedAddress: place.formatted_address,
      phone: place.formatted_phone_number,
      website: place.website,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      priceLevel: place.price_level,
      types: place.types,
      openNow: place.opening_hours?.open_now,
      openingHours: place.opening_hours?.weekday_text,
      mapsUrl: getMapsPlaceUrl(place.name, place.formatted_address, place.place_id),
      reviews: place.reviews?.slice(0, 3).map((r: {
        author_name: string;
        rating: number;
        text: string;
        relative_time_description: string;
      }) => ({
        authorName: r.author_name,
        rating: r.rating,
        text: r.text.slice(0, 200),
        time: r.relative_time_description,
      })),
    };
  } catch (error) {
    console.error("Error getting place details:", error);
    return {
      error: "Failed to get place details",
    };
  }
}

/**
 * Get directions between two places
 */
export async function getDirections(
  origin: string,
  destination: string,
  mode: "driving" | "walking" | "transit" | "bicycling" = "driving"
): Promise<DirectionsResult | MapsError> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      error: "Google Maps API key not configured",
      code: "NO_API_KEY",
    };
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    url.searchParams.set("mode", mode);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== "OK") {
      console.error("Directions API error:", data.status, data.error_message);
      return {
        error: data.error_message || `Directions API error: ${data.status}`,
        code: data.status,
      };
    }

    const route = data.routes[0];
    const leg = route?.legs[0];

    if (!leg) {
      return { error: "No route found" };
    }

    return {
      origin: leg.start_address,
      destination: leg.end_address,
      distanceText: leg.distance.text,
      durationText: leg.duration.text,
      mode,
      mapsUrl: getMapsDirectionsUrl(origin, destination, mode),
    };
  } catch (error) {
    console.error("Error getting directions:", error);
    return {
      error: "Failed to get directions",
    };
  }
}

/**
 * Format place search results for display
 */
export function formatPlaceSearchForDisplay(places: PlaceResult[]): string {
  if (places.length === 0) {
    return "No places found matching your search.";
  }

  return places
    .map((place, i) => {
      let line = `${i + 1}. **[${place.name}](${place.mapsUrl})**`;
      if (place.rating) {
        line += ` - ${place.rating}`;
        if (place.userRatingsTotal) {
          line += ` (${place.userRatingsTotal} reviews)`;
        }
      }
      if (place.priceLevel) {
        line += ` ${formatPriceLevel(place.priceLevel)}`;
      }
      line += `\n   ${place.formattedAddress}`;
      if (place.openNow !== undefined) {
        line += place.openNow ? " - *Open now*" : " - *Closed*";
      }
      return line;
    })
    .join("\n\n");
}

/**
 * Format place details for display
 */
export function formatPlaceDetailsForDisplay(place: PlaceDetails): string {
  let output = `**[${place.name}](${place.mapsUrl})**\n\n`;
  output += `**Address:** ${place.formattedAddress}\n`;

  if (place.phone) {
    output += `**Phone:** ${place.phone}\n`;
  }
  if (place.website) {
    output += `**Website:** [Visit website](${place.website})\n`;
  }
  if (place.rating) {
    output += `**Rating:** ${place.rating}`;
    if (place.userRatingsTotal) {
      output += ` (${place.userRatingsTotal} reviews)`;
    }
    output += "\n";
  }
  if (place.priceLevel) {
    output += `**Price:** ${formatPriceLevel(place.priceLevel)}\n`;
  }

  if (place.openingHours && place.openingHours.length > 0) {
    output += `\n**Hours:**\n`;
    for (const hours of place.openingHours) {
      output += `- ${hours}\n`;
    }
  }

  if (place.reviews && place.reviews.length > 0) {
    output += `\n**Recent Reviews:**\n`;
    for (const review of place.reviews) {
      output += `- "${review.text}..." - ${review.authorName} (${review.rating} stars, ${review.time})\n`;
    }
  }

  return output;
}

/**
 * Format directions for display
 */
export function formatDirectionsForDisplay(directions: DirectionsResult): string {
  let output = `**[Directions from ${directions.origin} to ${directions.destination}](${directions.mapsUrl})**\n\n`;
  output += `**Distance:** ${directions.distanceText}\n`;
  output += `**Duration:** ${directions.durationText} (by ${directions.mode})\n`;
  return output;
}
