import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    dailySnapshot: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    dailyAlertMetrics: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    client: {
      findMany: vi.fn(),
    },
    alert: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
  Prisma: {},
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../lib/cache.js', () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    deletePattern: vi.fn(),
  },
  CacheTTL: {
    CLIENT_AGGREGATES: 3600000,
    ALERT_TRENDS: 1800000,
    DASHBOARD_WIDGETS: 300000,
    RISK_SCORES: 86400000,
  },
  CacheKeys: {
    inventoryHealth: () => 'analytics:inventory-health',
    alertTrends: (id: string) => `analytics:alert-trends:${id}`,
    dashboardWidget: (userId: string, widget: string) => `dashboard:${userId}:${widget}`,
  },
}));

import { prisma } from '../lib/prisma.js';
import { cache, CacheKeys } from '../lib/cache.js';
import {
  getDailySummary,
  getInventoryHealth,
  getAlertTrends,
  getPortfolioRisk,
  getInventoryTurnover,
  getForecastAccuracy,
} from '../services/analytics.service.js';

describe('Analytics Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // DAILY SUMMARY TESTS
  // =============================================================================

  describe('getDailySummary', () => {
    it('should return aggregated daily summaries from snapshots', async () => {
      // Use UTC dates to avoid timezone issues
      const mockSnapshots = [
        { snapshotDate: new Date('2024-01-01T12:00:00Z'), stockStatus: 'HEALTHY', alertsCreated: 0 },
        { snapshotDate: new Date('2024-01-01T12:00:00Z'), stockStatus: 'LOW', alertsCreated: 1 },
        { snapshotDate: new Date('2024-01-02T12:00:00Z'), stockStatus: 'HEALTHY', alertsCreated: 0 },
      ];

      const mockAlertMetrics = [
        { metricDate: new Date('2024-01-01T12:00:00Z'), createdCount: 2, resolvedCount: 1 },
        { metricDate: new Date('2024-01-02T12:00:00Z'), createdCount: 0, resolvedCount: 1 },
      ];

      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue(mockSnapshots as any);
      vi.mocked(prisma.dailyAlertMetrics.findMany).mockResolvedValue(mockAlertMetrics as any);

      const result = await getDailySummary('client-1', 30);

      expect(result).toHaveLength(2);
      // Check that dates are present (timezone-independent)
      expect(result[0].healthyCount).toBe(1);
      expect(result[0].lowCount).toBe(1);
      expect(result[0].alertsCreated).toBe(2);
      expect(result[0].alertsResolved).toBe(1);
    });

    it('should handle empty snapshots', async () => {
      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dailyAlertMetrics.findMany).mockResolvedValue([]);

      const result = await getDailySummary('client-1', 30);

      expect(result).toHaveLength(0);
    });

    it('should sort results by date ascending', async () => {
      const mockSnapshots = [
        { snapshotDate: new Date('2024-01-03T12:00:00Z'), stockStatus: 'HEALTHY', alertsCreated: 0 },
        { snapshotDate: new Date('2024-01-01T12:00:00Z'), stockStatus: 'HEALTHY', alertsCreated: 0 },
        { snapshotDate: new Date('2024-01-02T12:00:00Z'), stockStatus: 'HEALTHY', alertsCreated: 0 },
      ];

      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue(mockSnapshots as any);
      vi.mocked(prisma.dailyAlertMetrics.findMany).mockResolvedValue([]);

      const result = await getDailySummary('client-1', 30);

      // Verify sorted (first should be before last chronologically)
      expect(result).toHaveLength(3);
      expect(result[0].date < result[1].date).toBe(true);
      expect(result[1].date < result[2].date).toBe(true);
    });

    it('should count all stock status types', async () => {
      const mockSnapshots = [
        { snapshotDate: new Date('2024-01-01'), stockStatus: 'HEALTHY', alertsCreated: 0 },
        { snapshotDate: new Date('2024-01-01'), stockStatus: 'WATCH', alertsCreated: 0 },
        { snapshotDate: new Date('2024-01-01'), stockStatus: 'LOW', alertsCreated: 0 },
        { snapshotDate: new Date('2024-01-01'), stockStatus: 'CRITICAL', alertsCreated: 0 },
        { snapshotDate: new Date('2024-01-01'), stockStatus: 'STOCKOUT', alertsCreated: 0 },
      ];

      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue(mockSnapshots as any);
      vi.mocked(prisma.dailyAlertMetrics.findMany).mockResolvedValue([]);

      const result = await getDailySummary('client-1', 30);

      expect(result[0].healthyCount).toBe(1);
      expect(result[0].watchCount).toBe(1);
      expect(result[0].lowCount).toBe(1);
      expect(result[0].criticalCount).toBe(1);
      expect(result[0].stockoutCount).toBe(1);
      expect(result[0].totalProducts).toBe(5);
    });
  });

  // =============================================================================
  // INVENTORY HEALTH TESTS
  // =============================================================================

  describe('getInventoryHealth', () => {
    it('should return cached result if available', async () => {
      const cachedResult = {
        overall: { totalProducts: 10, healthyPercent: 80 },
        byStatus: {},
        byClient: [],
        trend: { direction: 'stable', changePercent: 0 },
      };

      vi.mocked(cache.get).mockResolvedValue(cachedResult as any);

      const result = await getInventoryHealth();

      expect(result).toEqual(cachedResult);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('should calculate health metrics when no cache', async () => {
      vi.mocked(cache.get).mockResolvedValue(null);

      const mockProducts = [
        { clientId: 'c1', stockStatus: 'HEALTHY', weeksRemaining: 10, client: { id: 'c1', name: 'Client 1' } },
        { clientId: 'c1', stockStatus: 'LOW', weeksRemaining: 3, client: { id: 'c1', name: 'Client 1' } },
        { clientId: 'c2', stockStatus: 'CRITICAL', weeksRemaining: 1, client: { id: 'c2', name: 'Client 2' } },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);
      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue([]);

      const result = await getInventoryHealth();

      expect(result.overall.totalProducts).toBe(3);
      expect(result.byStatus.HEALTHY).toBe(1);
      expect(result.byStatus.LOW).toBe(1);
      expect(result.byStatus.CRITICAL).toBe(1);
      expect(result.byClient).toHaveLength(2);
    });

    it('should calculate correct percentages', async () => {
      vi.mocked(cache.get).mockResolvedValue(null);

      const mockProducts = [
        { clientId: 'c1', stockStatus: 'HEALTHY', weeksRemaining: 10, client: { id: 'c1', name: 'Client 1' } },
        { clientId: 'c1', stockStatus: 'HEALTHY', weeksRemaining: 8, client: { id: 'c1', name: 'Client 1' } },
        { clientId: 'c1', stockStatus: 'LOW', weeksRemaining: 3, client: { id: 'c1', name: 'Client 1' } },
        { clientId: 'c1', stockStatus: 'CRITICAL', weeksRemaining: 1, client: { id: 'c1', name: 'Client 1' } },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);
      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue([]);

      const result = await getInventoryHealth();

      expect(result.overall.healthyPercent).toBe(50); // 2 out of 4
      expect(result.overall.atRiskPercent).toBe(50); // LOW + CRITICAL = 2 out of 4
    });

    it('should determine trend direction', async () => {
      vi.mocked(cache.get).mockResolvedValue(null);

      const mockProducts = [
        { clientId: 'c1', stockStatus: 'HEALTHY', weeksRemaining: 10, client: { id: 'c1', name: 'Client 1' } },
      ];

      const mockSnapshots = [
        { stockStatus: 'HEALTHY' },
        { stockStatus: 'HEALTHY' },
        { stockStatus: 'LOW' },
        { stockStatus: 'LOW' },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);
      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue(mockSnapshots as any);

      const result = await getInventoryHealth();

      // Current is 100% healthy, recent is 50% healthy
      expect(result.trend.direction).toBe('improving');
    });
  });

  // =============================================================================
  // ALERT TRENDS TESTS
  // =============================================================================

  describe('getAlertTrends', () => {
    it('should return cached result if available', async () => {
      const cachedResult = [{ date: '2024-01-01', created: 5, resolved: 3, net: 2 }];

      vi.mocked(cache.get).mockResolvedValue(cachedResult);

      const result = await getAlertTrends('client-1');

      expect(result).toEqual(cachedResult);
      expect(prisma.dailyAlertMetrics.findMany).not.toHaveBeenCalled();
    });

    it('should calculate net alerts correctly', async () => {
      vi.mocked(cache.get).mockResolvedValue(null);

      const mockMetrics = [
        { metricDate: new Date('2024-01-01'), createdCount: 10, resolvedCount: 3 },
        { metricDate: new Date('2024-01-02'), createdCount: 5, resolvedCount: 8 },
      ];

      vi.mocked(prisma.dailyAlertMetrics.findMany).mockResolvedValue(mockMetrics as any);

      const result = await getAlertTrends('client-1');

      expect(result[0].net).toBe(7); // 10 - 3
      expect(result[1].net).toBe(-3); // 5 - 8
    });

    it('should cache the result', async () => {
      vi.mocked(cache.get).mockResolvedValue(null);
      vi.mocked(prisma.dailyAlertMetrics.findMany).mockResolvedValue([]);

      await getAlertTrends('client-1');

      expect(cache.set).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // PORTFOLIO RISK TESTS
  // =============================================================================

  describe('getPortfolioRisk', () => {
    it('should calculate average risk scores per client', async () => {
      const mockClients = [
        {
          id: 'c1',
          name: 'Client 1',
          products: [
            { riskScoreCache: { score: 80, factors: [{ factor: 'low_stock', value: 70 }] } },
            { riskScoreCache: { score: 60, factors: [{ factor: 'low_stock', value: 50 }] } },
          ],
        },
      ];

      vi.mocked(prisma.client.findMany).mockResolvedValue(mockClients as any);

      const result = await getPortfolioRisk();

      expect(result[0].avgRiskScore).toBe(70); // (80 + 60) / 2
      expect(result[0].clientName).toBe('Client 1');
    });

    it('should determine risk level correctly', async () => {
      const mockClients = [
        {
          id: 'c1',
          name: 'Critical Risk',
          products: [{ riskScoreCache: { score: 85, factors: [] } }],
        },
        {
          id: 'c2',
          name: 'High Risk',
          products: [{ riskScoreCache: { score: 65, factors: [] } }],
        },
        {
          id: 'c3',
          name: 'Medium Risk',
          products: [{ riskScoreCache: { score: 45, factors: [] } }],
        },
        {
          id: 'c4',
          name: 'Low Risk',
          products: [{ riskScoreCache: { score: 25, factors: [] } }],
        },
      ];

      vi.mocked(prisma.client.findMany).mockResolvedValue(mockClients as any);

      const result = await getPortfolioRisk();

      expect(result.find(r => r.clientName === 'Critical Risk')?.riskLevel).toBe('critical');
      expect(result.find(r => r.clientName === 'High Risk')?.riskLevel).toBe('high');
      expect(result.find(r => r.clientName === 'Medium Risk')?.riskLevel).toBe('medium');
      expect(result.find(r => r.clientName === 'Low Risk')?.riskLevel).toBe('low');
    });

    it('should count high risk products', async () => {
      const mockClients = [
        {
          id: 'c1',
          name: 'Client 1',
          products: [
            { riskScoreCache: { score: 75, factors: [] } }, // high risk
            { riskScoreCache: { score: 85, factors: [] } }, // high risk
            { riskScoreCache: { score: 40, factors: [] } }, // not high risk
          ],
        },
      ];

      vi.mocked(prisma.client.findMany).mockResolvedValue(mockClients as any);

      const result = await getPortfolioRisk();

      expect(result[0].highRiskProducts).toBe(2);
      expect(result[0].totalProducts).toBe(3);
    });

    it('should aggregate top risk factors', async () => {
      const mockClients = [
        {
          id: 'c1',
          name: 'Client 1',
          products: [
            { riskScoreCache: { score: 70, factors: [{ factor: 'low_stock', value: 60 }, { factor: 'no_usage', value: 50 }] } },
            { riskScoreCache: { score: 70, factors: [{ factor: 'low_stock', value: 55 }] } },
          ],
        },
      ];

      vi.mocked(prisma.client.findMany).mockResolvedValue(mockClients as any);

      const result = await getPortfolioRisk();

      expect(result[0].topRiskFactors).toContainEqual({ factor: 'low_stock', count: 2 });
      expect(result[0].topRiskFactors).toContainEqual({ factor: 'no_usage', count: 1 });
    });
  });

  // =============================================================================
  // INVENTORY TURNOVER TESTS
  // =============================================================================

  describe('getInventoryTurnover', () => {
    it('should calculate turnover ratio correctly', async () => {
      const mockProducts = [
        {
          id: 'p1',
          name: 'Product 1',
          clientId: 'c1',
          currentStockUnits: 100,
          transactions: [
            { quantityUnits: 500 },
            { quantityUnits: 500 },
          ],
          stockHistory: [
            { totalUnits: 100 },
            { totalUnits: 200 },
            { totalUnits: 150 },
          ],
        },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);

      const result = await getInventoryTurnover('client-1', 12);

      expect(result[0].totalConsumed).toBe(1000);
      expect(result[0].avgInventory).toBe(150); // (100 + 200 + 150) / 3
    });

    it('should sort by turnover ratio descending', async () => {
      const mockProducts = [
        {
          id: 'p1',
          name: 'Low Turnover',
          clientId: 'c1',
          currentStockUnits: 1000,
          transactions: [{ quantityUnits: 100 }],
          stockHistory: [{ totalUnits: 1000 }],
        },
        {
          id: 'p2',
          name: 'High Turnover',
          clientId: 'c1',
          currentStockUnits: 50,
          transactions: [{ quantityUnits: 1000 }],
          stockHistory: [{ totalUnits: 100 }],
        },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);

      const result = await getInventoryTurnover('client-1', 12);

      expect(result[0].productName).toBe('High Turnover');
      expect(result[1].productName).toBe('Low Turnover');
    });

    it('should use current stock when no history', async () => {
      const mockProducts = [
        {
          id: 'p1',
          name: 'Product 1',
          clientId: 'c1',
          currentStockUnits: 200,
          transactions: [{ quantityUnits: 100 }],
          stockHistory: [],
        },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);

      const result = await getInventoryTurnover('client-1', 12);

      expect(result[0].avgInventory).toBe(200);
    });
  });

  // =============================================================================
  // FORECAST ACCURACY TESTS
  // =============================================================================

  describe('getForecastAccuracy', () => {
    it('should calculate forecast accuracy correctly', async () => {
      const mockProducts = [
        {
          id: 'p1',
          name: 'Product 1',
          usageMetrics: [
            { totalConsumedUnits: 300 },
            { totalConsumedUnits: 300 },
            { totalConsumedUnits: 300 },
          ],
          transactions: [
            { quantityUnits: 100 },
            { quantityUnits: 100 },
          ],
        },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);

      const result = await getForecastAccuracy('client-1', 30);

      // Avg monthly = 300, predicted = (300/30) * 30 = 300, actual = 200
      expect(result[0].predictedUsage).toBe(300);
      expect(result[0].actualUsage).toBe(200);
    });

    it('should filter products with insufficient metrics', async () => {
      const mockProducts = [
        {
          id: 'p1',
          name: 'Product 1',
          usageMetrics: [{ totalConsumedUnits: 300 }], // Only 1 metric
          transactions: [{ quantityUnits: 100 }],
        },
        {
          id: 'p2',
          name: 'Product 2',
          usageMetrics: [
            { totalConsumedUnits: 300 },
            { totalConsumedUnits: 300 },
          ],
          transactions: [{ quantityUnits: 100 }],
        },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);

      const result = await getForecastAccuracy('client-1', 30);

      expect(result).toHaveLength(1);
      expect(result[0].productName).toBe('Product 2');
    });

    it('should sort by accuracy descending', async () => {
      const mockProducts = [
        {
          id: 'p1',
          name: 'Low Accuracy',
          usageMetrics: [
            { totalConsumedUnits: 300 },
            { totalConsumedUnits: 300 },
          ],
          transactions: [{ quantityUnits: 50 }], // Way off prediction
        },
        {
          id: 'p2',
          name: 'High Accuracy',
          usageMetrics: [
            { totalConsumedUnits: 300 },
            { totalConsumedUnits: 300 },
          ],
          transactions: [{ quantityUnits: 290 }], // Close to prediction
        },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);

      const result = await getForecastAccuracy('client-1', 30);

      expect(result[0].productName).toBe('High Accuracy');
      expect(result[1].productName).toBe('Low Accuracy');
    });

    it('should handle zero actual usage', async () => {
      const mockProducts = [
        {
          id: 'p1',
          name: 'Product 1',
          usageMetrics: [
            { totalConsumedUnits: 300 },
            { totalConsumedUnits: 300 },
          ],
          transactions: [], // No transactions
        },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);

      const result = await getForecastAccuracy('client-1', 30);

      expect(result[0].actualUsage).toBe(0);
      expect(result[0].accuracy).toBe(0); // Can't be accurate if predicting 300 but actual is 0
    });
  });
});
