// =============================================================================
// DASHBOARD SERVICE (Phase 11)
// User dashboard preferences and widget data
// =============================================================================

import { prisma, Prisma } from '../lib/prisma.js';
import { cache, CacheTTL, CacheKeys } from '../lib/cache.js';
import { subDays } from 'date-fns';

// Types
export interface WidgetConfig {
  id: string;
  type: string;
  visible: boolean;
  position: number;
  size: 'small' | 'medium' | 'large';
  settings?: Record<string, unknown>;
}

export interface DashboardLayout {
  columns: number;
  widgets: WidgetConfig[];
}

export interface DashboardPreferences {
  userId: string;
  layout: DashboardLayout;
  refreshRate: number;
  theme: string;
}

// Default widget configurations
export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'kpi-inventory', type: 'kpi', visible: true, position: 0, size: 'small' },
  { id: 'kpi-alerts', type: 'kpi', visible: true, position: 1, size: 'small' },
  { id: 'kpi-turnover', type: 'kpi', visible: true, position: 2, size: 'small' },
  { id: 'kpi-resolution', type: 'kpi', visible: true, position: 3, size: 'small' },
  { id: 'health-heatmap', type: 'heatmap', visible: true, position: 4, size: 'large' },
  { id: 'alert-burndown', type: 'chart', visible: true, position: 5, size: 'medium' },
  { id: 'risk-overview', type: 'chart', visible: true, position: 6, size: 'medium' },
  { id: 'forecast-accuracy', type: 'chart', visible: false, position: 7, size: 'medium' },
];

const DEFAULT_LAYOUT: DashboardLayout = {
  columns: 4,
  widgets: DEFAULT_WIDGETS,
};

// =============================================================================
// PREFERENCES MANAGEMENT
// =============================================================================

export async function getDashboardPreferences(
  userId: string
): Promise<DashboardPreferences> {
  const pref = await prisma.userDashboardPreference.findUnique({
    where: { userId },
  });

  if (!pref) {
    return {
      userId,
      layout: DEFAULT_LAYOUT,
      refreshRate: 300000, // 5 minutes
      theme: 'light',
    };
  }

  return {
    userId,
    layout: (pref.layout as unknown as DashboardLayout) || DEFAULT_LAYOUT,
    refreshRate: pref.refreshRate,
    theme: pref.theme,
  };
}

export async function updateDashboardPreferences(
  userId: string,
  updates: Partial<Omit<DashboardPreferences, 'userId'>>
): Promise<DashboardPreferences> {
  const existing = await prisma.userDashboardPreference.findUnique({
    where: { userId },
  });

  const data = {
    layout: (updates.layout ?? existing?.layout ?? DEFAULT_LAYOUT) as unknown as Prisma.InputJsonValue,
    widgets: (updates.layout?.widgets ?? existing?.widgets ?? DEFAULT_WIDGETS) as unknown as Prisma.InputJsonValue,
    refreshRate: updates.refreshRate ?? existing?.refreshRate ?? 300000,
    theme: updates.theme ?? existing?.theme ?? 'light',
  };

  const pref = await prisma.userDashboardPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  // Invalidate widget data cache
  await cache.deletePattern(`dashboard:${userId}`);

  return {
    userId,
    layout: (pref.layout as unknown as DashboardLayout),
    refreshRate: pref.refreshRate,
    theme: pref.theme,
  };
}

// =============================================================================
// WIDGET DATA
// =============================================================================

export interface KPIWidgetData {
  label: string;
  value: number;
  unit?: string;
  trend: {
    direction: 'up' | 'down' | 'stable';
    percent: number;
    period: string;
  };
  sparkline: number[];
}

export interface HealthHeatmapData {
  clients: Array<{
    id: string;
    name: string;
    products: Array<{
      id: string;
      name: string;
      status: string;
      weeksRemaining: number | null;
    }>;
  }>;
}

export interface AlertBurndownData {
  dates: string[];
  created: number[];
  resolved: number[];
  cumulative: number[];
}

export async function getKPIWidgetData(
  userId: string,
  clientIds: string[]
): Promise<Record<string, KPIWidgetData>> {
  const cacheKey = CacheKeys.dashboardWidget(userId, 'kpi');
  const cached = await cache.get<Record<string, KPIWidgetData>>(cacheKey);
  if (cached) return cached;

  // Get current stats
  const products = await prisma.product.findMany({
    where: { clientId: { in: clientIds }, isActive: true },
    select: { stockStatus: true, weeksRemaining: true },
  });

  const alerts = await prisma.alert.findMany({
    where: { clientId: { in: clientIds }, status: 'active' },
    select: { createdAt: true, isDismissed: true, dismissedAt: true },
  });

  const resolvedAlerts = await prisma.alert.findMany({
    where: {
      clientId: { in: clientIds },
      isDismissed: true,
      dismissedAt: { gte: subDays(new Date(), 30) },
    },
  });

  // Calculate KPIs
  const totalProducts = products.length;
  const healthyProducts = products.filter(p => p.stockStatus === 'HEALTHY').length;
  const healthyPercent = totalProducts > 0 ? (healthyProducts / totalProducts) * 100 : 0;

  const activeAlerts = alerts.filter(a => !a.isDismissed).length;

  // Calculate avg resolution time
  let totalResolutionMs = 0;
  let resolvedCount = 0;
  for (const alert of resolvedAlerts) {
    if (alert.dismissedAt) {
      totalResolutionMs += alert.dismissedAt.getTime() - alert.createdAt.getTime();
      resolvedCount++;
    }
  }
  const avgResolutionHours = resolvedCount > 0
    ? totalResolutionMs / resolvedCount / (1000 * 60 * 60)
    : 0;

  // Get historical data for sparklines (last 7 days)
  const snapshots = await prisma.dailySnapshot.findMany({
    where: {
      product: { clientId: { in: clientIds } },
      snapshotDate: { gte: subDays(new Date(), 7) },
    },
    orderBy: { snapshotDate: 'asc' },
  });

  // Group snapshots by date for sparkline
  const dailyHealthy: number[] = [];
  const dateMap = new Map<string, { healthy: number; total: number }>();

  for (const s of snapshots) {
    const dateKey = s.snapshotDate.toISOString().split('T')[0];
    const entry = dateMap.get(dateKey) || { healthy: 0, total: 0 };
    entry.total++;
    if (s.stockStatus === 'HEALTHY') entry.healthy++;
    dateMap.set(dateKey, entry);
  }

  for (const entry of dateMap.values()) {
    dailyHealthy.push(entry.total > 0 ? (entry.healthy / entry.total) * 100 : 0);
  }

  // Pad to 7 days if needed
  while (dailyHealthy.length < 7) {
    dailyHealthy.unshift(healthyPercent);
  }

  const result: Record<string, KPIWidgetData> = {
    'kpi-inventory': {
      label: 'Inventory Health',
      value: Math.round(healthyPercent),
      unit: '%',
      trend: {
        direction: dailyHealthy[6] > dailyHealthy[0] ? 'up' : dailyHealthy[6] < dailyHealthy[0] ? 'down' : 'stable',
        percent: Math.abs(dailyHealthy[6] - dailyHealthy[0]),
        period: '7d',
      },
      sparkline: dailyHealthy,
    },
    'kpi-alerts': {
      label: 'Active Alerts',
      value: activeAlerts,
      trend: {
        direction: 'stable',
        percent: 0,
        period: '7d',
      },
      sparkline: [activeAlerts, activeAlerts, activeAlerts, activeAlerts, activeAlerts, activeAlerts, activeAlerts],
    },
    'kpi-turnover': {
      label: 'Avg Weeks Stock',
      value: Math.round(products.reduce((sum, p) => sum + (p.weeksRemaining || 0), 0) / (totalProducts || 1)),
      unit: 'weeks',
      trend: {
        direction: 'stable',
        percent: 0,
        period: '7d',
      },
      sparkline: [0, 0, 0, 0, 0, 0, 0],
    },
    'kpi-resolution': {
      label: 'Avg Resolution Time',
      value: Math.round(avgResolutionHours),
      unit: 'hrs',
      trend: {
        direction: avgResolutionHours < 24 ? 'up' : 'down',
        percent: 0,
        period: '30d',
      },
      sparkline: [avgResolutionHours, avgResolutionHours, avgResolutionHours, avgResolutionHours, avgResolutionHours, avgResolutionHours, avgResolutionHours],
    },
  };

  await cache.set(cacheKey, result, CacheTTL.DASHBOARD_WIDGETS);
  return result;
}

export async function getHealthHeatmapData(
  clientIds: string[]
): Promise<HealthHeatmapData> {
  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds }, isActive: true },
    include: {
      products: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          stockStatus: true,
          weeksRemaining: true,
        },
        orderBy: { stockStatus: 'asc' },
      },
    },
  });

  return {
    clients: clients.map(c => ({
      id: c.id,
      name: c.name,
      products: c.products.map(p => ({
        id: p.id,
        name: p.name,
        status: p.stockStatus || 'HEALTHY',
        weeksRemaining: p.weeksRemaining,
      })),
    })),
  };
}

export async function getAlertBurndownData(
  clientIds: string[],
  days: number = 30
): Promise<AlertBurndownData> {
  const startDate = subDays(new Date(), days);

  const metrics = await prisma.dailyAlertMetrics.findMany({
    where: {
      clientId: { in: clientIds },
      metricDate: { gte: startDate },
    },
    orderBy: { metricDate: 'asc' },
  });

  // Aggregate by date across clients
  const dateMap = new Map<string, { created: number; resolved: number }>();

  for (const m of metrics) {
    const dateKey = m.metricDate.toISOString().split('T')[0];
    const entry = dateMap.get(dateKey) || { created: 0, resolved: 0 };
    entry.created += m.createdCount;
    entry.resolved += m.resolvedCount;
    dateMap.set(dateKey, entry);
  }

  const dates: string[] = [];
  const created: number[] = [];
  const resolved: number[] = [];
  const cumulative: number[] = [];
  let cumulativeTotal = 0;

  const sortedDates = Array.from(dateMap.keys()).sort();
  for (const date of sortedDates) {
    const entry = dateMap.get(date)!;
    dates.push(date);
    created.push(entry.created);
    resolved.push(entry.resolved);
    cumulativeTotal += entry.created - entry.resolved;
    cumulative.push(cumulativeTotal);
  }

  return { dates, created, resolved, cumulative };
}
