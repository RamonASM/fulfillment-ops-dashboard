// =============================================================================
// MONTHLY TRENDS CHART WIDGET
// Line chart showing orders and units over time
// =============================================================================

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts';

interface MonthlyTrendsData {
  labels: string[];
  orders: number[];
  units: number[];
  products?: number[];
}

interface MonthlyTrendsChartProps {
  data: MonthlyTrendsData;
  title?: string;
  height?: number;
  showProducts?: boolean;
}

export function MonthlyTrendsChart({
  data,
  title = 'Monthly Trends',
  height = 300,
  showProducts = false,
}: MonthlyTrendsChartProps) {
  // Transform data for recharts
  const chartData = data.labels.map((label, index) => ({
    month: label,
    orders: data.orders[index],
    units: data.units[index],
    products: data.products?.[index] || 0,
  }));

  // Calculate summary stats
  const totalOrders = data.orders.reduce((sum, v) => sum + v, 0);
  const totalUnits = data.units.reduce((sum, v) => sum + v, 0);
  const avgOrders = Math.round(totalOrders / data.orders.length) || 0;
  const avgUnits = Math.round(totalUnits / data.units.length) || 0;

  // Calculate trend
  const recentOrders = data.orders.slice(-3).reduce((sum, v) => sum + v, 0) / 3;
  const previousOrders = data.orders.slice(-6, -3).reduce((sum, v) => sum + v, 0) / 3;
  const ordersTrend = previousOrders > 0
    ? Math.round(((recentOrders - previousOrders) / previousOrders) * 100)
    : 0;

  if (!data.labels || data.labels.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <p className="text-gray-500 text-center py-8">No data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-gray-500">Total Orders:</span>{' '}
            <span className="font-medium text-gray-900">
              {totalOrders.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Total Units:</span>{' '}
            <span className="font-medium text-blue-600">
              {totalUnits.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Trend:</span>{' '}
            <span
              className={`font-medium ${
                ordersTrend > 0
                  ? 'text-emerald-600'
                  : ordersTrend < 0
                  ? 'text-red-600'
                  : 'text-gray-600'
              }`}
            >
              {ordersTrend > 0 ? '+' : ''}
              {ordersTrend}%
            </span>
          </div>
        </div>
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: '#6B7280' }}
              tickLine={false}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12, fill: '#6B7280' }}
              tickLine={false}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12, fill: '#6B7280' }}
              tickLine={false}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  orders: 'Orders',
                  units: 'Units',
                  products: 'Active Products',
                };
                return [value.toLocaleString(), labels[name] || name];
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '16px' }}
              formatter={(value) => {
                const labels: Record<string, string> = {
                  orders: 'Orders',
                  units: 'Units',
                  products: 'Active Products',
                };
                return labels[value] || value;
              }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="units"
              fill="#DBEAFE"
              stroke="#3B82F6"
              strokeWidth={2}
              fillOpacity={0.3}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="orders"
              stroke="#10B981"
              strokeWidth={2}
              dot={{ fill: '#10B981', r: 3 }}
              activeDot={{ r: 5 }}
            />
            {showProducts && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="products"
                stroke="#8B5CF6"
                strokeWidth={2}
                dot={{ fill: '#8B5CF6', r: 3 }}
                activeDot={{ r: 5 }}
                strokeDasharray="5 5"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">{avgOrders}</p>
          <p className="text-xs text-gray-500">Avg Orders/Month</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-blue-600">{avgUnits.toLocaleString()}</p>
          <p className="text-xs text-gray-500">Avg Units/Month</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">
            {data.orders[data.orders.length - 1] || 0}
          </p>
          <p className="text-xs text-gray-500">Latest Month Orders</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-blue-600">
            {(data.units[data.units.length - 1] || 0).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">Latest Month Units</p>
        </div>
      </div>
    </div>
  );
}

export default MonthlyTrendsChart;
