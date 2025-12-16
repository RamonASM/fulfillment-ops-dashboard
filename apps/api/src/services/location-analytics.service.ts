// =============================================================================
// LOCATION ANALYTICS SERVICE
// Calculate performance metrics for client locations
// =============================================================================

import { prisma } from "../lib/prisma.js";
import { geocodeByCityState, isValidCoordinates } from "../lib/geocoding.js";
import { logger } from "../lib/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export interface LocationPerformance {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;

  // Performance metrics
  totalProducts: number;
  activeProducts: number;
  totalOrders: number;
  healthScore: number; // 0-100
  stockoutCount: number;
  criticalCount: number;

  // Stock status
  stockStatus: "healthy" | "watch" | "critical";
}

// =============================================================================
// LOCATION PERFORMANCE ANALYTICS
// =============================================================================

/**
 * Get performance metrics for all locations of a client
 */
export async function getLocationPerformance(
  clientId: string,
): Promise<LocationPerformance[]> {
  const locations = await prisma.location.findMany({
    where: {
      clientId,
      isActive: true,
    },
    include: {
      orderRequests: {
        where: {
          status: { in: ["approved", "fulfilled"] },
        },
        select: { id: true },
      },
      productFeedback: {
        select: {
          productId: true,
        },
      },
    },
  });

  const results: LocationPerformance[] = [];

  for (const location of locations) {
    // Get location-specific products (requested by users at this location)
    const locationOrders = await prisma.orderRequest.findMany({
      where: {
        locationId: location.id,
      },
      include: {
        orderRequestItems: {
          select: {
            productId: true,
          },
        },
      },
    });

    const productIds = new Set(
      locationOrders.flatMap((order) =>
        order.orderRequestItems.map((item) => item.productId),
      ),
    );

    // Get products with stock status
    const products = await prisma.product.findMany({
      where: {
        id: { in: Array.from(productIds) },
        clientId,
      },
      select: {
        id: true,
        isActive: true,
        currentStockPacks: true,
        packSize: true,
        reorderPointPacks: true,
        avgDailyUsage: true,
      },
    });

    // Calculate metrics
    let stockoutCount = 0;
    let criticalCount = 0;
    let totalHealthScore = 0;

    for (const product of products) {
      const currentStock = product.currentStockPacks * product.packSize;
      const reorderPoint = (product.reorderPointPacks || 0) * product.packSize;
      const avgDailyUsage = product.avgDailyUsage || 0;

      // Calculate health for this product
      let productHealth = 100;

      if (currentStock === 0) {
        productHealth = 0;
        stockoutCount++;
      } else if (reorderPoint > 0) {
        const percentOfReorder = (currentStock / reorderPoint) * 100;
        if (percentOfReorder <= 50) {
          productHealth = 25;
          criticalCount++;
        } else if (percentOfReorder <= 100) {
          productHealth = 50;
        } else if (percentOfReorder <= 150) {
          productHealth = 75;
        }
      } else if (avgDailyUsage > 0) {
        const daysRemaining = currentStock / avgDailyUsage;
        if (daysRemaining < 7) {
          productHealth = 25;
          criticalCount++;
        } else if (daysRemaining < 14) {
          productHealth = 50;
        } else if (daysRemaining < 30) {
          productHealth = 75;
        }
      }

      totalHealthScore += productHealth;
    }

    const activeProducts = products.filter((p) => p.isActive).length;
    const healthScore =
      products.length > 0
        ? Math.round(totalHealthScore / products.length)
        : 100;

    // Determine overall stock status
    let stockStatus: "healthy" | "watch" | "critical" = "healthy";
    if (stockoutCount > 0 || healthScore < 50) {
      stockStatus = "critical";
    } else if (criticalCount > 0 || healthScore < 75) {
      stockStatus = "watch";
    }

    // Get or geocode coordinates
    let latitude: number | null = null;
    let longitude: number | null = null;

    // Check if location has metadata with coordinates
    const metadata = location.metadata as Record<string, unknown>;
    if (metadata?.latitude && metadata?.longitude) {
      const lat = Number(metadata.latitude);
      const lng = Number(metadata.longitude);
      if (isValidCoordinates(lat, lng)) {
        latitude = lat;
        longitude = lng;
      }
    }

    // If no valid coordinates, geocode
    if (latitude === null || longitude === null) {
      if (location.city && location.state) {
        try {
          const geocoded = await geocodeByCityState(
            location.city,
            location.state,
          );
          if (geocoded) {
            latitude = geocoded.latitude;
            longitude = geocoded.longitude;

            // Cache coordinates in metadata
            await prisma.location.update({
              where: { id: location.id },
              data: {
                metadata: {
                  ...metadata,
                  latitude: geocoded.latitude,
                  longitude: geocoded.longitude,
                  geocodedAt: new Date().toISOString(),
                  geocodingConfidence: geocoded.confidence,
                },
              },
            });
          }
        } catch (error) {
          logger.error("Failed to geocode location", error as Error, {
            locationId: location.id,
            city: location.city,
            state: location.state,
          });
        }
      }
    }

    // Only include locations with valid coordinates
    if (latitude !== null && longitude !== null) {
      results.push({
        id: location.id,
        name: location.name,
        code: location.code,
        city: location.city || "Unknown",
        state: location.state || "Unknown",
        latitude,
        longitude,
        totalProducts: products.length,
        activeProducts,
        totalOrders: location.orderRequests.length,
        healthScore,
        stockoutCount,
        criticalCount,
        stockStatus,
      });
    }
  }

  return results;
}

/**
 * Get aggregated regional analytics for a client
 */
export async function getRegionalAnalytics(clientId: string): Promise<{
  totalLocations: number;
  healthyLocations: number;
  watchLocations: number;
  criticalLocations: number;
  averageHealthScore: number;
  topPerformingStates: Array<{
    state: string;
    count: number;
    avgHealthScore: number;
  }>;
}> {
  const locations = await getLocationPerformance(clientId);

  const totalLocations = locations.length;
  const healthyLocations = locations.filter(
    (l) => l.stockStatus === "healthy",
  ).length;
  const watchLocations = locations.filter(
    (l) => l.stockStatus === "watch",
  ).length;
  const criticalLocations = locations.filter(
    (l) => l.stockStatus === "critical",
  ).length;

  const averageHealthScore =
    locations.length > 0
      ? Math.round(
          locations.reduce((sum, l) => sum + l.healthScore, 0) /
            locations.length,
        )
      : 100;

  // Aggregate by state
  const stateMap = new Map<
    string,
    { count: number; totalHealthScore: number }
  >();

  for (const location of locations) {
    const existing = stateMap.get(location.state) || {
      count: 0,
      totalHealthScore: 0,
    };
    stateMap.set(location.state, {
      count: existing.count + 1,
      totalHealthScore: existing.totalHealthScore + location.healthScore,
    });
  }

  const topPerformingStates = Array.from(stateMap.entries())
    .map(([state, data]) => ({
      state,
      count: data.count,
      avgHealthScore: Math.round(data.totalHealthScore / data.count),
    }))
    .sort((a, b) => b.avgHealthScore - a.avgHealthScore)
    .slice(0, 10);

  return {
    totalLocations,
    healthyLocations,
    watchLocations,
    criticalLocations,
    averageHealthScore,
    topPerformingStates,
  };
}

export default {
  getLocationPerformance,
  getRegionalAnalytics,
};
