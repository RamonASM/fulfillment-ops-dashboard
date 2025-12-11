import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';

// =============================================================================
// TYPES
// =============================================================================

export type QuantitySatisfaction = 'too_little' | 'just_right' | 'too_much';

export interface CreateFeedbackInput {
  productId: string;
  orderRequestId?: string;
  locationId?: string;
  submittedById: string;
  submittedByType: 'portal_user';
  qualityRating: number;
  deliveryRating?: number;
  valueRating?: number;
  wouldReorder?: boolean;
  usageNotes?: string;
  quantitySatisfaction?: QuantitySatisfaction;
  positiveComments?: string;
  improvementSuggestions?: string;
  photos?: string[];
}

export interface FeedbackAnalytics {
  totalFeedback: number;
  avgQualityRating: number;
  avgDeliveryRating: number;
  avgValueRating: number;
  wouldReorderRate: number;
  quantitySatisfactionBreakdown: {
    tooLittle: number;
    justRight: number;
    tooMuch: number;
  };
  topRatedProducts: Array<{
    productId: string;
    productName: string;
    avgRating: number;
    feedbackCount: number;
  }>;
  recentFeedback: Array<{
    id: string;
    productName: string;
    qualityRating: number;
    positiveComments?: string;
    createdAt: Date;
  }>;
}

// =============================================================================
// FEEDBACK SERVICE
// =============================================================================

/**
 * Create product feedback
 */
export async function createFeedback(input: CreateFeedbackInput) {
  const feedback = await prisma.productFeedback.create({
    data: {
      productId: input.productId,
      orderRequestId: input.orderRequestId,
      locationId: input.locationId,
      submittedById: input.submittedById,
      submittedByType: input.submittedByType,
      qualityRating: input.qualityRating,
      deliveryRating: input.deliveryRating,
      valueRating: input.valueRating,
      wouldReorder: input.wouldReorder,
      usageNotes: input.usageNotes,
      quantitySatisfaction: input.quantitySatisfaction,
      positiveComments: input.positiveComments,
      improvementSuggestions: input.improvementSuggestions,
      photos: input.photos || [],
    },
    include: {
      product: {
        select: {
          id: true,
          productId: true,
          name: true,
        },
      },
    },
  });

  // Update product feedback stats
  await updateProductFeedbackStats(input.productId);

  return feedback;
}

/**
 * Get feedback for a product
 */
export async function getProductFeedback(
  productId: string,
  options?: {
    limit?: number;
    offset?: number;
    includePhotos?: boolean;
  }
) {
  const [feedback, total] = await Promise.all([
    prisma.productFeedback.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 20,
      skip: options?.offset || 0,
      include: {
        location: {
          select: { id: true, name: true, code: true },
        },
      },
    }),
    prisma.productFeedback.count({ where: { productId } }),
  ]);

  return { feedback, total };
}

/**
 * Get all feedback for a client
 */
export async function getClientFeedback(
  clientId: string,
  options?: {
    productId?: string;
    locationId?: string;
    minRating?: number;
    limit?: number;
    offset?: number;
  }
) {
  const where: Prisma.ProductFeedbackWhereInput = {
    product: { clientId },
  };

  if (options?.productId) {
    where.productId = options.productId;
  }

  if (options?.locationId) {
    where.locationId = options.locationId;
  }

  if (options?.minRating) {
    where.qualityRating = { gte: options.minRating };
  }

  const [feedback, total] = await Promise.all([
    prisma.productFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      include: {
        product: {
          select: {
            id: true,
            productId: true,
            name: true,
          },
        },
        location: {
          select: { id: true, name: true, code: true },
        },
      },
    }),
    prisma.productFeedback.count({ where }),
  ]);

  return { feedback, total };
}

/**
 * Get feedback analytics for a client
 */
export async function getClientFeedbackAnalytics(clientId: string): Promise<FeedbackAnalytics> {
  // Get all feedback for client's products
  const allFeedback = await prisma.productFeedback.findMany({
    where: {
      product: { clientId },
    },
    include: {
      product: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (allFeedback.length === 0) {
    return {
      totalFeedback: 0,
      avgQualityRating: 0,
      avgDeliveryRating: 0,
      avgValueRating: 0,
      wouldReorderRate: 0,
      quantitySatisfactionBreakdown: {
        tooLittle: 0,
        justRight: 0,
        tooMuch: 0,
      },
      topRatedProducts: [],
      recentFeedback: [],
    };
  }

  // Calculate averages
  const qualityRatings = allFeedback.map((f) => f.qualityRating);
  const deliveryRatings = allFeedback.filter((f) => f.deliveryRating).map((f) => f.deliveryRating!);
  const valueRatings = allFeedback.filter((f) => f.valueRating).map((f) => f.valueRating!);
  const wouldReorders = allFeedback.filter((f) => f.wouldReorder !== null);

  const avgQualityRating =
    qualityRatings.reduce((a, b) => a + b, 0) / qualityRatings.length;
  const avgDeliveryRating =
    deliveryRatings.length > 0
      ? deliveryRatings.reduce((a, b) => a + b, 0) / deliveryRatings.length
      : 0;
  const avgValueRating =
    valueRatings.length > 0
      ? valueRatings.reduce((a, b) => a + b, 0) / valueRatings.length
      : 0;
  const wouldReorderRate =
    wouldReorders.length > 0
      ? wouldReorders.filter((f) => f.wouldReorder).length / wouldReorders.length
      : 0;

  // Quantity satisfaction breakdown
  const quantitySatisfactionBreakdown = {
    tooLittle: allFeedback.filter((f) => f.quantitySatisfaction === 'too_little').length,
    justRight: allFeedback.filter((f) => f.quantitySatisfaction === 'just_right').length,
    tooMuch: allFeedback.filter((f) => f.quantitySatisfaction === 'too_much').length,
  };

  // Group feedback by product for top rated
  const productFeedback = new Map<string, { name: string; ratings: number[]; count: number }>();
  for (const f of allFeedback) {
    const existing = productFeedback.get(f.productId);
    if (existing) {
      existing.ratings.push(f.qualityRating);
      existing.count++;
    } else {
      productFeedback.set(f.productId, {
        name: f.product.name,
        ratings: [f.qualityRating],
        count: 1,
      });
    }
  }

  const topRatedProducts = Array.from(productFeedback.entries())
    .map(([productId, data]) => ({
      productId,
      productName: data.name,
      avgRating: data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length,
      feedbackCount: data.count,
    }))
    .filter((p) => p.feedbackCount >= 2) // At least 2 reviews
    .sort((a, b) => b.avgRating - a.avgRating)
    .slice(0, 10);

  // Recent feedback
  const recentFeedback = allFeedback.slice(0, 10).map((f) => ({
    id: f.id,
    productName: f.product.name,
    qualityRating: f.qualityRating,
    positiveComments: f.positiveComments || undefined,
    createdAt: f.createdAt,
  }));

  return {
    totalFeedback: allFeedback.length,
    avgQualityRating: Math.round(avgQualityRating * 10) / 10,
    avgDeliveryRating: Math.round(avgDeliveryRating * 10) / 10,
    avgValueRating: Math.round(avgValueRating * 10) / 10,
    wouldReorderRate: Math.round(wouldReorderRate * 100),
    quantitySatisfactionBreakdown,
    topRatedProducts,
    recentFeedback,
  };
}

/**
 * Get products pending feedback for a portal user
 * Returns products from recent fulfilled orders that haven't been reviewed yet
 */
export async function getPendingFeedbackProducts(
  portalUserId: string,
  clientId: string,
  options?: { limit?: number }
) {
  // Get fulfilled orders in last 60 days
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const recentOrders = await prisma.orderRequest.findMany({
    where: {
      clientId,
      status: 'fulfilled',
      fulfilledAt: { gte: sixtyDaysAgo },
    },
    include: {
      orderRequestItems: {
        include: {
          product: {
            select: {
              id: true,
              productId: true,
              name: true,
              itemType: true,
            },
          },
        },
      },
    },
    orderBy: { fulfilledAt: 'desc' },
    take: 20,
  }) as any;

  // Get feedback already submitted by this user
  const existingFeedback = await prisma.productFeedback.findMany({
    where: {
      submittedById: portalUserId,
      submittedByType: 'portal_user',
      createdAt: { gte: sixtyDaysAgo },
    },
    select: {
      productId: true,
      orderRequestId: true,
    },
  });

  const feedbackSet = new Set(
    existingFeedback.map((f) => `${f.productId}-${f.orderRequestId}`)
  );

  // Find products without feedback
  const pendingProducts: Array<{
    orderId: string;
    orderDate: Date;
    product: {
      id: string;
      productId: string;
      name: string;
      itemType: string | null;
    };
  }> = [];

  for (const order of recentOrders) {
    for (const item of order.orderRequestItems) {
      const key = `${item.productId}-${order.id}`;
      if (!feedbackSet.has(key)) {
        pendingProducts.push({
          orderId: order.id,
          orderDate: order.fulfilledAt!,
          product: item.product,
        });
      }
    }
  }

  return pendingProducts.slice(0, options?.limit || 10);
}

/**
 * Update product feedback stats (called after new feedback)
 */
async function updateProductFeedbackStats(productId: string) {
  const stats = await prisma.productFeedback.aggregate({
    where: { productId },
    _avg: {
      qualityRating: true,
      deliveryRating: true,
    },
    _count: true,
  });

  await prisma.product.update({
    where: { id: productId },
    data: {
      avgQualityRating: stats._avg.qualityRating || null,
      avgDeliveryRating: stats._avg.deliveryRating || null,
      feedbackCount: stats._count,
    },
  });
}

// =============================================================================
// RECOMMENDATION SERVICE
// =============================================================================

export interface ProductRecommendation {
  productId: string;
  productName: string;
  score: number;
  reason: string;
  metrics: {
    avgRating?: number;
    orderFrequency?: number;
    reorderRate?: number;
    trending?: boolean;
  };
}

/**
 * Get product recommendations for a client
 */
export async function getProductRecommendations(
  clientId: string,
  options?: {
    type?: 'trending' | 'top_rated' | 'low_stock_high_demand' | 'review_needed';
    limit?: number;
  }
): Promise<ProductRecommendation[]> {
  const type = options?.type || 'trending';
  const limit = options?.limit || 10;

  switch (type) {
    case 'trending':
      return getTrendingProducts(clientId, limit);
    case 'top_rated':
      return getTopRatedProducts(clientId, limit);
    case 'low_stock_high_demand':
      return getLowStockHighDemandProducts(clientId, limit);
    case 'review_needed':
      return getProductsNeedingReview(clientId, limit);
    default:
      return getTrendingProducts(clientId, limit);
  }
}

/**
 * Get trending products (high order frequency in recent period)
 */
async function getTrendingProducts(
  clientId: string,
  limit: number
): Promise<ProductRecommendation[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get order items from recent fulfilled orders
  const recentOrderItems = await prisma.orderRequestItem.findMany({
    where: {
      orderRequest: {
        clientId,
        status: 'fulfilled',
        fulfilledAt: { gte: thirtyDaysAgo },
      },
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          avgQualityRating: true,
          feedbackCount: true,
        },
      },
    },
  });

  // Group by product and count
  const productCounts = new Map<
    string,
    { product: { id: string; name: string; avgQualityRating: number | null }; count: number }
  >();

  for (const item of recentOrderItems) {
    const existing = productCounts.get(item.productId);
    if (existing) {
      existing.count++;
    } else {
      productCounts.set(item.productId, {
        product: item.product,
        count: 1,
      });
    }
  }

  return Array.from(productCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((p, index) => ({
      productId: p.product.id,
      productName: p.product.name,
      score: Math.max(100 - index * 10, 50),
      reason: `Ordered ${p.count} times in the last 30 days`,
      metrics: {
        avgRating: p.product.avgQualityRating || undefined,
        orderFrequency: p.count,
        trending: true,
      },
    }));
}

/**
 * Get top rated products
 */
async function getTopRatedProducts(
  clientId: string,
  limit: number
): Promise<ProductRecommendation[]> {
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
      feedbackCount: { gte: 2 }, // At least 2 reviews
      avgQualityRating: { gte: 4 }, // 4+ stars
    },
    orderBy: [{ avgQualityRating: 'desc' }, { feedbackCount: 'desc' }],
    take: limit,
    select: {
      id: true,
      name: true,
      avgQualityRating: true,
      feedbackCount: true,
    },
  });

  return products.map((p, index) => ({
    productId: p.id,
    productName: p.name,
    score: Math.max(100 - index * 5, 60),
    reason: `${p.avgQualityRating?.toFixed(1)} stars from ${p.feedbackCount} reviews`,
    metrics: {
      avgRating: p.avgQualityRating || undefined,
    },
  }));
}

/**
 * Get low stock products with high demand
 */
async function getLowStockHighDemandProducts(
  clientId: string,
  limit: number
): Promise<ProductRecommendation[]> {
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
      monthlyUsageUnits: { gt: 0 },
    },
    select: {
      id: true,
      name: true,
      currentStockPacks: true,
      packSize: true,
      reorderPointPacks: true,
      monthlyUsageUnits: true,
      avgQualityRating: true,
    },
  });

  // Calculate runway and filter for low stock
  const lowStockProducts = products
    .map((p) => {
      const currentUnits = p.currentStockPacks * p.packSize;
      const monthlyUsage = p.monthlyUsageUnits || 0;
      const weeksRemaining = monthlyUsage > 0 ? (currentUnits / monthlyUsage) * 4 : 999;
      const isLowStock = p.currentStockPacks <= (p.reorderPointPacks || 0) * 1.5;
      const isHighDemand = monthlyUsage > 0;

      return {
        ...p,
        weeksRemaining,
        isLowStock,
        isHighDemand,
        urgencyScore: isLowStock && isHighDemand ? 100 - Math.min(weeksRemaining * 10, 80) : 0,
      };
    })
    .filter((p) => p.isLowStock && p.isHighDemand)
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, limit);

  return lowStockProducts.map((p) => ({
    productId: p.id,
    productName: p.name,
    score: p.urgencyScore,
    reason: `Only ${Math.round(p.weeksRemaining)} weeks of stock remaining with active demand`,
    metrics: {
      avgRating: p.avgQualityRating || undefined,
    },
  }));
}

/**
 * Get products with low ratings that need attention
 */
async function getProductsNeedingReview(
  clientId: string,
  limit: number
): Promise<ProductRecommendation[]> {
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
      feedbackCount: { gte: 2 },
      avgQualityRating: { lt: 3 }, // Less than 3 stars
    },
    orderBy: { avgQualityRating: 'asc' },
    take: limit,
    select: {
      id: true,
      name: true,
      avgQualityRating: true,
      feedbackCount: true,
    },
  });

  // Get recent negative feedback
  const productIds = products.map((p) => p.id);
  const recentNegativeFeedback = await prisma.productFeedback.findMany({
    where: {
      productId: { in: productIds },
      qualityRating: { lt: 3 },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      productId: true,
      improvementSuggestions: true,
    },
  });

  const feedbackByProduct = new Map<string, string[]>();
  for (const f of recentNegativeFeedback) {
    if (f.improvementSuggestions) {
      const existing = feedbackByProduct.get(f.productId) || [];
      existing.push(f.improvementSuggestions);
      feedbackByProduct.set(f.productId, existing);
    }
  }

  return products.map((p) => ({
    productId: p.id,
    productName: p.name,
    score: Math.round((5 - (p.avgQualityRating || 0)) * 20),
    reason: `Averaging ${p.avgQualityRating?.toFixed(1)} stars - needs quality review`,
    metrics: {
      avgRating: p.avgQualityRating || undefined,
    },
  }));
}

/**
 * Calculate popularity score for a product
 */
export async function calculatePopularityScore(productId: string): Promise<number> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      avgQualityRating: true,
      feedbackCount: true,
      monthlyUsageUnits: true,
      _count: {
        select: {
          orderRequestItems: true,
        },
      },
    },
  });

  if (!product) return 0;

  // Weighted score calculation
  const ratingScore = (product.avgQualityRating || 3) * 10; // 0-50 points
  const feedbackScore = Math.min(product.feedbackCount * 2, 20); // 0-20 points
  const orderScore = Math.min(product._count.orderRequestItems * 2, 20); // 0-20 points
  const usageScore = product.monthlyUsageUnits ? Math.min(product.monthlyUsageUnits / 100, 10) : 0; // 0-10 points

  const totalScore = ratingScore + feedbackScore + orderScore + usageScore;

  // Update product with popularity score
  await prisma.product.update({
    where: { id: productId },
    data: { popularityScore: totalScore },
  });

  return totalScore;
}

/**
 * Batch update popularity scores for all products
 */
export async function updateAllPopularityScores(clientId?: string) {
  const where = clientId ? { clientId, isActive: true } : { isActive: true };

  const products = await prisma.product.findMany({
    where,
    select: { id: true },
  });

  for (const product of products) {
    await calculatePopularityScore(product.id);
  }

  return { updated: products.length };
}
