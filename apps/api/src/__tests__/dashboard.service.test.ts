import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    userDashboardPreference: {
      findUnique: vi.fn(),
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
    },
    dailySnapshot: {
      findMany: vi.fn(),
    },
    dailyAlertMetrics: {
      findMany: vi.fn(),
    },
  },
  Prisma: {},
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
  getDashboardPreferences,
  updateDashboardPreferences,
  getKPIWidgetData,
  getHealthHeatmapData,
  getAlertBurndownData,
  DEFAULT_WIDGETS,
} from '../services/dashboard.service.js';

describe('Dashboard Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // PREFERENCES MANAGEMENT TESTS
  // =============================================================================

  describe('getDashboardPreferences', () => {
    it('should return defaults when no preferences exist', async () => {
      vi.mocked(prisma.userDashboardPreference.findUnique).mockResolvedValue(null);

      const result = await getDashboardPreferences('user-1');

      expect(result.userId).toBe('user-1');
      expect(result.refreshRate).toBe(300000);
      expect(result.theme).toBe('light');
      expect(result.layout.columns).toBe(4);
      expect(result.layout.widgets).toEqual(DEFAULT_WIDGETS);
    });

    it('should return saved preferences when they exist', async () => {
      const savedPrefs = {
        userId: 'user-1',
        layout: { columns: 3, widgets: [{ id: 'custom', type: 'kpi', visible: true, position: 0, size: 'large' }] },
        refreshRate: 60000,
        theme: 'dark',
        widgets: [],
      };

      vi.mocked(prisma.userDashboardPreference.findUnique).mockResolvedValue(savedPrefs as any);

      const result = await getDashboardPreferences('user-1');

      expect(result.refreshRate).toBe(60000);
      expect(result.theme).toBe('dark');
      expect(result.layout.columns).toBe(3);
    });

    it('should handle null layout in saved preferences', async () => {
      const savedPrefs = {
        userId: 'user-1',
        layout: null,
        refreshRate: 60000,
        theme: 'dark',
        widgets: [],
      };

      vi.mocked(prisma.userDashboardPreference.findUnique).mockResolvedValue(savedPrefs as any);

      const result = await getDashboardPreferences('user-1');

      expect(result.layout.columns).toBe(4); // Default
    });
  });

  describe('updateDashboardPreferences', () => {
    it('should create new preferences if none exist', async () => {
      vi.mocked(prisma.userDashboardPreference.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.userDashboardPreference.upsert).mockResolvedValue({
        userId: 'user-1',
        layout: { columns: 4, widgets: DEFAULT_WIDGETS },
        refreshRate: 60000,
        theme: 'dark',
        widgets: [],
      } as any);

      const result = await updateDashboardPreferences('user-1', {
        refreshRate: 60000,
        theme: 'dark',
      });

      expect(prisma.userDashboardPreference.upsert).toHaveBeenCalled();
      expect(result.refreshRate).toBe(60000);
      expect(result.theme).toBe('dark');
    });

    it('should merge updates with existing preferences', async () => {
      const existing = {
        userId: 'user-1',
        layout: { columns: 3, widgets: [] },
        refreshRate: 300000,
        theme: 'light',
        widgets: [],
      };

      vi.mocked(prisma.userDashboardPreference.findUnique).mockResolvedValue(existing as any);
      vi.mocked(prisma.userDashboardPreference.upsert).mockResolvedValue({
        ...existing,
        theme: 'dark',
      } as any);

      const result = await updateDashboardPreferences('user-1', { theme: 'dark' });

      expect(result.theme).toBe('dark');
    });

    it('should invalidate cache after update', async () => {
      vi.mocked(prisma.userDashboardPreference.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.userDashboardPreference.upsert).mockResolvedValue({
        userId: 'user-1',
        layout: { columns: 4, widgets: DEFAULT_WIDGETS },
        refreshRate: 300000,
        theme: 'light',
        widgets: [],
      } as any);

      await updateDashboardPreferences('user-1', { theme: 'dark' });

      expect(cache.deletePattern).toHaveBeenCalledWith('dashboard:user-1');
    });
  });

  // =============================================================================
  // KPI WIDGET DATA TESTS
  // =============================================================================

  describe('getKPIWidgetData', () => {
    it('should return cached data if available', async () => {
      const cachedData = {
        'kpi-inventory': { label: 'Inventory Health', value: 85, unit: '%' },
      };

      vi.mocked(cache.get).mockReturnValue(cachedData);

      const result = await getKPIWidgetData('user-1', ['client-1']);

      expect(result).toEqual(cachedData);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('should calculate inventory health percentage', async () => {
      vi.mocked(cache.get).mockReturnValue(undefined);

      const mockProducts = [
        { stockStatus: 'HEALTHY', weeksRemaining: 10 },
        { stockStatus: 'HEALTHY', weeksRemaining: 8 },
        { stockStatus: 'LOW', weeksRemaining: 3 },
        { stockStatus: 'CRITICAL', weeksRemaining: 1 },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);
      vi.mocked(prisma.alert.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue([]);

      const result = await getKPIWidgetData('user-1', ['client-1']);

      expect(result['kpi-inventory'].value).toBe(50); // 2 out of 4
      expect(result['kpi-inventory'].unit).toBe('%');
    });

    it('should count active alerts', async () => {
      vi.mocked(cache.get).mockReturnValue(undefined);

      const mockAlerts = [
        { isDismissed: false, createdAt: new Date() },
        { isDismissed: false, createdAt: new Date() },
        { isDismissed: true, createdAt: new Date(), dismissedAt: new Date() },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue([]);
      vi.mocked(prisma.alert.findMany)
        .mockResolvedValueOnce(mockAlerts as any) // First call for active alerts
        .mockResolvedValueOnce([] as any); // Second call for resolved alerts
      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue([]);

      const result = await getKPIWidgetData('user-1', ['client-1']);

      expect(result['kpi-alerts'].value).toBe(2);
    });

    it('should calculate average resolution time', async () => {
      vi.mocked(cache.get).mockReturnValue(undefined);

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const resolvedAlerts = [
        { createdAt: twentyFourHoursAgo, dismissedAt: now, isDismissed: true }, // 24 hours
        { createdAt: fortyEightHoursAgo, dismissedAt: now, isDismissed: true }, // 48 hours
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue([]);
      vi.mocked(prisma.alert.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(resolvedAlerts as any);
      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue([]);

      const result = await getKPIWidgetData('user-1', ['client-1']);

      expect(result['kpi-resolution'].value).toBe(36); // (24 + 48) / 2
      expect(result['kpi-resolution'].unit).toBe('hrs');
    });

    it('should calculate average weeks of stock', async () => {
      vi.mocked(cache.get).mockReturnValue(undefined);

      const mockProducts = [
        { stockStatus: 'HEALTHY', weeksRemaining: 10 },
        { stockStatus: 'HEALTHY', weeksRemaining: 6 },
        { stockStatus: 'LOW', weeksRemaining: 4 },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);
      vi.mocked(prisma.alert.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue([]);

      const result = await getKPIWidgetData('user-1', ['client-1']);

      expect(result['kpi-turnover'].value).toBe(7); // (10 + 6 + 4) / 3 rounded
      expect(result['kpi-turnover'].unit).toBe('weeks');
    });

    it('should determine trend direction from sparkline', async () => {
      vi.mocked(cache.get).mockReturnValue(undefined);

      const mockProducts = [{ stockStatus: 'HEALTHY', weeksRemaining: 10 }];

      // Snapshots showing improvement (more healthy over time)
      const mockSnapshots = [
        { snapshotDate: new Date('2024-01-01'), stockStatus: 'LOW' },
        { snapshotDate: new Date('2024-01-02'), stockStatus: 'LOW' },
        { snapshotDate: new Date('2024-01-03'), stockStatus: 'HEALTHY' },
        { snapshotDate: new Date('2024-01-04'), stockStatus: 'HEALTHY' },
        { snapshotDate: new Date('2024-01-05'), stockStatus: 'HEALTHY' },
        { snapshotDate: new Date('2024-01-06'), stockStatus: 'HEALTHY' },
        { snapshotDate: new Date('2024-01-07'), stockStatus: 'HEALTHY' },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);
      vi.mocked(prisma.alert.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue(mockSnapshots as any);

      const result = await getKPIWidgetData('user-1', ['client-1']);

      expect(result['kpi-inventory'].trend.direction).toBe('up');
    });

    it('should cache results', async () => {
      vi.mocked(cache.get).mockReturnValue(undefined);
      vi.mocked(prisma.product.findMany).mockResolvedValue([]);
      vi.mocked(prisma.alert.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dailySnapshot.findMany).mockResolvedValue([]);

      await getKPIWidgetData('user-1', ['client-1']);

      expect(cache.set).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // HEALTH HEATMAP DATA TESTS
  // =============================================================================

  describe('getHealthHeatmapData', () => {
    it('should return products grouped by client', async () => {
      const mockClients = [
        {
          id: 'c1',
          name: 'Client 1',
          products: [
            { id: 'p1', name: 'Product 1', stockStatus: 'HEALTHY', weeksRemaining: 10 },
            { id: 'p2', name: 'Product 2', stockStatus: 'LOW', weeksRemaining: 3 },
          ],
        },
        {
          id: 'c2',
          name: 'Client 2',
          products: [
            { id: 'p3', name: 'Product 3', stockStatus: 'CRITICAL', weeksRemaining: 1 },
          ],
        },
      ];

      vi.mocked(prisma.client.findMany).mockResolvedValue(mockClients as any);

      const result = await getHealthHeatmapData(['c1', 'c2']);

      expect(result.clients).toHaveLength(2);
      expect(result.clients[0].products).toHaveLength(2);
      expect(result.clients[1].products).toHaveLength(1);
    });

    it('should default to HEALTHY status when null', async () => {
      const mockClients = [
        {
          id: 'c1',
          name: 'Client 1',
          products: [
            { id: 'p1', name: 'Product 1', stockStatus: null, weeksRemaining: null },
          ],
        },
      ];

      vi.mocked(prisma.client.findMany).mockResolvedValue(mockClients as any);

      const result = await getHealthHeatmapData(['c1']);

      expect(result.clients[0].products[0].status).toBe('HEALTHY');
    });

    it('should include weeks remaining', async () => {
      const mockClients = [
        {
          id: 'c1',
          name: 'Client 1',
          products: [
            { id: 'p1', name: 'Product 1', stockStatus: 'LOW', weeksRemaining: 2.5 },
          ],
        },
      ];

      vi.mocked(prisma.client.findMany).mockResolvedValue(mockClients as any);

      const result = await getHealthHeatmapData(['c1']);

      expect(result.clients[0].products[0].weeksRemaining).toBe(2.5);
    });

    it('should handle empty client list', async () => {
      vi.mocked(prisma.client.findMany).mockResolvedValue([]);

      const result = await getHealthHeatmapData([]);

      expect(result.clients).toHaveLength(0);
    });
  });

  // =============================================================================
  // ALERT BURNDOWN DATA TESTS
  // =============================================================================

  describe('getAlertBurndownData', () => {
    it('should return alert metrics aggregated by date', async () => {
      const mockMetrics = [
        { metricDate: new Date('2024-01-01'), clientId: 'c1', createdCount: 5, resolvedCount: 2 },
        { metricDate: new Date('2024-01-01'), clientId: 'c2', createdCount: 3, resolvedCount: 1 },
        { metricDate: new Date('2024-01-02'), clientId: 'c1', createdCount: 2, resolvedCount: 4 },
      ];

      vi.mocked(prisma.dailyAlertMetrics.findMany).mockResolvedValue(mockMetrics as any);

      const result = await getAlertBurndownData(['c1', 'c2']);

      expect(result.dates).toContain('2024-01-01');
      expect(result.dates).toContain('2024-01-02');
    });

    it('should aggregate across clients on same day', async () => {
      const mockMetrics = [
        { metricDate: new Date('2024-01-01'), clientId: 'c1', createdCount: 5, resolvedCount: 2 },
        { metricDate: new Date('2024-01-01'), clientId: 'c2', createdCount: 3, resolvedCount: 1 },
      ];

      vi.mocked(prisma.dailyAlertMetrics.findMany).mockResolvedValue(mockMetrics as any);

      const result = await getAlertBurndownData(['c1', 'c2']);

      const jan1Index = result.dates.indexOf('2024-01-01');
      expect(result.created[jan1Index]).toBe(8); // 5 + 3
      expect(result.resolved[jan1Index]).toBe(3); // 2 + 1
    });

    it('should calculate cumulative correctly', async () => {
      const mockMetrics = [
        { metricDate: new Date('2024-01-01'), clientId: 'c1', createdCount: 10, resolvedCount: 3 },
        { metricDate: new Date('2024-01-02'), clientId: 'c1', createdCount: 5, resolvedCount: 8 },
        { metricDate: new Date('2024-01-03'), clientId: 'c1', createdCount: 3, resolvedCount: 2 },
      ];

      vi.mocked(prisma.dailyAlertMetrics.findMany).mockResolvedValue(mockMetrics as any);

      const result = await getAlertBurndownData(['c1']);

      // Day 1: 10 - 3 = 7 cumulative
      // Day 2: 7 + (5 - 8) = 4 cumulative
      // Day 3: 4 + (3 - 2) = 5 cumulative
      expect(result.cumulative[0]).toBe(7);
      expect(result.cumulative[1]).toBe(4);
      expect(result.cumulative[2]).toBe(5);
    });

    it('should sort dates ascending', async () => {
      const mockMetrics = [
        { metricDate: new Date('2024-01-03'), clientId: 'c1', createdCount: 1, resolvedCount: 1 },
        { metricDate: new Date('2024-01-01'), clientId: 'c1', createdCount: 1, resolvedCount: 1 },
        { metricDate: new Date('2024-01-02'), clientId: 'c1', createdCount: 1, resolvedCount: 1 },
      ];

      vi.mocked(prisma.dailyAlertMetrics.findMany).mockResolvedValue(mockMetrics as any);

      const result = await getAlertBurndownData(['c1']);

      expect(result.dates[0]).toBe('2024-01-01');
      expect(result.dates[1]).toBe('2024-01-02');
      expect(result.dates[2]).toBe('2024-01-03');
    });

    it('should handle empty metrics', async () => {
      vi.mocked(prisma.dailyAlertMetrics.findMany).mockResolvedValue([]);

      const result = await getAlertBurndownData(['c1']);

      expect(result.dates).toHaveLength(0);
      expect(result.created).toHaveLength(0);
      expect(result.resolved).toHaveLength(0);
      expect(result.cumulative).toHaveLength(0);
    });
  });

  // =============================================================================
  // DEFAULT WIDGETS TESTS
  // =============================================================================

  describe('DEFAULT_WIDGETS', () => {
    it('should have unique ids', () => {
      const ids = DEFAULT_WIDGETS.map(w => w.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have sequential positions', () => {
      const positions = DEFAULT_WIDGETS.map(w => w.position).sort((a, b) => a - b);
      positions.forEach((pos, index) => {
        expect(pos).toBe(index);
      });
    });

    it('should have valid sizes', () => {
      const validSizes = ['small', 'medium', 'large'];
      DEFAULT_WIDGETS.forEach(widget => {
        expect(validSizes).toContain(widget.size);
      });
    });

    it('should include core KPI widgets', () => {
      const kpiWidgets = DEFAULT_WIDGETS.filter(w => w.type === 'kpi');
      expect(kpiWidgets.length).toBeGreaterThanOrEqual(4);
    });
  });
});
