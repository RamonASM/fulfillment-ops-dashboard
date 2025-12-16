// =============================================================================
// GEOCODING UTILITY
// Convert addresses to latitude/longitude coordinates
// =============================================================================

import { logger } from "./logger.js";

// =============================================================================
// TYPES
// =============================================================================

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress?: string;
  confidence?: string; // 'high' | 'medium' | 'low'
}

// =============================================================================
// STATE COORDINATES (Fallback for state-only addresses)
// =============================================================================

const STATE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  AL: { lat: 32.806671, lng: -86.79113 }, // Alabama
  AK: { lat: 61.370716, lng: -152.404419 }, // Alaska
  AZ: { lat: 33.729759, lng: -111.431221 }, // Arizona
  AR: { lat: 34.969704, lng: -92.373123 }, // Arkansas
  CA: { lat: 36.116203, lng: -119.681564 }, // California
  CO: { lat: 39.059811, lng: -105.311104 }, // Colorado
  CT: { lat: 41.597782, lng: -72.755371 }, // Connecticut
  DE: { lat: 39.318523, lng: -75.507141 }, // Delaware
  FL: { lat: 27.766279, lng: -81.686783 }, // Florida
  GA: { lat: 33.040619, lng: -83.643074 }, // Georgia
  HI: { lat: 21.094318, lng: -157.498337 }, // Hawaii
  ID: { lat: 44.240459, lng: -114.478828 }, // Idaho
  IL: { lat: 40.349457, lng: -88.986137 }, // Illinois
  IN: { lat: 39.849426, lng: -86.258278 }, // Indiana
  IA: { lat: 42.011539, lng: -93.210526 }, // Iowa
  KS: { lat: 38.5266, lng: -96.726486 }, // Kansas
  KY: { lat: 37.66814, lng: -84.670067 }, // Kentucky
  LA: { lat: 31.169546, lng: -91.867805 }, // Louisiana
  ME: { lat: 44.693947, lng: -69.381927 }, // Maine
  MD: { lat: 39.063946, lng: -76.802101 }, // Maryland
  MA: { lat: 42.230171, lng: -71.530106 }, // Massachusetts
  MI: { lat: 43.326618, lng: -84.536095 }, // Michigan
  MN: { lat: 45.694454, lng: -93.900192 }, // Minnesota
  MS: { lat: 32.741646, lng: -89.678696 }, // Mississippi
  MO: { lat: 38.456085, lng: -92.288368 }, // Missouri
  MT: { lat: 46.921925, lng: -110.454353 }, // Montana
  NE: { lat: 41.12537, lng: -98.268082 }, // Nebraska
  NV: { lat: 38.313515, lng: -117.055374 }, // Nevada
  NH: { lat: 43.452492, lng: -71.563896 }, // New Hampshire
  NJ: { lat: 40.298904, lng: -74.521011 }, // New Jersey
  NM: { lat: 34.840515, lng: -106.248482 }, // New Mexico
  NY: { lat: 42.165726, lng: -74.948051 }, // New York
  NC: { lat: 35.630066, lng: -79.806419 }, // North Carolina
  ND: { lat: 47.528912, lng: -99.784012 }, // North Dakota
  OH: { lat: 40.388783, lng: -82.764915 }, // Ohio
  OK: { lat: 35.565342, lng: -96.928917 }, // Oklahoma
  OR: { lat: 44.572021, lng: -122.070938 }, // Oregon
  PA: { lat: 40.590752, lng: -77.209755 }, // Pennsylvania
  RI: { lat: 41.680893, lng: -71.51178 }, // Rhode Island
  SC: { lat: 33.856892, lng: -80.945007 }, // South Carolina
  SD: { lat: 44.299782, lng: -99.438828 }, // South Dakota
  TN: { lat: 35.747845, lng: -86.692345 }, // Tennessee
  TX: { lat: 31.054487, lng: -97.563461 }, // Texas
  UT: { lat: 40.150032, lng: -111.862434 }, // Utah
  VT: { lat: 44.045876, lng: -72.710686 }, // Vermont
  VA: { lat: 37.769337, lng: -78.169968 }, // Virginia
  WA: { lat: 47.400902, lng: -121.490494 }, // Washington
  WV: { lat: 38.491226, lng: -80.954453 }, // West Virginia
  WI: { lat: 44.268543, lng: -89.616508 }, // Wisconsin
  WY: { lat: 42.755966, lng: -107.30249 }, // Wyoming
  DC: { lat: 38.907192, lng: -77.036871 }, // Washington D.C.
};

// =============================================================================
// GEOCODING FUNCTIONS
// =============================================================================

/**
 * Geocode an address using OpenStreetMap Nominatim API (free, no API key needed)
 * Rate limit: 1 request per second
 */
export async function geocodeAddress(
  address: string,
  city?: string,
  state?: string,
  zipCode?: string,
): Promise<GeocodingResult | null> {
  try {
    // Build the query string
    const parts: string[] = [];
    if (address) parts.push(address);
    if (city) parts.push(city);
    if (state) parts.push(state);
    if (zipCode) parts.push(zipCode);

    const query = parts.join(", ");

    if (!query.trim()) {
      return null;
    }

    // Use Nominatim API (OpenStreetMap)
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "us"); // US only for now

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Inventory-Intelligence-Platform/1.0", // Required by Nominatim
      },
    });

    if (!response.ok) {
      logger.error(
        "Geocoding API request failed",
        new Error(`HTTP ${response.status}`),
      );
      return getFallbackCoordinates(city, state);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      logger.warn("No geocoding results found", { address, city, state });
      return getFallbackCoordinates(city, state);
    }

    const result = data[0];

    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      formattedAddress: result.display_name,
      confidence:
        result.importance > 0.7
          ? "high"
          : result.importance > 0.4
            ? "medium"
            : "low",
    };
  } catch (error) {
    logger.error("Geocoding failed", error as Error, { address, city, state });
    return getFallbackCoordinates(city, state);
  }
}

/**
 * Get fallback coordinates based on city/state (uses state center if no match)
 */
function getFallbackCoordinates(
  city?: string,
  state?: string,
): GeocodingResult | null {
  if (!state) return null;

  const stateCode = state.toUpperCase();
  const coords = STATE_COORDINATES[stateCode];

  if (!coords) {
    logger.warn("Unknown state code for fallback", { state });
    return null;
  }

  return {
    latitude: coords.lat,
    longitude: coords.lng,
    formattedAddress: city ? `${city}, ${state}` : state,
    confidence: "low", // Fallback has low confidence
  };
}

/**
 * Batch geocode multiple addresses with rate limiting
 */
export async function batchGeocodeAddresses(
  addresses: Array<{
    id: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }>,
): Promise<Map<string, GeocodingResult>> {
  const results = new Map<string, GeocodingResult>();

  for (const addr of addresses) {
    try {
      const result = await geocodeAddress(
        addr.address || "",
        addr.city,
        addr.state,
        addr.zipCode,
      );

      if (result) {
        results.set(addr.id, result);
      }

      // Rate limiting: 1 request per second for Nominatim
      await new Promise((resolve) => setTimeout(resolve, 1100));
    } catch (error) {
      logger.error("Batch geocoding failed for address", error as Error, {
        addressId: addr.id,
      });
    }
  }

  return results;
}

/**
 * Get coordinates from city and state (uses state center as fallback)
 */
export async function geocodeByCityState(
  city: string,
  state: string,
): Promise<GeocodingResult | null> {
  return geocodeAddress("", city, state);
}

/**
 * Validate coordinates
 */
export function isValidCoordinates(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export default {
  geocodeAddress,
  batchGeocodeAddresses,
  geocodeByCityState,
  isValidCoordinates,
  STATE_COORDINATES,
};
