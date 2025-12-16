import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

interface StockHealthData {
  critical: number;
  low: number;
  watch: number;
  healthy: number;
  overstock: number;
}

interface StockHealthChartProps {
  data: StockHealthData;
}

const COLORS = {
  critical: "#EF4444",
  low: "#F59E0B",
  watch: "#EAB308",
  healthy: "#10B981",
  overstock: "#6B7280",
};

export function StockHealthChart({ data }: StockHealthChartProps) {
  const chartData = [
    { name: "Critical", value: data.critical, color: COLORS.critical },
    { name: "Low", value: data.low, color: COLORS.low },
    { name: "Watch", value: data.watch, color: COLORS.watch },
    { name: "Healthy", value: data.healthy, color: COLORS.healthy },
    { name: "Overstock", value: data.overstock, color: COLORS.overstock },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Stock Health Overview</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="value"
            label
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
