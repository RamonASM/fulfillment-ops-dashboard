// =============================================================================
// PORTAL ANALYTICS PAGE - ENHANCED
// Comprehensive analytics dashboard for portal users with parity to admin dashboard
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Package, AlertTriangle, Activity } from "lucide-react";
import { usePortalAuthStore } from "../stores/auth.store";
import { portalApi } from "../api/client";
import { Skeleton } from "../components/ui/Skeleton";
import { MonthlyTrendsChart } from "../components/charts/MonthlyTrendsChart";
import { StockHealthDonut } from "../components/charts/StockHealthDonut";
import { SmartReorderWidget } from "../components/widgets/SmartReorderWidget";
import { UpcomingStockoutsWidget } from "../components/widgets/UpcomingStockoutsWidget";
import { TopProductsWidget } from "../components/widgets/TopProductsWidget";

interface PortalSummary {
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
    trend: "up" | "down" | "stable";
  };
  topProducts: Array<{
    id: string;
    name: string;
    units: number;
  }>;
  upcomingStockouts: Array<{
    name: string;
    daysUntil: number;
    currentStock: number;
  }>;
  totalProducts: number;
}

interface MonthlyTrendsData {
  labels: string[];
  orders: number[];
  units: number[];
}

export default function Analytics() {
  const { user } = usePortalAuthStore();

  // Fetch analytics summary
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["portal", "analytics", "summary"],
    queryFn: async () => {
      const response = await portalApi.get<{ data: PortalSummary }>(
        "/analytics/summary",
      );
      return response.data;
    },
    enabled: !!user?.clientId,
  });

  // Fetch monthly trends
  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ["portal", "analytics", "monthly-trends"],
    queryFn: async () => {
      const response = await portalApi.get<{ data: MonthlyTrendsData }>(
        "/analytics/monthly-trends",
      );
      return response.data;
    },
    enabled: !!user?.clientId,
  });

  const summary = summaryData || {
    stockHealth: { critical: 0, low: 0, watch: 0, healthy: 0, overstock: 0 },
    activity: {
      ordersThisWeek: 0,
      ordersLastWeek: 0,
      trend: "stable" as const,
    },
    topProducts: [],
    upcomingStockouts: [],
    totalProducts: 0,
  };

  const trends = trendsData || {
    labels: [],
    orders: [],
    units: [],
  };

  // Convert top products to proper format with trend
  const topProductsWithTrend = summary.topProducts.map((p) => ({
    ...p,
    trend: "stable" as const,
  }));

  // Convert upcomingStockouts to proper format
  const upcomingStockoutsFormatted = summary.upcomingStockouts.map((s) => ({
    id: s.name,
    name: s.name,
    daysUntil: s.daysUntil,
    currentStock: s.currentStock,
  }));

  // Calculate KPI stats
  const totalOrders = trends.orders.reduce((sum, v) => sum + v, 0);
  const totalUnits = trends.units.reduce((sum, v) => sum + v, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Comprehensive inventory insights and trends
        </p>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Products"
          value={summary.totalProducts}
          icon={Package}
          loading={summaryLoading}
        />
        <SummaryCard
          title="Orders This Week"
          value={summary.activity.ordersThisWeek}
          icon={TrendingUp}
          color={
            summary.activity.trend === "up"
              ? "green"
              : summary.activity.trend === "down"
                ? "red"
                : "emerald"
          }
          loading={summaryLoading}
        />
        <SummaryCard
          title="Critical Stock"
          value={summary.stockHealth.critical}
          icon={AlertTriangle}
          color="red"
          loading={summaryLoading}
        />
        <SummaryCard
          title="Upcoming Stockouts"
          value={summary.upcomingStockouts.length}
          icon={Activity}
          color="amber"
          loading={summaryLoading}
        />
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {summaryLoading ? (
          <>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <Skeleton className="h-[280px] w-full" />
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <Skeleton className="h-[300px] w-full" />
            </div>
          </>
        ) : (
          <>
            <div data-testid="stock-health-widget">
              <StockHealthDonut data={summary.stockHealth} />
            </div>
            {!trendsLoading && trends.labels.length > 0 && (
              <div data-testid="usage-trends-chart">
                <MonthlyTrendsChart data={trends} height={300} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Action Items Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {summaryLoading ? (
          <>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <Skeleton className="h-[400px] w-full" />
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <Skeleton className="h-[400px] w-full" />
            </div>
          </>
        ) : (
          <>
            <UpcomingStockoutsWidget
              products={upcomingStockoutsFormatted}
              limit={5}
            />
            <div data-testid="reorder-suggestions">
              <SmartReorderWidget limit={5} />
            </div>
          </>
        )}
      </div>

      {/* Performance Row */}
      <div className="grid grid-cols-1 gap-6">
        {summaryLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : (
          topProductsWithTrend.length > 0 && (
            <TopProductsWidget products={topProductsWithTrend} limit={5} />
          )
        )}
      </div>

      {/* Additional Stats */}
      {!summaryLoading && totalOrders > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Overall Statistics
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-gray-900">{totalOrders}</p>
              <p className="text-sm text-gray-500 mt-1">Total Orders (12mo)</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-blue-600">
                {totalUnits.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 mt-1">Total Units (12mo)</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-green-600">
                {summary.stockHealth.healthy}
              </p>
              <p className="text-sm text-gray-500 mt-1">Healthy Stock</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-amber-600">
                {summary.stockHealth.low + summary.stockHealth.critical}
              </p>
              <p className="text-sm text-gray-500 mt-1">Need Attention</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Summary Card Component
function SummaryCard({
  title,
  value,
  icon: Icon,
  color = "emerald",
  loading = false,
}: {
  title: string;
  value: number;
  icon: typeof Package;
  color?: "emerald" | "green" | "amber" | "red";
  loading?: boolean;
}) {
  const colorClasses = {
    emerald: "bg-emerald-100 text-emerald-600",
    green: "bg-green-100 text-green-600",
    amber: "bg-amber-100 text-amber-600",
    red: "bg-red-100 text-red-600",
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <Skeleton className="h-10 w-10 rounded-lg mb-3" />
        <Skeleton className="h-4 w-20 mb-2" />
        <Skeleton className="h-8 w-16" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div
        className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-3`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
