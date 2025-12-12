/**
 * Import Analysis Service
 *
 * Provides pre-import intelligence to help account managers understand
 * the impact of an import before confirming it.
 */

import { prisma } from '../lib/prisma.js';
import { parseFile, type ColumnMapping } from './import.service.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ProductChange {
  productId: string;
  productName: string;
  field: string;
  oldValue: number | string | null;
  newValue: number | string | null;
  percentChange?: number;
  changeType: 'increase' | 'decrease' | 'new' | 'unchanged' | 'modified';
}

export interface StatusTransition {
  productId: string;
  productName: string;
  oldStatus: string;
  newStatus: string;
  oldStockUnits: number;
  newStockUnits: number;
  notificationPoint: number | null;
}

export interface DataAnomaly {
  row: number;
  productId: string;
  field: string;
  value: number | string;
  anomalyType: 'spike' | 'drop' | 'negative' | 'zero' | 'missing' | 'outlier';
  message: string;
  severity: 'high' | 'medium' | 'low';
}

export interface AlertImpact {
  newAlerts: number;
  resolvedAlerts: number;
  unchangedAlerts: number;
  alertsByType: Record<string, { new: number; resolved: number }>;
  productsNeedingReorder: Array<{
    productId: string;
    productName: string;
    currentStock: number;
    notificationPoint: number;
    projectedWeeksRemaining: number;
  }>;
}

export interface ImportAnalysis {
  importId: string;
  analyzedAt: Date;
  summary: {
    totalProducts: number;
    newProducts: number;
    updatedProducts: number;
    unchangedProducts: number;
    productsWithSignificantChanges: number;
  };
  stockChanges: ProductChange[];
  statusTransitions: StatusTransition[];
  anomalies: DataAnomaly[];
  alertImpact: AlertImpact;
  recommendations: string[];
}

// =============================================================================
// MAIN ANALYSIS FUNCTION
// =============================================================================

/**
 * Analyze the impact of an import before it's confirmed.
 * Returns detailed projections of what will change.
 */
export async function analyzeImportImpact(
  importBatchId: string,
  columnMapping: ColumnMapping[]
): Promise<ImportAnalysis> {
  const importBatch = await prisma.importBatch.findUnique({
    where: { id: importBatchId },
  });

  if (!importBatch || !importBatch.filePath) {
    throw new Error('Import batch not found or missing file');
  }

  // Parse the import file
  const { rows } = await parseFile(importBatch.filePath);

  // Get existing products for comparison
  const existingProducts = await prisma.product.findMany({
    where: { clientId: importBatch.clientId },
    include: {
      usageMetrics: {
        where: { periodType: 'weekly' },
        orderBy: { calculatedAt: 'desc' },
        take: 1,
      },
    },
  });

  // Create a map with calculated weekly usage
  const existingProductMap = new Map(
    existingProducts.map(p => {
      const weeklyUsage = p.usageMetrics[0]?.avgDailyUnits
        ? Number(p.usageMetrics[0].avgDailyUnits) * 7
        : null;
      return [p.productId, { ...p, weeklyUsageUnits: weeklyUsage }];
    })
  );

  // Process import rows with mapping
  const mappedRows = rows.map(row => {
    const mapped: Record<string, string | number | undefined> = {};
    for (const { source, mapsTo } of columnMapping) {
      if (mapsTo && row[source] !== undefined) {
        mapped[mapsTo] = row[source];
      }
    }
    return mapped;
  });

  // Calculate changes
  const stockChanges: ProductChange[] = [];
  const statusTransitions: StatusTransition[] = [];
  const anomalies: DataAnomaly[] = [];
  let newProducts = 0;
  let updatedProducts = 0;
  let unchangedProducts = 0;
  let productsWithSignificantChanges = 0;

  for (let i = 0; i < mappedRows.length; i++) {
    const row = mappedRows[i];
    const rowNum = i + 2;
    const productId = String(row.productId || '').trim();

    if (!productId) continue;

    const existing = existingProductMap.get(productId);
    const newStockPacks = Number(row.currentStockPacks) || 0;
    const newPackSize = Number(row.packSize) || existing?.packSize || 1;
    const newStockUnits = newStockPacks * newPackSize;

    // Detect anomalies
    const rowAnomalies = detectRowAnomalies(row, rowNum, existing);
    anomalies.push(...rowAnomalies);

    if (!existing) {
      // New product
      newProducts++;
      stockChanges.push({
        productId,
        productName: String(row.name || productId),
        field: 'currentStockPacks',
        oldValue: null,
        newValue: newStockPacks,
        changeType: 'new',
      });
    } else {
      // Existing product - check for changes
      const oldStockPacks = existing.currentStockPacks;
      const oldStockUnits = oldStockPacks * existing.packSize;

      if (oldStockPacks !== newStockPacks) {
        const percentChange = oldStockPacks > 0
          ? ((newStockPacks - oldStockPacks) / oldStockPacks) * 100
          : 100;

        stockChanges.push({
          productId,
          productName: existing.name,
          field: 'currentStockPacks',
          oldValue: oldStockPacks,
          newValue: newStockPacks,
          percentChange,
          changeType: percentChange > 0 ? 'increase' : 'decrease',
        });

        if (Math.abs(percentChange) >= 50) {
          productsWithSignificantChanges++;
        }

        // Check for status transitions
        const oldStatus = calculateStockStatus(
          oldStockUnits,
          existing.notificationPoint,
          existing.weeklyUsageUnits
        );
        const newStatus = calculateStockStatus(
          newStockUnits,
          existing.notificationPoint,
          existing.weeklyUsageUnits
        );

        if (oldStatus !== newStatus) {
          statusTransitions.push({
            productId,
            productName: existing.name,
            oldStatus,
            newStatus,
            oldStockUnits,
            newStockUnits,
            notificationPoint: existing.notificationPoint,
          });
        }

        updatedProducts++;
      } else {
        unchangedProducts++;
      }
    }
  }

  // Project alert impact (convert products to expected format)
  const productsWithUsage = existingProducts.map(p => {
    const weeklyUsage = p.usageMetrics[0]?.avgDailyUnits
      ? Number(p.usageMetrics[0].avgDailyUnits) * 7
      : null;
    return {
      id: p.id,
      productId: p.productId,
      name: p.name,
      notificationPoint: p.notificationPoint,
      weeklyUsageUnits: weeklyUsage,
    };
  });

  const alertImpact = await projectAlertImpact(
    importBatch.clientId,
    statusTransitions,
    productsWithUsage
  );

  // Generate recommendations
  const recommendations = generateRecommendations(
    stockChanges,
    statusTransitions,
    anomalies,
    alertImpact
  );

  return {
    importId: importBatchId,
    analyzedAt: new Date(),
    summary: {
      totalProducts: mappedRows.length,
      newProducts,
      updatedProducts,
      unchangedProducts,
      productsWithSignificantChanges,
    },
    stockChanges: stockChanges.slice(0, 100), // Limit for response size
    statusTransitions,
    anomalies: anomalies.slice(0, 50), // Limit for response size
    alertImpact,
    recommendations,
  };
}

// =============================================================================
// ANOMALY DETECTION
// =============================================================================

/**
 * Detect anomalies in a single row of import data.
 */
function detectRowAnomalies(
  row: Record<string, string | number | undefined>,
  rowNum: number,
  existing?: {
    currentStockPacks: number;
    packSize: number;
    notificationPoint: number | null;
  }
): DataAnomaly[] {
  const anomalies: DataAnomaly[] = [];
  const productId = String(row.productId || '');

  // Check stock quantity
  const stockPacks = Number(row.currentStockPacks);
  if (!isNaN(stockPacks)) {
    // Negative stock
    if (stockPacks < 0) {
      anomalies.push({
        row: rowNum,
        productId,
        field: 'currentStockPacks',
        value: stockPacks,
        anomalyType: 'negative',
        message: 'Stock quantity is negative',
        severity: 'high',
      });
    }

    // Zero stock (warning)
    if (stockPacks === 0 && existing && existing.currentStockPacks > 0) {
      anomalies.push({
        row: rowNum,
        productId,
        field: 'currentStockPacks',
        value: stockPacks,
        anomalyType: 'zero',
        message: 'Stock dropped to zero from previous value',
        severity: 'medium',
      });
    }

    // Huge spike (>200% increase)
    if (existing && existing.currentStockPacks > 0) {
      const percentChange = ((stockPacks - existing.currentStockPacks) / existing.currentStockPacks) * 100;

      if (percentChange > 200) {
        anomalies.push({
          row: rowNum,
          productId,
          field: 'currentStockPacks',
          value: stockPacks,
          anomalyType: 'spike',
          message: `Stock increased by ${Math.round(percentChange)}% (${existing.currentStockPacks} → ${stockPacks})`,
          severity: 'medium',
        });
      }

      // Huge drop (>80% decrease)
      if (percentChange < -80) {
        anomalies.push({
          row: rowNum,
          productId,
          field: 'currentStockPacks',
          value: stockPacks,
          anomalyType: 'drop',
          message: `Stock decreased by ${Math.round(Math.abs(percentChange))}% (${existing.currentStockPacks} → ${stockPacks})`,
          severity: 'high',
        });
      }
    }
  }

  // Check pack size
  const packSize = Number(row.packSize);
  if (!isNaN(packSize)) {
    if (packSize <= 0) {
      anomalies.push({
        row: rowNum,
        productId,
        field: 'packSize',
        value: packSize,
        anomalyType: 'negative',
        message: 'Pack size must be greater than 0',
        severity: 'high',
      });
    }

    // Unusual pack size change
    if (existing && existing.packSize !== packSize && existing.packSize > 0) {
      const change = Math.abs(packSize - existing.packSize) / existing.packSize * 100;
      if (change > 50) {
        anomalies.push({
          row: rowNum,
          productId,
          field: 'packSize',
          value: packSize,
          anomalyType: 'outlier',
          message: `Pack size changed significantly (${existing.packSize} → ${packSize})`,
          severity: 'medium',
        });
      }
    }
  }

  return anomalies;
}

// =============================================================================
// STATUS CALCULATION
// =============================================================================

/**
 * Calculate stock status based on current levels and usage.
 */
function calculateStockStatus(
  stockUnits: number,
  notificationPoint: number | null,
  weeklyUsage?: number | null
): string {
  // If no notification point, use basic thresholds
  if (notificationPoint === null) {
    if (stockUnits === 0) return 'OUT_OF_STOCK';
    if (stockUnits < 10) return 'CRITICAL';
    if (stockUnits < 50) return 'LOW';
    return 'HEALTHY';
  }

  // Use weeks remaining calculation if we have usage data
  if (weeklyUsage && weeklyUsage > 0) {
    const weeksRemaining = stockUnits / weeklyUsage;
    if (weeksRemaining <= 0) return 'OUT_OF_STOCK';
    if (weeksRemaining <= 2) return 'CRITICAL';
    if (weeksRemaining <= 4) return 'LOW';
    if (weeksRemaining <= 8) return 'WATCH';
    return 'HEALTHY';
  }

  // Fallback to notification point comparison
  if (stockUnits === 0) return 'OUT_OF_STOCK';
  if (stockUnits < notificationPoint * 0.5) return 'CRITICAL';
  if (stockUnits < notificationPoint) return 'LOW';
  if (stockUnits < notificationPoint * 2) return 'WATCH';
  return 'HEALTHY';
}

// =============================================================================
// ALERT IMPACT PROJECTION
// =============================================================================

/**
 * Project how many alerts will be created/resolved by the import.
 */
async function projectAlertImpact(
  clientId: string,
  statusTransitions: StatusTransition[],
  existingProducts: Array<{
    id: string;
    productId: string;
    name: string;
    notificationPoint: number | null;
    weeklyUsageUnits: number | null;
  }>
): Promise<AlertImpact> {
  // Get current active alerts
  const currentAlerts = await prisma.alert.findMany({
    where: {
      clientId,
      status: 'active',
    },
    include: {
      product: true,
    },
  });

  let newAlerts = 0;
  let resolvedAlerts = 0;
  const alertsByType: Record<string, { new: number; resolved: number }> = {};
  const productsNeedingReorder: AlertImpact['productsNeedingReorder'] = [];

  // Count status transitions that would trigger/resolve alerts
  for (const transition of statusTransitions) {
    const isBecomingCritical = ['CRITICAL', 'LOW', 'OUT_OF_STOCK'].includes(transition.newStatus)
      && !['CRITICAL', 'LOW', 'OUT_OF_STOCK'].includes(transition.oldStatus);

    const wasRisky = ['CRITICAL', 'LOW', 'OUT_OF_STOCK'].includes(transition.oldStatus);
    const isNowSafe = ['HEALTHY', 'WATCH'].includes(transition.newStatus);

    if (isBecomingCritical) {
      newAlerts++;
      const alertType = transition.newStatus === 'OUT_OF_STOCK' ? 'out_of_stock' : 'low_stock';
      alertsByType[alertType] = alertsByType[alertType] || { new: 0, resolved: 0 };
      alertsByType[alertType].new++;

      // Find product details for reorder list
      const product = existingProducts.find(p => p.productId === transition.productId);
      if (product && transition.notificationPoint) {
        const weeklyUsage = product.weeklyUsageUnits || 0;
        const weeksRemaining = weeklyUsage > 0
          ? transition.newStockUnits / weeklyUsage
          : 0;

        productsNeedingReorder.push({
          productId: transition.productId,
          productName: transition.productName,
          currentStock: transition.newStockUnits,
          notificationPoint: transition.notificationPoint,
          projectedWeeksRemaining: Math.round(weeksRemaining * 10) / 10,
        });
      }
    }

    if (wasRisky && isNowSafe) {
      resolvedAlerts++;
      const alertType = transition.oldStatus === 'OUT_OF_STOCK' ? 'out_of_stock' : 'low_stock';
      alertsByType[alertType] = alertsByType[alertType] || { new: 0, resolved: 0 };
      alertsByType[alertType].resolved++;
    }
  }

  return {
    newAlerts,
    resolvedAlerts,
    unchangedAlerts: currentAlerts.length - resolvedAlerts,
    alertsByType,
    productsNeedingReorder: productsNeedingReorder
      .sort((a, b) => a.projectedWeeksRemaining - b.projectedWeeksRemaining)
      .slice(0, 20),
  };
}

// =============================================================================
// RECOMMENDATIONS
// =============================================================================

/**
 * Generate actionable recommendations based on the analysis.
 */
function generateRecommendations(
  stockChanges: ProductChange[],
  statusTransitions: StatusTransition[],
  anomalies: DataAnomaly[],
  alertImpact: AlertImpact
): string[] {
  const recommendations: string[] = [];

  // High severity anomalies
  const highSeverityAnomalies = anomalies.filter(a => a.severity === 'high');
  if (highSeverityAnomalies.length > 0) {
    recommendations.push(
      `Review ${highSeverityAnomalies.length} high-severity issue(s) before confirming import`
    );
  }

  // Negative values
  const negativeAnomalies = anomalies.filter(a => a.anomalyType === 'negative');
  if (negativeAnomalies.length > 0) {
    recommendations.push(
      `${negativeAnomalies.length} row(s) contain negative values that should be corrected`
    );
  }

  // Products going to critical status
  const criticalTransitions = statusTransitions.filter(
    t => ['CRITICAL', 'OUT_OF_STOCK'].includes(t.newStatus)
  );
  if (criticalTransitions.length > 0) {
    recommendations.push(
      `${criticalTransitions.length} product(s) will move to critical/out-of-stock status - consider immediate reorder`
    );
  }

  // Products needing reorder
  if (alertImpact.productsNeedingReorder.length > 0) {
    const urgent = alertImpact.productsNeedingReorder.filter(
      p => p.projectedWeeksRemaining <= 2
    );
    if (urgent.length > 0) {
      recommendations.push(
        `${urgent.length} product(s) have less than 2 weeks of stock remaining - urgent reorder needed`
      );
    }
  }

  // Large stock changes
  const significantChanges = stockChanges.filter(
    c => c.percentChange && Math.abs(c.percentChange) > 100
  );
  if (significantChanges.length > 5) {
    recommendations.push(
      `${significantChanges.length} product(s) show >100% stock change - verify data accuracy`
    );
  }

  // No issues
  if (recommendations.length === 0) {
    recommendations.push('No issues detected - import looks good to proceed');
  }

  return recommendations;
}

// =============================================================================
// DIFF VIEW
// =============================================================================

export interface ProductDiff {
  productId: string;
  productName: string;
  isNew: boolean;
  changes: Array<{
    field: string;
    fieldLabel: string;
    oldValue: number | string | null;
    newValue: number | string | null;
    percentChange?: number;
    significance: 'high' | 'medium' | 'low' | 'unchanged';
  }>;
}

/**
 * Generate a detailed diff view comparing existing data with import data.
 */
export async function generateImportDiff(
  importBatchId: string,
  columnMapping: ColumnMapping[]
): Promise<{
  products: ProductDiff[];
  summary: {
    increased: number;
    decreased: number;
    new: number;
    unchanged: number;
  };
}> {
  const importBatch = await prisma.importBatch.findUnique({
    where: { id: importBatchId },
  });

  if (!importBatch || !importBatch.filePath) {
    throw new Error('Import batch not found or missing file');
  }

  const { rows } = await parseFile(importBatch.filePath);

  const existingProducts = await prisma.product.findMany({
    where: { clientId: importBatch.clientId },
  });

  const existingProductMap = new Map(
    existingProducts.map(p => [p.productId, p])
  );

  const products: ProductDiff[] = [];
  let increased = 0;
  let decreased = 0;
  let newCount = 0;
  let unchanged = 0;

  // Field labels for display
  const fieldLabels: Record<string, string> = {
    currentStockPacks: 'Stock (Packs)',
    packSize: 'Pack Size',
    notificationPoint: 'Reorder Point',
    name: 'Product Name',
  };

  for (const row of rows) {
    const mapped: Record<string, string | number | undefined> = {};
    for (const { source, mapsTo } of columnMapping) {
      if (mapsTo && row[source] !== undefined) {
        mapped[mapsTo] = row[source];
      }
    }

    const productId = String(mapped.productId || '').trim();
    if (!productId) continue;

    const existing = existingProductMap.get(productId);
    const changes: ProductDiff['changes'] = [];
    let hasChanges = false;
    let hasIncrease = false;
    let hasDecrease = false;

    if (!existing) {
      newCount++;
      products.push({
        productId,
        productName: String(mapped.name || productId),
        isNew: true,
        changes: [
          {
            field: 'currentStockPacks',
            fieldLabel: 'Stock (Packs)',
            oldValue: null,
            newValue: Number(mapped.currentStockPacks) || 0,
            significance: 'high',
          },
        ],
      });
      continue;
    }

    // Compare stock
    const oldStock = existing.currentStockPacks;
    const newStock = Number(mapped.currentStockPacks);
    if (!isNaN(newStock) && oldStock !== newStock) {
      const pctChange = oldStock > 0 ? ((newStock - oldStock) / oldStock) * 100 : 100;
      hasChanges = true;
      if (pctChange > 0) hasIncrease = true;
      if (pctChange < 0) hasDecrease = true;

      changes.push({
        field: 'currentStockPacks',
        fieldLabel: fieldLabels.currentStockPacks,
        oldValue: oldStock,
        newValue: newStock,
        percentChange: Math.round(pctChange * 10) / 10,
        significance: Math.abs(pctChange) >= 50 ? 'high' : Math.abs(pctChange) >= 20 ? 'medium' : 'low',
      });
    }

    // Compare pack size
    const oldPackSize = existing.packSize;
    const newPackSize = Number(mapped.packSize);
    if (!isNaN(newPackSize) && oldPackSize !== newPackSize) {
      hasChanges = true;
      changes.push({
        field: 'packSize',
        fieldLabel: fieldLabels.packSize,
        oldValue: oldPackSize,
        newValue: newPackSize,
        significance: 'medium',
      });
    }

    // Compare notification point
    const oldNotif = existing.notificationPoint;
    const newNotif = Number(mapped.notificationPoint);
    if (!isNaN(newNotif) && oldNotif !== newNotif) {
      hasChanges = true;
      changes.push({
        field: 'notificationPoint',
        fieldLabel: fieldLabels.notificationPoint,
        oldValue: oldNotif,
        newValue: newNotif,
        significance: 'medium',
      });
    }

    if (hasChanges) {
      if (hasIncrease && !hasDecrease) increased++;
      else if (hasDecrease && !hasIncrease) decreased++;

      products.push({
        productId,
        productName: existing.name,
        isNew: false,
        changes,
      });
    } else {
      unchanged++;
    }
  }

  return {
    products: products.slice(0, 200), // Limit for response size
    summary: {
      increased,
      decreased,
      new: newCount,
      unchanged,
    },
  };
}
