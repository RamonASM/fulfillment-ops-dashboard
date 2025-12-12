// =============================================================================
// STOCK HEALTH DONUT WIDGET
// Donut chart showing stock health distribution
// =============================================================================

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface StockHealthData {
  critical: number;
  low: number;
  watch: number;
  healthy: number;
  overstock: number;
}

interface StockHealthDonutProps {
  data: StockHealthData;
  title?: string;
  height?: number;
  showLegend?: boolean;
}

const COLORS = {
  critical: '#EF4444',
  low: '#F59E0B',
  watch: '#3B82F6',
  healthy: '#10B981',
  overstock: '#8B5CF6',
};

const LABELS = {
  critical: 'Critical',
  low: 'Low Stock',
  watch: 'Watch',
  healthy: 'Healthy',
  overstock: 'Overstock',
};

export function StockHealthDonut({
  data,
  title = 'Stock Health',
  height = 280,
  showLegend = true,
}: StockHealthDonutProps) {
  const chartData = Object.entries(data)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: LABELS[key as keyof typeof LABELS],
      value,
      color: COLORS[key as keyof typeof COLORS],
    }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <p className="text-gray-500 text-center py-8">No data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
              formatter={(value: number, name: string) => [
                `${value} products (${Math.round((value / total) * 100)}%)`,
                name,
              ]}
            />
            {showLegend && (
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                formatter={(value) => (
                  <span className="text-sm text-gray-600">{value}</span>
                )}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats below chart */}
      <div className="grid grid-cols-5 gap-2 mt-4 pt-4 border-t border-gray-100">
        {Object.entries(LABELS).map(([key, label]) => (
          <div key={key} className="text-center">
            <div
              className="w-3 h-3 rounded-full mx-auto mb-1"
              style={{ backgroundColor: COLORS[key as keyof typeof COLORS] }}
            />
            <p className="text-lg font-bold text-gray-900">
              {data[key as keyof StockHealthData]}
            </p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default StockHealthDonut;
