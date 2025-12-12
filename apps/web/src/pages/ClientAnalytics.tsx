// =============================================================================
// CLIENT ANALYTICS PAGE
// Comprehensive analytics dashboard for a specific client
// =============================================================================

import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, TrendingUp, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '@/api/client';
import { fadeInUp } from '@/lib/animations';

// Import all analytics widgets
import { StockHealthDonut } from '@/components/widgets/StockHealthDonut';
import { TopProductsWidget } from '@/components/widgets/TopProductsWidget';
import { UpcomingStockoutsWidget } from '@/components/widgets/UpcomingStockoutsWidget';
import { ReorderQueueWidget } from '@/components/widgets/ReorderQueueWidget';
import { MonthlyTrendsChart } from '@/components/widgets/MonthlyTrendsChart';
import { AnomalyAlertsWidget } from '@/components/widgets/AnomalyAlertsWidget';
import { LocationAnalyticsWidget } from '@/components/widgets/LocationAnalyticsWidget';
import { KPIGrid } from '@/components/widgets/KPICard';

interface IntelligentSummary {
  stockHealth: {
    critical: number;
    low: number;
    watch: number;
    healthy: number;
    overstock: number;
  };
  activity: {
    ordersThisWeek: number;
    ordersLastWeek: number;
    unitsThisMonth: number;
    avgDailyOrders: number;
  };
  alerts: {
    critical: number;
    warnings: number;
    info: number;
  };
  topProducts: Array<{ id: string; name: string; units: number; trend: string }>;
  upcomingStockouts: Array<{ id: string; name: string; daysUntil: number; currentStock: number }>;
  reorderQueue: Array<{
    productId: string;
    productName: string;
    currentStock: number;
    monthlyUsage: number;
    weeksOfSupply: number;
    suggestedOrderQty: number;
    urgency: 'critical' | 'soon' | 'planned';
    reason: string;
    estimatedStockoutDate: string | null;
  }>;
}

interface AnomalyAlert {
  type: 'demand_spike' | 'demand_drop' | 'unusual_order' | 'dead_stock' | 'overstock';
  severity: 'high' | 'medium' | 'low';
  productId?: string;
  productName?: string;
  locationId?: string;
  message: string;
  details: string;
  detectedAt: string;
  value?: number;
  expectedValue?: number;
}

interface LocationAnalytics {
  locationId: string;
  locationName: string;
  company: string;
  totalOrders: number;
  totalUnits: number;
  orderFrequency: number;
  topProducts: Array<{ productId: string; name: string; units: number }>;
  lastOrderDate: string | null;
}

interface MonthlyTrends {
  labels: string[];
  orders: number[];
  units: number[];
  products: number[];
}

export default function ClientAnalytics() {
  const { clientId } = useParams<{ clientId: string }>();

  // Fetch client info
  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => api.get<{ name: string; code: string }>(`/clients/${clientId}`),
    enabled: !!clientId,
  });

  // Fetch intelligent summary
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['analytics', 'intelligent-summary', clientId],
    queryFn: () => api.get<{ data: IntelligentSummary }>(`/analytics/intelligent-summary/${clientId}`),
    enabled: !!clientId,
    staleTime: 60000, // 1 minute
  });

  // Fetch anomalies
  const { data: anomaliesData, isLoading: anomaliesLoading } = useQuery({
    queryKey: ['analytics', 'anomalies', clientId],
    queryFn: () => api.get<{ data: AnomalyAlert[] }>(`/analytics/anomalies/${clientId}`),
    enabled: !!clientId,
    staleTime: 60000,
  });

  // Fetch locations
  const { data: locationsData, isLoading: locationsLoading } = useQuery({
    queryKey: ['analytics', 'locations', clientId],
    queryFn: () => api.get<{ data: LocationAnalytics[] }>(`/analytics/locations/${clientId}`),
    enabled: !!clientId,
    staleTime: 60000,
  });

  // Fetch monthly trends
  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['analytics', 'monthly-trends', clientId],
    queryFn: () => api.get<{ data: MonthlyTrends }>(`/analytics/monthly-trends/${clientId}`),
    enabled: !!clientId,
    staleTime: 60000,
  });

  const summary = summaryData?.data;
  const anomalies = anomaliesData?.data || [];
  const locations = locationsData?.data || [];
  const trends = trendsData?.data || { labels: [], orders: [], units: [], products: [] };

  const isLoading = clientLoading || summaryLoading;

  // Calculate KPI cards data
  const kpiCards = summary
    ? [
        {
          label: 'Total Products',
          value:
            summary.stockHealth.critical +
            summary.stockHealth.low +
            summary.stockHealth.watch +
            summary.stockHealth.healthy +
            summary.stockHealth.overstock,
          trend: {
            direction: 'stable' as const,
            percent: 0,
            period: 'all time',
          },
          sparkline: trends.products.slice(-7),
          color: 'blue' as const,
        },
        {
          label: 'Orders This Week',
          value: summary.activity.ordersThisWeek,
          trend: {
            direction:
              summary.activity.ordersThisWeek > summary.activity.ordersLastWeek
                ? ('up' as const)
                : summary.activity.ordersThisWeek < summary.activity.ordersLastWeek
                ? ('down' as const)
                : ('stable' as const),
            percent:
              summary.activity.ordersLastWeek > 0
                ? Math.abs(
                    ((summary.activity.ordersThisWeek - summary.activity.ordersLastWeek) /
                      summary.activity.ordersLastWeek) *
                      100
                  )
                : 0,
            period: 'vs last week',
          },
          sparkline: trends.orders.slice(-7),
          color: 'green' as const,
        },
        {
          label: 'Units This Month',
          value: summary.activity.unitsThisMonth,
          unit: 'units',
          trend: {
            direction: 'stable' as const,
            percent: 0,
            period: 'this month',
          },
          sparkline: trends.units.slice(-7),
          color: 'amber' as const,
        },
        {
          label: 'Active Alerts',
          value: summary.alerts.critical + summary.alerts.warnings + summary.alerts.info,
          trend: {
            direction: summary.alerts.critical > 0 ? ('up' as const) : ('stable' as const),
            percent: summary.alerts.critical,
            period: 'critical',
          },
          sparkline: [],
          color: summary.alerts.critical > 0 ? ('red' as const) : ('blue' as const),
        },
      ]
    : [];

  return (
    <motion.div
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to={`/clients/${clientId}`}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">
                {clientLoading ? 'Loading...' : client?.name || 'Client'} Analytics
              </h1>
            </div>
            <p className="text-gray-500 mt-1">
              Comprehensive inventory intelligence and insights
            </p>
          </div>
        </div>

        <button
          onClick={() => refetchSummary()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Loading analytics...</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <KPIGrid cards={kpiCards} />

          {/* Main Grid - Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Stock Health Donut */}
            <StockHealthDonut
              data={
                summary?.stockHealth || {
                  critical: 0,
                  low: 0,
                  watch: 0,
                  healthy: 0,
                  overstock: 0,
                }
              }
            />

            {/* Top Products */}
            <TopProductsWidget
              products={
                summary?.topProducts.map((p) => ({
                  ...p,
                  trend: p.trend as 'growing' | 'stable' | 'declining',
                })) || []
              }
              clientId={clientId}
            />

            {/* Upcoming Stockouts */}
            <UpcomingStockoutsWidget
              stockouts={summary?.upcomingStockouts || []}
              clientId={clientId}
            />
          </div>

          {/* Main Grid - Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Trends Chart */}
            {!trendsLoading && (
              <MonthlyTrendsChart data={trends} height={320} showProducts />
            )}

            {/* Anomaly Alerts */}
            {!anomaliesLoading && (
              <AnomalyAlertsWidget anomalies={anomalies} limit={4} />
            )}
          </div>

          {/* Main Grid - Row 3 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Reorder Queue */}
            <ReorderQueueWidget
              recommendations={summary?.reorderQueue || []}
              limit={5}
            />

            {/* Location Analytics */}
            {!locationsLoading && (
              <LocationAnalyticsWidget locations={locations} limit={4} />
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
