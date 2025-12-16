// =============================================================================
// ORDER TIMING SERVICE
// Calculate "order by" dates based on stock levels, usage, and lead times
// =============================================================================

import { prisma } from "../lib/prisma.js";
import type { Product, Client } from "@prisma/client";

// =============================================================================
// TYPES
// =============================================================================

export type UrgencyLevel =
  | "safe"
  | "upcoming"
  | "soon"
  | "critical"
  | "overdue";

export interface OrderTimingResult {
  productId: string;
  productName: string;
  productCode: string;
  currentStockUnits: number;
  avgDailyUsage: number;
  daysOfStockRemaining: number | null;
  projectedStockoutDate: Date | null;
  totalLeadTimeDays: number;
  lastOrderByDate: Date | null;
  daysUntilOrderDeadline: number | null;
  urgencyLevel: UrgencyLevel;
  urgencyMessage: string;
  leadTimeBreakdown: {
    supplierDays: number;
    shippingDays: number;
    processingDays: number;
    safetyBufferDays: number;
  };
}

export interface ClientTimingDefaults {
  defaultSupplierLeadDays: number;
  defaultShippingDays: number;
  defaultProcessingDays: number;
  defaultSafetyBufferDays: number;
  alertDaysBeforeDeadline: number[];
}

export interface DeadlineAlert {
  productId: string;
  productName: string;
  productCode: string;
  clientId: string;
  clientName: string;
  lastOrderByDate: Date;
  daysUntilDeadline: number;
  urgencyLevel: UrgencyLevel;
  currentStockUnits: number;
  projectedStockoutDate: Date;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const DEFAULT_TIMING_SETTINGS: ClientTimingDefaults = {
  defaultSupplierLeadDays: 7,
  defaultShippingDays: 5,
  defaultProcessingDays: 1,
  defaultSafetyBufferDays: 2,
  alertDaysBeforeDeadline: [14, 7, 3, 1],
};

// =============================================================================
// CORE CALCULATIONS
// =============================================================================

/**
 * Calculate the projected stockout date based on current stock and daily usage
 */
export function calculateStockoutDate(
  currentStockUnits: number,
  avgDailyUsage: number,
): { date: Date | null; daysRemaining: number | null } {
  if (avgDailyUsage <= 0) {
    return { date: null, daysRemaining: null }; // No usage data
  }

  const daysRemaining = Math.floor(currentStockUnits / avgDailyUsage);
  const stockoutDate = new Date();
  stockoutDate.setDate(stockoutDate.getDate() + daysRemaining);

  return { date: stockoutDate, daysRemaining };
}

/**
 * Calculate the last date to place an order to avoid stockout
 */
export function calculateLastOrderByDate(
  stockoutDate: Date,
  totalLeadDays: number,
): Date {
  const orderByDate = new Date(stockoutDate);
  orderByDate.setDate(orderByDate.getDate() - totalLeadDays);
  return orderByDate;
}

/**
 * Get total lead time for a product (product override or client default)
 */
export function getTotalLeadTime(
  product: Pick<
    Product,
    | "supplierLeadDays"
    | "shippingLeadDays"
    | "processingLeadDays"
    | "safetyBufferDays"
    | "totalLeadDays"
  >,
  clientDefaults: ClientTimingDefaults,
): { total: number; breakdown: OrderTimingResult["leadTimeBreakdown"] } {
  // If product has a cached total, check if it matches component sum
  const supplierDays =
    product.supplierLeadDays ?? clientDefaults.defaultSupplierLeadDays;
  const shippingDays =
    product.shippingLeadDays ?? clientDefaults.defaultShippingDays;
  const processingDays =
    product.processingLeadDays ?? clientDefaults.defaultProcessingDays;
  const safetyBufferDays =
    product.safetyBufferDays ?? clientDefaults.defaultSafetyBufferDays;

  const calculatedTotal =
    supplierDays + shippingDays + processingDays + safetyBufferDays;

  return {
    total: product.totalLeadDays ?? calculatedTotal,
    breakdown: {
      supplierDays,
      shippingDays,
      processingDays,
      safetyBufferDays,
    },
  };
}

/**
 * Determine urgency level based on days until order deadline
 */
export function getUrgencyLevel(
  daysUntilDeadline: number | null,
): UrgencyLevel {
  if (daysUntilDeadline === null) return "safe";
  if (daysUntilDeadline < 0) return "overdue";
  if (daysUntilDeadline <= 3) return "critical";
  if (daysUntilDeadline <= 7) return "soon";
  if (daysUntilDeadline <= 14) return "upcoming";
  return "safe";
}

/**
 * Get urgency message based on level
 */
export function getUrgencyMessage(
  urgency: UrgencyLevel,
  daysUntilDeadline: number | null,
): string {
  if (daysUntilDeadline === null) {
    return "No usage data available";
  }

  switch (urgency) {
    case "overdue":
      return `Order deadline passed ${Math.abs(daysUntilDeadline)} days ago!`;
    case "critical":
      return `Order within ${daysUntilDeadline} days to avoid stockout`;
    case "soon":
      return `Order soon - deadline in ${daysUntilDeadline} days`;
    case "upcoming":
      return `Plan to order - deadline in ${daysUntilDeadline} days`;
    case "safe":
      return daysUntilDeadline > 30
        ? "Stock levels healthy"
        : `${daysUntilDeadline} days until order deadline`;
    default:
      return "";
  }
}

// =============================================================================
// CLIENT SETTINGS
// =============================================================================

/**
 * Get timing defaults for a client
 */
export async function getClientTimingDefaults(
  clientId: string,
): Promise<ClientTimingDefaults> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { settings: true },
  });

  if (!client?.settings) {
    return DEFAULT_TIMING_SETTINGS;
  }

  const settings = client.settings as Record<string, unknown>;
  const orderTiming = settings.orderTiming as
    | Partial<ClientTimingDefaults>
    | undefined;

  return {
    defaultSupplierLeadDays:
      orderTiming?.defaultSupplierLeadDays ??
      DEFAULT_TIMING_SETTINGS.defaultSupplierLeadDays,
    defaultShippingDays:
      orderTiming?.defaultShippingDays ??
      DEFAULT_TIMING_SETTINGS.defaultShippingDays,
    defaultProcessingDays:
      orderTiming?.defaultProcessingDays ??
      DEFAULT_TIMING_SETTINGS.defaultProcessingDays,
    defaultSafetyBufferDays:
      orderTiming?.defaultSafetyBufferDays ??
      DEFAULT_TIMING_SETTINGS.defaultSafetyBufferDays,
    alertDaysBeforeDeadline:
      orderTiming?.alertDaysBeforeDeadline ??
      DEFAULT_TIMING_SETTINGS.alertDaysBeforeDeadline,
  };
}

/**
 * Update timing defaults for a client
 */
export async function updateClientTimingDefaults(
  clientId: string,
  defaults: Partial<ClientTimingDefaults>,
): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { settings: true },
  });

  const currentSettings = (client?.settings as Record<string, unknown>) || {};
  const currentTiming =
    (currentSettings.orderTiming as Partial<ClientTimingDefaults>) || {};

  await prisma.client.update({
    where: { id: clientId },
    data: {
      settings: {
        ...currentSettings,
        orderTiming: {
          ...currentTiming,
          ...defaults,
        },
      },
    },
  });
}

// =============================================================================
// PRODUCT TIMING CALCULATIONS
// =============================================================================

/**
 * Calculate order timing for a single product
 */
export async function calculateProductOrderTiming(
  productId: string,
): Promise<OrderTimingResult | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      client: {
        select: { id: true, settings: true },
      },
    },
  });

  if (!product) return null;

  const clientDefaults = await getClientTimingDefaults(product.clientId);
  const avgDailyUsage = product.avgDailyUsage || 0;
  const currentStockUnits = product.currentStockUnits;

  // Calculate stockout date
  const { date: stockoutDate, daysRemaining } = calculateStockoutDate(
    currentStockUnits,
    avgDailyUsage,
  );

  // Get lead time
  const { total: totalLeadDays, breakdown } = getTotalLeadTime(
    product,
    clientDefaults,
  );

  // Calculate order-by date
  let orderByDate: Date | null = null;
  let daysUntilDeadline: number | null = null;

  if (stockoutDate) {
    orderByDate = calculateLastOrderByDate(stockoutDate, totalLeadDays);
    const now = new Date();
    daysUntilDeadline = Math.ceil(
      (orderByDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  const urgencyLevel = getUrgencyLevel(daysUntilDeadline);

  return {
    productId: product.id,
    productName: product.name,
    productCode: product.productId,
    currentStockUnits,
    avgDailyUsage,
    daysOfStockRemaining: daysRemaining,
    projectedStockoutDate: stockoutDate,
    totalLeadTimeDays: totalLeadDays,
    lastOrderByDate: orderByDate,
    daysUntilOrderDeadline: daysUntilDeadline,
    urgencyLevel,
    urgencyMessage: getUrgencyMessage(urgencyLevel, daysUntilDeadline),
    leadTimeBreakdown: breakdown,
  };
}

/**
 * Get upcoming order deadlines for a client
 */
export async function getUpcomingDeadlines(
  clientId: string,
  options?: {
    daysAhead?: number;
    urgencyLevels?: UrgencyLevel[];
    itemType?: string;
    limit?: number;
  },
): Promise<OrderTimingResult[]> {
  const daysAhead = options?.daysAhead ?? 30;
  const limit = options?.limit ?? 50;

  // Get client defaults
  const clientDefaults = await getClientTimingDefaults(clientId);

  // Get products with usage data
  const whereClause: Record<string, unknown> = {
    clientId,
    isActive: true,
    avgDailyUsage: { gt: 0 },
  };

  if (options?.itemType) {
    whereClause.itemType = options.itemType;
  }

  const products = await prisma.product.findMany({
    where: whereClause,
    orderBy: { lastOrderByDate: "asc" },
  });

  const results: OrderTimingResult[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

  for (const product of products) {
    const avgDailyUsage = product.avgDailyUsage || 0;
    const currentStockUnits = product.currentStockUnits;

    // Calculate stockout date
    const { date: stockoutDate, daysRemaining } = calculateStockoutDate(
      currentStockUnits,
      avgDailyUsage,
    );

    if (!stockoutDate) continue;

    // Get lead time
    const { total: totalLeadDays, breakdown } = getTotalLeadTime(
      product,
      clientDefaults,
    );

    // Calculate order-by date
    const orderByDate = calculateLastOrderByDate(stockoutDate, totalLeadDays);

    // Skip if past the daysAhead window (unless overdue)
    const now = new Date();
    const daysUntilDeadline = Math.ceil(
      (orderByDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntilDeadline > daysAhead) continue;

    const urgencyLevel = getUrgencyLevel(daysUntilDeadline);

    // Filter by urgency levels if specified
    if (
      options?.urgencyLevels &&
      !options.urgencyLevels.includes(urgencyLevel)
    ) {
      continue;
    }

    results.push({
      productId: product.id,
      productName: product.name,
      productCode: product.productId,
      currentStockUnits,
      avgDailyUsage,
      daysOfStockRemaining: daysRemaining,
      projectedStockoutDate: stockoutDate,
      totalLeadTimeDays: totalLeadDays,
      lastOrderByDate: orderByDate,
      daysUntilOrderDeadline: daysUntilDeadline,
      urgencyLevel,
      urgencyMessage: getUrgencyMessage(urgencyLevel, daysUntilDeadline),
      leadTimeBreakdown: breakdown,
    });

    if (results.length >= limit) break;
  }

  // Sort by days until deadline (most urgent first)
  results.sort((a, b) => {
    const aVal = a.daysUntilOrderDeadline ?? Infinity;
    const bVal = b.daysUntilOrderDeadline ?? Infinity;
    return aVal - bVal;
  });

  return results;
}

/**
 * Get timing summary for a client
 */
export async function getTimingSummary(clientId: string): Promise<{
  totalProducts: number;
  withUsageData: number;
  overdue: number;
  critical: number;
  soon: number;
  upcoming: number;
  safe: number;
  deadlineAlerts: OrderTimingResult[];
}> {
  const deadlines = await getUpcomingDeadlines(clientId, { daysAhead: 30 });

  const summary = {
    totalProducts: 0,
    withUsageData: deadlines.length,
    overdue: 0,
    critical: 0,
    soon: 0,
    upcoming: 0,
    safe: 0,
    deadlineAlerts: deadlines.filter((d) => d.urgencyLevel !== "safe"),
  };

  // Count total products
  summary.totalProducts = await prisma.product.count({
    where: { clientId, isActive: true },
  });

  // Count by urgency level
  for (const d of deadlines) {
    switch (d.urgencyLevel) {
      case "overdue":
        summary.overdue++;
        break;
      case "critical":
        summary.critical++;
        break;
      case "soon":
        summary.soon++;
        break;
      case "upcoming":
        summary.upcoming++;
        break;
      case "safe":
        summary.safe++;
        break;
    }
  }

  return summary;
}

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

/**
 * Update timing cache for a single product
 */
export async function updateProductTimingCache(
  productId: string,
): Promise<void> {
  const result = await calculateProductOrderTiming(productId);
  if (!result) return;

  await prisma.product.update({
    where: { id: productId },
    data: {
      projectedStockoutDate: result.projectedStockoutDate,
      lastOrderByDate: result.lastOrderByDate,
      totalLeadDays: result.totalLeadTimeDays,
      timingLastCalculated: new Date(),
    },
  });
}

/**
 * Update timing cache for all products of a client
 */
export async function updateClientTimingCache(clientId: string): Promise<{
  updated: number;
  skipped: number;
}> {
  const clientDefaults = await getClientTimingDefaults(clientId);

  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
      avgDailyUsage: { gt: 0 },
    },
    select: {
      id: true,
      currentStockUnits: true,
      avgDailyUsage: true,
      supplierLeadDays: true,
      shippingLeadDays: true,
      processingLeadDays: true,
      safetyBufferDays: true,
      totalLeadDays: true,
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const product of products) {
    const avgDailyUsage = product.avgDailyUsage || 0;
    if (avgDailyUsage <= 0) {
      skipped++;
      continue;
    }

    const { date: stockoutDate } = calculateStockoutDate(
      product.currentStockUnits,
      avgDailyUsage,
    );

    const { total: totalLeadDays } = getTotalLeadTime(product, clientDefaults);

    let orderByDate: Date | null = null;
    if (stockoutDate) {
      orderByDate = calculateLastOrderByDate(stockoutDate, totalLeadDays);
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        projectedStockoutDate: stockoutDate,
        lastOrderByDate: orderByDate,
        totalLeadDays,
        timingLastCalculated: new Date(),
      },
    });

    updated++;
  }

  return { updated, skipped };
}

/**
 * Update timing cache for products that need recalculation
 * (haven't been calculated recently or have stale data)
 */
export async function updateStaleTimingCaches(
  maxAgeHours: number = 24,
): Promise<{
  clientsUpdated: number;
  productsUpdated: number;
}> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - maxAgeHours);

  // Find clients with products needing update
  const clientIds = await prisma.product.findMany({
    where: {
      isActive: true,
      avgDailyUsage: { gt: 0 },
      OR: [
        { timingLastCalculated: null },
        { timingLastCalculated: { lt: cutoff } },
      ],
    },
    select: { clientId: true },
    distinct: ["clientId"],
  });

  let productsUpdated = 0;

  for (const { clientId } of clientIds) {
    const result = await updateClientTimingCache(clientId);
    productsUpdated += result.updated;
  }

  return {
    clientsUpdated: clientIds.length,
    productsUpdated,
  };
}

// =============================================================================
// PRODUCT LEAD TIME MANAGEMENT
// =============================================================================

/**
 * Update lead time for a single product
 */
export async function updateProductLeadTime(
  productId: string,
  leadTime: {
    supplierLeadDays?: number;
    shippingLeadDays?: number;
    processingLeadDays?: number;
    safetyBufferDays?: number;
  },
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      supplierLeadDays: true,
      shippingLeadDays: true,
      processingLeadDays: true,
      safetyBufferDays: true,
      clientId: true,
    },
  });

  if (!product) return;

  // Get client defaults for any missing values
  const clientDefaults = await getClientTimingDefaults(product.clientId);

  const supplierDays =
    leadTime.supplierLeadDays ??
    product.supplierLeadDays ??
    clientDefaults.defaultSupplierLeadDays;
  const shippingDays =
    leadTime.shippingLeadDays ??
    product.shippingLeadDays ??
    clientDefaults.defaultShippingDays;
  const processingDays =
    leadTime.processingLeadDays ??
    product.processingLeadDays ??
    clientDefaults.defaultProcessingDays;
  const safetyBufferDays =
    leadTime.safetyBufferDays ??
    product.safetyBufferDays ??
    clientDefaults.defaultSafetyBufferDays;

  const totalLeadDays =
    supplierDays + shippingDays + processingDays + safetyBufferDays;

  await prisma.product.update({
    where: { id: productId },
    data: {
      supplierLeadDays: leadTime.supplierLeadDays,
      shippingLeadDays: leadTime.shippingLeadDays,
      processingLeadDays: leadTime.processingLeadDays,
      safetyBufferDays: leadTime.safetyBufferDays,
      totalLeadDays,
      leadTimeSource: "override",
      timingLastCalculated: null, // Force recalculation
    },
  });

  // Recalculate timing cache
  await updateProductTimingCache(productId);
}

/**
 * Bulk update lead times from CSV import
 */
export async function bulkUpdateLeadTimes(
  clientId: string,
  updates: Array<{
    productId: string; // The product code (not UUID)
    supplierLeadDays?: number;
    shippingLeadDays?: number;
    processingLeadDays?: number;
    safetyBufferDays?: number;
  }>,
): Promise<{ updated: number; notFound: string[] }> {
  const notFound: string[] = [];
  let updated = 0;

  for (const update of updates) {
    const product = await prisma.product.findUnique({
      where: {
        clientId_productId: {
          clientId,
          productId: update.productId,
        },
      },
      select: { id: true },
    });

    if (!product) {
      notFound.push(update.productId);
      continue;
    }

    await updateProductLeadTime(product.id, {
      supplierLeadDays: update.supplierLeadDays,
      shippingLeadDays: update.shippingLeadDays,
      processingLeadDays: update.processingLeadDays,
      safetyBufferDays: update.safetyBufferDays,
    });

    updated++;
  }

  return { updated, notFound };
}

export default {
  calculateStockoutDate,
  calculateLastOrderByDate,
  getTotalLeadTime,
  getUrgencyLevel,
  getUrgencyMessage,
  getClientTimingDefaults,
  updateClientTimingDefaults,
  calculateProductOrderTiming,
  getUpcomingDeadlines,
  getTimingSummary,
  updateProductTimingCache,
  updateClientTimingCache,
  updateStaleTimingCaches,
  updateProductLeadTime,
  bulkUpdateLeadTimes,
};
