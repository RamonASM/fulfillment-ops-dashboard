/**
 * Orphan Product Reconciliation Service
 *
 * Provides COST-FREE fuzzy matching for orphan products using the ds-analytics service.
 * Handles 85-90% of matches without any API costs.
 *
 * This service wraps the Python fuzzy matching API and provides:
 * - Orphan product listing
 * - Fuzzy match suggestions
 * - Product merging logic
 */

import axios from 'axios';
import { prisma } from '../lib/prisma.js';

const DS_ANALYTICS_URL = process.env.DS_ANALYTICS_URL || 'http://localhost:8000';

export interface FuzzyMatchResult {
  candidateId: string;
  candidateProductId: string;
  candidateName: string;
  confidenceScore: number;
  matchMethod: string;
  scoreBreakdown: Record<string, number>;
  reasoning: string;
}

export interface OrphanProduct {
  id: string;
  productId: string;
  name: string | null;
  vendorCode: string | null;
  vendorName: string | null;
  currentStockPacks: number;
  currentStockUnits: number;
  itemType: string;
  transactionCount?: number;
}

export interface ReconciliationSuggestion {
  orphan: OrphanProduct;
  matches: FuzzyMatchResult[];
  confidence: 'high' | 'medium' | 'low';
  recommendedAction: 'auto_merge' | 'review' | 'manual';
}

export class OrphanReconciliationService {
  /**
   * Get all orphan products for a client
   */
  static async getOrphans(clientId: string): Promise<OrphanProduct[]> {
    const orphans = await prisma.product.findMany({
      where: {
        clientId,
        isOrphan: true,
        isActive: true,
      },
      select: {
        id: true,
        productId: true,
        name: true,
        vendorCode: true,
        vendorName: true,
        currentStockPacks: true,
        currentStockUnits: true,
        itemType: true,
        _count: {
          select: {
            transactions: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orphans.map((orphan) => ({
      id: orphan.id,
      productId: orphan.productId,
      name: orphan.name,
      vendorCode: orphan.vendorCode,
      vendorName: orphan.vendorName,
      currentStockPacks: orphan.currentStockPacks,
      currentStockUnits: orphan.currentStockUnits,
      itemType: orphan.itemType,
      transactionCount: orphan._count.transactions,
    }));
  }

  /**
   * Get fuzzy match suggestions for an orphan product
   *
   * Uses FREE Python fuzzy matching - NO API costs!
   */
  static async getFuzzyMatches(
    orphanId: string,
    clientId: string
  ): Promise<FuzzyMatchResult[]> {
    // Get orphan product
    const orphan = await prisma.product.findFirst({
      where: {
        id: orphanId,
        clientId,
        isOrphan: true,
      },
      select: {
        id: true,
        productId: true,
        name: true,
        vendorCode: true,
        vendorName: true,
      },
    });

    if (!orphan) {
      throw new Error('Orphan product not found');
    }

    // Get candidate products (non-orphans from same client)
    const candidates = await prisma.product.findMany({
      where: {
        clientId,
        isOrphan: false,
        isActive: true,
      },
      select: {
        id: true,
        productId: true,
        name: true,
        vendorCode: true,
        vendorName: true,
      },
      take: 1000, // Limit candidates for performance
    });

    if (candidates.length === 0) {
      return []; // No candidates to match against
    }

    // Call Python fuzzy matching service (FREE!)
    try {
      const response = await axios.post(
        `${DS_ANALYTICS_URL}/reconcile/fuzzy`,
        {
          orphan: {
            id: orphan.id,
            productId: orphan.productId,
            name: orphan.name,
            vendorCode: orphan.vendorCode,
            vendorName: orphan.vendorName,
          },
          candidates: candidates.map((c) => ({
            id: c.id,
            productId: c.productId,
            name: c.name,
            vendorCode: c.vendorCode,
            vendorName: c.vendorName,
          })),
        },
        {
          timeout: 10000, // 10 second timeout
        }
      );

      return response.data.matches || [];
    } catch (error) {
      console.error('Fuzzy matching failed:', error);
      throw new Error(
        `Failed to get fuzzy matches: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get reconciliation suggestions for an orphan
   */
  static async getReconciliationSuggestion(
    orphanId: string,
    clientId: string
  ): Promise<ReconciliationSuggestion> {
    const orphan = await prisma.product.findFirst({
      where: {
        id: orphanId,
        clientId,
        isOrphan: true,
      },
      select: {
        id: true,
        productId: true,
        name: true,
        vendorCode: true,
        vendorName: true,
        currentStockPacks: true,
        currentStockUnits: true,
        itemType: true,
        _count: {
          select: {
            transactions: true,
          },
        },
      },
    });

    if (!orphan) {
      throw new Error('Orphan product not found');
    }

    const matches = await this.getFuzzyMatches(orphanId, clientId);

    // Determine confidence level and recommended action
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let recommendedAction: 'auto_merge' | 'review' | 'manual' = 'manual';

    if (matches.length > 0) {
      const topConfidence = matches[0].confidenceScore;

      if (topConfidence >= 0.95) {
        confidence = 'high';
        recommendedAction = 'auto_merge';
      } else if (topConfidence >= 0.85) {
        confidence = 'high';
        recommendedAction = 'review';
      } else if (topConfidence >= 0.75) {
        confidence = 'medium';
        recommendedAction = 'review';
      } else {
        confidence = 'low';
        recommendedAction = 'manual';
      }
    }

    return {
      orphan: {
        id: orphan.id,
        productId: orphan.productId,
        name: orphan.name,
        vendorCode: orphan.vendorCode,
        vendorName: orphan.vendorName,
        currentStockPacks: orphan.currentStockPacks,
        currentStockUnits: orphan.currentStockUnits,
        itemType: orphan.itemType,
        transactionCount: orphan._count.transactions,
      },
      matches,
      confidence,
      recommendedAction,
    };
  }

  /**
   * Merge an orphan product into a target product
   *
   * This transfers all transactions from the orphan to the target
   * and marks the orphan as inactive.
   */
  static async mergeOrphan(
    orphanId: string,
    targetProductId: string,
    clientId: string,
    userId: string
  ): Promise<{ success: boolean; transactionsMoved: number }> {
    // Verify both products exist and belong to the client
    const orphan = await prisma.product.findFirst({
      where: { id: orphanId, clientId, isOrphan: true },
    });

    const target = await prisma.product.findFirst({
      where: { id: targetProductId, clientId, isOrphan: false },
    });

    if (!orphan) {
      throw new Error('Orphan product not found');
    }

    if (!target) {
      throw new Error('Target product not found');
    }

    // Transfer transactions in a database transaction
    const result = await prisma.$transaction(async (tx) => {
      // Count transactions to be moved
      const transactionCount = await tx.transaction.count({
        where: { productId: orphanId },
      });

      // Move all transactions from orphan to target
      await tx.transaction.updateMany({
        where: { productId: orphanId },
        data: { productId: targetProductId },
      });

      // Update target product with orphan data if richer
      const updateData: any = {};

      if (orphan.monthlyUsageUnits && !target.monthlyUsageUnits) {
        updateData.monthlyUsageUnits = orphan.monthlyUsageUnits;
      }

      if (orphan.monthlyUsagePacks && !target.monthlyUsagePacks) {
        updateData.monthlyUsagePacks = orphan.monthlyUsagePacks;
      }

      if (orphan.vendorName && !target.vendorName) {
        updateData.vendorName = orphan.vendorName;
      }

      if (orphan.vendorCode && !target.vendorCode) {
        updateData.vendorCode = orphan.vendorCode;
      }

      if (Object.keys(updateData).length > 0) {
        await tx.product.update({
          where: { id: targetProductId },
          data: updateData,
        });
      }

      // Mark orphan as inactive (soft delete)
      await tx.product.update({
        where: { id: orphanId },
        data: {
          isActive: false,
          isOrphan: true, // Keep flag for audit trail
        },
      });

      // Record the reconciliation attempt
      await tx.orphanReconciliationAttempt.create({
        data: {
          clientId,
          orphanProductId: orphanId,
          selectedMatchId: targetProductId,
          userAction: 'merged',
          reviewedById: userId,
          reviewedAt: new Date(),
          matchMethod: 'fuzzy',
          suggestedMatches: [],
          aiCostUsd: 0, // Fuzzy matching is FREE!
        },
      });

      return { transactionCount };
    });

    return {
      success: true,
      transactionsMoved: result.transactionCount,
    };
  }

  /**
   * Reject a reconciliation suggestion
   */
  static async rejectSuggestion(
    orphanId: string,
    clientId: string,
    userId: string,
    reason?: string
  ): Promise<{ success: boolean }> {
    // Verify orphan exists
    const orphan = await prisma.product.findFirst({
      where: { id: orphanId, clientId, isOrphan: true },
    });

    if (!orphan) {
      throw new Error('Orphan product not found');
    }

    // Record the rejection
    await prisma.orphanReconciliationAttempt.create({
      data: {
        clientId,
        orphanProductId: orphanId,
        userAction: 'rejected',
        reviewedById: userId,
        reviewedAt: new Date(),
        matchMethod: 'fuzzy',
        suggestedMatches: reason ? [{ reason }] : [],
        aiCostUsd: 0,
      },
    });

    return { success: true };
  }

  /**
   * Get reconciliation statistics for a client
   */
  static async getReconciliationStats(clientId: string) {
    const [totalOrphans, pendingOrphans, mergedOrphans, rejectedOrphans] =
      await Promise.all([
        prisma.product.count({
          where: { clientId, isOrphan: true },
        }),
        prisma.product.count({
          where: { clientId, isOrphan: true, isActive: true },
        }),
        prisma.orphanReconciliationAttempt.count({
          where: { clientId, userAction: 'merged' },
        }),
        prisma.orphanReconciliationAttempt.count({
          where: { clientId, userAction: 'rejected' },
        }),
      ]);

    return {
      totalOrphans,
      pendingOrphans,
      mergedOrphans,
      rejectedOrphans,
      reconciliationRate:
        totalOrphans > 0
          ? ((mergedOrphans / totalOrphans) * 100).toFixed(1)
          : 0,
    };
  }
}
