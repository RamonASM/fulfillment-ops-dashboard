// =============================================================================
// PORTAL ANALYTICS PAGE (Phase 11)
// Stock velocity, trends, and insights for portal users
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Package,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { usePortalAuthStore } from '../stores/auth.store';
import { portalApi } from '../api/client';
import { Skeleton } from '../components/ui/Skeleton';

interface StockVelocity {
  productId: string;
  productName: string;
  avgDailyUsage: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
}

interface UsageTrend {
  date: string;
  units: number;
  packs: number;
}

interface RiskProduct {
  productId: string;
  productName: string;
  riskScore: number;
  riskLevel: string;
  stockStatus: string;
  weeksRemaining: number | null;
  currentStock: number;
}

export default function Analytics() {
  const { user } = usePortalAuthStore();

  // Fetch stock velocity data
  const { data: velocityData, isLoading: velocityLoading } = useQuery({
    queryKey: ['portal', 'analytics', 'velocity'],
    queryFn: async () => {
      const response = await portalApi.get<{ data: StockVelocity[] }>('/analytics/stock-velocity');
      return response.data;
    },
    enabled: !!user?.clientId,
  });

  // Fetch usage trends
  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['portal', 'analytics', 'trends'],
    queryFn: async () => {
      const response = await portalApi.get<{ data: UsageTrend[] }>('/analytics/usage-trends');
      return response.data;
    },
    enabled: !!user?.clientId,
  });

  // Fetch risk products
  const { data: riskData, isLoading: riskLoading } = useQuery({
    queryKey: ['portal', 'analytics', 'risk'],
    queryFn: async () => {
      const response = await portalApi.get<{ data: RiskProduct[] }>('/analytics/risk-products');
      return response.data;
    },
    enabled: !!user?.clientId,
  });

  const topMovers = velocityData
    ?.sort((a: StockVelocity, b: StockVelocity) => b.avgDailyUsage - a.avgDailyUsage)
    .slice(0, 5) || [];

  const slowMovers = velocityData
    ?.filter((p: StockVelocity) => p.avgDailyUsage > 0)
    .sort((a: StockVelocity, b: StockVelocity) => a.avgDailyUsage - b.avgDailyUsage)
    .slice(0, 5) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Inventory trends, stock velocity, and consumption patterns
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Products"
          value={velocityData?.length || 0}
          icon={Package}
          loading={velocityLoading}
        />
        <SummaryCard
          title="High Velocity"
          value={velocityData?.filter((p: StockVelocity) => p.avgDailyUsage > 10).length || 0}
          icon={TrendingUp}
          color="green"
          loading={velocityLoading}
        />
        <SummaryCard
          title="Low Velocity"
          value={velocityData?.filter((p: StockVelocity) => p.avgDailyUsage < 1).length || 0}
          icon={TrendingDown}
          color="amber"
          loading={velocityLoading}
        />
        <SummaryCard
          title="At Risk"
          value={riskData?.length || 0}
          icon={AlertTriangle}
          color="red"
          loading={riskLoading}
        />
      </div>

      {/* Usage Trends Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Usage Trends (Last 30 Days)
          </h2>
        </div>

        {trendsLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : trendsData && trendsData.length > 0 ? (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="units"
                  name="Units"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-500">
            No trend data available
          </div>
        )}
      </div>

      {/* Top Movers and Slow Movers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Movers */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Top Movers
            </h2>
          </div>

          {velocityLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : topMovers.length > 0 ? (
            <div className="space-y-3">
              {topMovers.map((product: StockVelocity, index: number) => (
                <div
                  key={product.productId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 flex items-center justify-center bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                      {product.productName}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-emerald-600">
                      {product.avgDailyUsage.toFixed(1)}/day
                    </span>
                    {product.trend !== 'stable' && (
                      <span className={`ml-2 text-xs ${
                        product.trend === 'increasing' ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {product.trend === 'increasing' ? '+' : '-'}{product.changePercent.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No data available</p>
          )}
        </div>

        {/* Slow Movers */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Slow Movers
            </h2>
          </div>

          {velocityLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : slowMovers.length > 0 ? (
            <div className="space-y-3">
              {slowMovers.map((product: StockVelocity, index: number) => (
                <div
                  key={product.productId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 flex items-center justify-center bg-amber-100 text-amber-700 text-sm font-medium rounded-full">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                      {product.productName}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-amber-600">
                      {product.avgDailyUsage.toFixed(2)}/day
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No data available</p>
          )}
        </div>
      </div>

      {/* At-Risk Products */}
      {riskData && riskData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Products at Risk
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Product</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Risk Score</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Weeks Remaining</th>
                </tr>
              </thead>
              <tbody>
                {riskData.slice(0, 10).map((product: RiskProduct) => (
                  <tr key={product.productId} className="border-b border-gray-100">
                    <td className="py-3 px-4 text-sm text-gray-900">{product.productName}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        product.riskScore >= 80 ? 'bg-red-100 text-red-800' :
                        product.riskScore >= 60 ? 'bg-amber-100 text-amber-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {product.riskScore}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{product.stockStatus}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{product.weeksRemaining ?? 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  color = 'emerald',
  loading = false,
}: {
  title: string;
  value: number;
  icon: typeof Package;
  color?: 'emerald' | 'green' | 'amber' | 'red';
  loading?: boolean;
}) {
  const colorClasses = {
    emerald: 'bg-emerald-100 text-emerald-600',
    green: 'bg-green-100 text-green-600',
    amber: 'bg-amber-100 text-amber-600',
    red: 'bg-red-100 text-red-600',
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
      <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-3`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
