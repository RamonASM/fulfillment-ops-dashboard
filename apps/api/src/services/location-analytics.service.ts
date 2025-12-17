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

// Enhanced performance with combined scoring
export interface EnhancedLocationPerformance {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;

  // Combined performance
  performanceScore: number; // 0-100
  performanceRank: number;
  performanceTier: "excellent" | "good" | "average" | "needs-attention";

  // Component scores
  volumeScore: number;
  frequencyScore: number;
  healthScore: number;

  // Volume metrics
  totalOrders: number;
  totalUnits: number;
  volumePercentOfClient: number;

  // Frequency metrics
  orderFrequency: number; // orders per month
  frequencyConsistency: number;
  lastOrderDate: string | null;

  // Health metrics
  healthStatus: "healthy" | "watch" | "critical";
  totalProducts: number;
  stockoutCount: number;

  // Top products (expanded to 10)
  topProducts: Array<{
    productId: string;
    productName: string;
    totalUnits: number;
    percentOfLocationVolume: number;
    lastOrderDate: string | null;
  }>;
}

export interface RegionalPerformanceSummary {
  states: Array<{
    state: string;
    locationCount: number;
    avgPerformanceScore: number;
    totalOrders: number;
    totalUnits: number;
    topLocation: {
      id: string;
      name: string;
      performanceScore: number;
    };
    performanceTier: "excellent" | "good" | "average" | "needs-attention";
  }>;
  totalLocations: number;
  avgClientPerformance: number;
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

// =============================================================================
// ENHANCED LOCATION PERFORMANCE (COMBINED SCORING)
// =============================================================================

/**
 * Calculate volume score normalized to 0-100
 * Uses 90th percentile as max to handle outliers
 */
function calculateVolumeScore(locationUnits: number, maxUnits: number): number {
  if (maxUnits === 0) return 0;
  const score = (locationUnits / maxUnits) * 100;
  return Math.min(Math.round(score), 100);
}

/**
 * Calculate frequency score based on order consistency
 * Higher frequency and lower variance = higher score
 */
function calculateFrequencyScore(
  ordersPerMonth: number,
  intervalStdDev: number | null,
): number {
  // Base score from order frequency (0-10 orders/month mapped to 0-100)
  const baseScore = Math.min((ordersPerMonth / 10) * 100, 100);

  // Consistency bonus/penalty based on standard deviation
  if (intervalStdDev === null || ordersPerMonth < 3) {
    return Math.round(baseScore);
  }

  // Higher stddev = less consistent = penalty
  // Normalize stddev: 0-30 days is normal, >30 days is inconsistent
  const inconsistencyPenalty = Math.min((intervalStdDev / 30) * 20, 20);

  return Math.round(Math.max(baseScore - inconsistencyPenalty, 0));
}

/**
 * Calculate combined performance score
 * Weights: Volume 50%, Frequency 30%, Health 20%
 */
function calculateCombinedScore(
  volumeScore: number,
  frequencyScore: number,
  healthScore: number,
): number {
  const combined = volumeScore * 0.5 + frequencyScore * 0.3 + healthScore * 0.2;
  return Math.round(combined);
}

/**
 * Determine performance tier based on combined score
 */
function getPerformanceTier(
  score: number,
): "excellent" | "good" | "average" | "needs-attention" {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "average";
  return "needs-attention";
}

/**
 * Get enhanced location performance with combined scoring
 */
export async function getEnhancedLocationPerformance(
  clientId: string,
): Promise<EnhancedLocationPerformance[]> {
  // Get all locations with orders and products
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
        include: {
          orderRequestItems: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  currentStockPacks: true,
                  packSize: true,
                  reorderPointPacks: true,
                  avgDailyUsage: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  const results: EnhancedLocationPerformance[] = [];
  let maxUnits = 0;
  let totalClientUnits = 0;

  // First pass: calculate totals for normalization
  for (const location of locations) {
    const totalUnits = location.orderRequests.reduce(
      (sum, order) =>
        sum +
        order.orderRequestItems.reduce(
          (itemSum, item) => itemSum + (item.quantityUnits || 0),
          0,
        ),
      0,
    );
    maxUnits = Math.max(maxUnits, totalUnits);
    totalClientUnits += totalUnits;
  }

  // Use 90th percentile as max to handle outliers
  const sortedUnits = locations
    .map((l) =>
      l.orderRequests.reduce(
        (sum, order) =>
          sum +
          order.orderRequestItems.reduce(
            (itemSum, item) => itemSum + (item.quantityUnits || 0),
            0,
          ),
        0,
      ),
    )
    .sort((a, b) => b - a);
  const percentile90Index = Math.floor(sortedUnits.length * 0.1);
  const normalizedMax =
    percentile90Index < sortedUnits.length
      ? sortedUnits[percentile90Index]
      : maxUnits;

  // Second pass: calculate performance metrics
  for (const location of locations) {
    const orders = location.orderRequests;
    const totalOrders = orders.length;

    // Calculate volume metrics
    const totalUnits = orders.reduce(
      (sum, order) =>
        sum +
        order.orderRequestItems.reduce(
          (itemSum, item) => itemSum + (item.quantityUnits || 0),
          0,
        ),
      0,
    );
    const volumePercentOfClient =
      totalClientUnits > 0
        ? Math.round((totalUnits / totalClientUnits) * 100)
        : 0;

    // Calculate frequency metrics
    const orderDates = orders.map((o) => o.createdAt);
    const lastOrderDate =
      orderDates.length > 0 ? orderDates[orderDates.length - 1] : null;

    // Calculate active months
    const uniqueMonths = new Set(
      orderDates.map((date) => {
        const d = new Date(date);
        return `${d.getFullYear()}-${d.getMonth()}`;
      }),
    );
    const activeMonths = uniqueMonths.size || 1;
    const orderFrequency = totalOrders / activeMonths;

    // Calculate order interval standard deviation
    let intervalStdDev: number | null = null;
    if (orderDates.length >= 3) {
      const intervals: number[] = [];
      for (let i = 1; i < orderDates.length; i++) {
        const intervalDays =
          (orderDates[i].getTime() - orderDates[i - 1].getTime()) /
          (1000 * 60 * 60 * 24);
        intervals.push(intervalDays);
      }
      const avgInterval =
        intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const variance =
        intervals.reduce(
          (sum, val) => sum + Math.pow(val - avgInterval, 2),
          0,
        ) / intervals.length;
      intervalStdDev = Math.sqrt(variance);
    }

    // Get top 10 products
    const productMap = new Map<
      string,
      {
        id: string;
        name: string;
        totalUnits: number;
        lastOrderDate: Date | null;
      }
    >();

    for (const order of orders) {
      for (const item of order.orderRequestItems) {
        const existing = productMap.get(item.productId) || {
          id: item.productId,
          name: item.product.name,
          totalUnits: 0,
          lastOrderDate: null,
        };
        existing.totalUnits += item.quantityUnits || 0;
        if (
          !existing.lastOrderDate ||
          order.createdAt > existing.lastOrderDate
        ) {
          existing.lastOrderDate = order.createdAt;
        }
        productMap.set(item.productId, existing);
      }
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.totalUnits - a.totalUnits)
      .slice(0, 10)
      .map((p) => ({
        productId: p.id,
        productName: p.name,
        totalUnits: p.totalUnits,
        percentOfLocationVolume:
          totalUnits > 0 ? Math.round((p.totalUnits / totalUnits) * 100) : 0,
        lastOrderDate: p.lastOrderDate ? p.lastOrderDate.toISOString() : null,
      }));

    // Calculate health score (reuse existing logic)
    const products = Array.from(
      new Set(orders.flatMap((o) => o.orderRequestItems.map((i) => i.product))),
    );
    let stockoutCount = 0;
    let totalHealthScore = 0;

    for (const product of products) {
      const currentStock = product.currentStockPacks * product.packSize;
      const reorderPoint = (product.reorderPointPacks || 0) * product.packSize;
      const avgDailyUsage = product.avgDailyUsage || 0;

      let productHealth = 100;

      if (currentStock === 0) {
        productHealth = 0;
        stockoutCount++;
      } else if (reorderPoint > 0) {
        const percentOfReorder = (currentStock / reorderPoint) * 100;
        if (percentOfReorder <= 50) {
          productHealth = 25;
        } else if (percentOfReorder <= 100) {
          productHealth = 50;
        } else if (percentOfReorder <= 150) {
          productHealth = 75;
        }
      } else if (avgDailyUsage > 0) {
        const daysRemaining = currentStock / avgDailyUsage;
        if (daysRemaining < 7) {
          productHealth = 25;
        } else if (daysRemaining < 14) {
          productHealth = 50;
        } else if (daysRemaining < 30) {
          productHealth = 75;
        }
      }

      totalHealthScore += productHealth;
    }

    const healthScore =
      products.length > 0
        ? Math.round(totalHealthScore / products.length)
        : 100;

    const healthStatus: "healthy" | "watch" | "critical" =
      stockoutCount > 0 || healthScore < 50
        ? "critical"
        : healthScore < 75
          ? "watch"
          : "healthy";

    // Calculate component scores
    const volumeScore = calculateVolumeScore(totalUnits, normalizedMax);
    const frequencyScore = calculateFrequencyScore(
      orderFrequency,
      intervalStdDev,
    );
    const performanceScore = calculateCombinedScore(
      volumeScore,
      frequencyScore,
      healthScore,
    );
    const performanceTier = getPerformanceTier(performanceScore);

    results.push({
      id: location.id,
      name: location.name,
      code: location.code,
      city: location.city || "Unknown",
      state: location.state || "Unknown",
      performanceScore,
      performanceRank: 0, // Will be set after sorting
      performanceTier,
      volumeScore,
      frequencyScore,
      healthScore,
      totalOrders,
      totalUnits,
      volumePercentOfClient,
      orderFrequency: Math.round(orderFrequency * 10) / 10,
      frequencyConsistency:
        intervalStdDev !== null
          ? 100 - Math.min((intervalStdDev / 30) * 100, 100)
          : 100,
      lastOrderDate: lastOrderDate ? lastOrderDate.toISOString() : null,
      healthStatus,
      totalProducts: products.length,
      stockoutCount,
      topProducts,
    });
  }

  // Sort by performance score and assign ranks
  results.sort((a, b) => b.performanceScore - a.performanceScore);
  results.forEach((location, index) => {
    location.performanceRank = index + 1;
  });

  return results;
}

/**
 * Get regional performance summary aggregated by state
 */
export async function getRegionalPerformanceSummary(
  clientId: string,
): Promise<RegionalPerformanceSummary> {
  const locations = await getEnhancedLocationPerformance(clientId);

  // Aggregate by state
  const stateMap = new Map<
    string,
    {
      locations: EnhancedLocationPerformance[];
      totalOrders: number;
      totalUnits: number;
      totalScore: number;
    }
  >();

  for (const location of locations) {
    const existing = stateMap.get(location.state) || {
      locations: [],
      totalOrders: 0,
      totalUnits: 0,
      totalScore: 0,
    };
    existing.locations.push(location);
    existing.totalOrders += location.totalOrders;
    existing.totalUnits += location.totalUnits;
    existing.totalScore += location.performanceScore;
    stateMap.set(location.state, existing);
  }

  const states = Array.from(stateMap.entries())
    .map(([state, data]) => {
      const avgScore = Math.round(data.totalScore / data.locations.length);
      const topLocation = data.locations.reduce((top, loc) =>
        loc.performanceScore > top.performanceScore ? loc : top,
      );

      return {
        state,
        locationCount: data.locations.length,
        avgPerformanceScore: avgScore,
        totalOrders: data.totalOrders,
        totalUnits: data.totalUnits,
        topLocation: {
          id: topLocation.id,
          name: topLocation.name,
          performanceScore: topLocation.performanceScore,
        },
        performanceTier: getPerformanceTier(avgScore),
      };
    })
    .sort((a, b) => b.avgPerformanceScore - a.avgPerformanceScore);

  const avgClientPerformance =
    locations.length > 0
      ? Math.round(
          locations.reduce((sum, l) => sum + l.performanceScore, 0) /
            locations.length,
        )
      : 0;

  return {
    states,
    totalLocations: locations.length,
    avgClientPerformance,
  };
}

export default {
  getLocationPerformance,
  getRegionalAnalytics,
  getEnhancedLocationPerformance,
  getRegionalPerformanceSummary,
};
