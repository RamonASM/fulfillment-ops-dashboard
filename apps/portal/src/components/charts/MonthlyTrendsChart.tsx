// =============================================================================
// MONTHLY TRENDS CHART - PORTAL VERSION
// Line chart showing orders and units over time for client portal
// =============================================================================

import { useRef } from "react";
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
} from "recharts";
import { Camera, FileSpreadsheet } from "lucide-react";
import html2canvas from "html2canvas";

interface MonthlyTrendsData {
  labels: string[];
  orders: number[];
  units: number[];
}

interface MonthlyTrendsChartProps {
  data: MonthlyTrendsData;
  title?: string;
  height?: number;
  showExport?: boolean;
}

export function MonthlyTrendsChart({
  data,
  title = "Monthly Trends",
  height = 300,
  showExport = true,
}: MonthlyTrendsChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Transform data for recharts
  const chartData = data.labels.map((label, index) => ({
    month: label,
    orders: data.orders[index],
    units: data.units[index],
  }));

  // Export chart as PNG
  const exportToPNG = async () => {
    if (!chartRef.current) return;
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Error exporting chart:", error);
    }
  };

  // Export data as CSV
  const exportToCSV = () => {
    const csvContent = [
      "Month,Orders,Units",
      ...chartData.map((row) => `${row.month},${row.orders},${row.units}`),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Calculate summary stats
  const totalOrders = data.orders.reduce((sum, v) => sum + v, 0);
  const totalUnits = data.units.reduce((sum, v) => sum + v, 0);
  const avgOrders = Math.round(totalOrders / data.orders.length) || 0;
  const avgUnits = Math.round(totalUnits / data.units.length) || 0;

  // Calculate trend
  const recentOrders = data.orders.slice(-3).reduce((sum, v) => sum + v, 0) / 3;
  const previousOrders =
    data.orders.slice(-6, -3).reduce((sum, v) => sum + v, 0) / 3;
  const ordersTrend =
    previousOrders > 0
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
    <div
      ref={chartRef}
      className="bg-white rounded-lg border border-gray-200 p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-4">
          {showExport && (
            <div className="flex gap-1 mr-4">
              <button
                onClick={exportToPNG}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Export as PNG"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                onClick={exportToCSV}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Export as CSV"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-500">Total Orders:</span>{" "}
              <span className="font-medium text-gray-900">
                {totalOrders.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Total Units:</span>{" "}
              <span className="font-medium text-blue-600">
                {totalUnits.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Trend:</span>{" "}
              <span
                className={`font-medium ${
                  ordersTrend > 0
                    ? "text-emerald-600"
                    : ordersTrend < 0
                      ? "text-red-600"
                      : "text-gray-600"
                }`}
              >
                {ordersTrend > 0 ? "+" : ""}
                {ordersTrend}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: "#6B7280" }}
              tickLine={false}
              axisLine={{ stroke: "#E5E7EB" }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12, fill: "#6B7280" }}
              tickLine={false}
              axisLine={{ stroke: "#E5E7EB" }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12, fill: "#6B7280" }}
              tickLine={false}
              axisLine={{ stroke: "#E5E7EB" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  orders: "Orders",
                  units: "Units",
                };
                return [value.toLocaleString(), labels[name] || name];
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: "16px" }}
              formatter={(value) => {
                const labels: Record<string, string> = {
                  orders: "Orders",
                  units: "Units",
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
              dot={{ fill: "#10B981", r: 3 }}
              activeDot={{ r: 5 }}
            />
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
          <p className="text-lg font-bold text-blue-600">
            {avgUnits.toLocaleString()}
          </p>
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
