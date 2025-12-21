// =============================================================================
// STOCK HEALTH DONUT WIDGET
// Donut chart showing stock health distribution with drill-down support
// =============================================================================

import { useRef, useMemo, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { Camera, FileSpreadsheet, Loader2 } from "lucide-react";
import { useWidgetExport } from "@/hooks/useWidgetExport";

interface StockHealthData {
  critical: number;
  low: number;
  watch: number;
  healthy: number;
  overstock: number;
}

type StockStatus = keyof StockHealthData;

interface StockHealthDonutProps {
  data: StockHealthData;
  title?: string;
  height?: number;
  showLegend?: boolean;
  onStatusClick?: (status: StockStatus, count: number) => void;
  showExport?: boolean;
}

const COLORS = {
  critical: "#EF4444",
  low: "#F59E0B",
  watch: "#3B82F6",
  healthy: "#10B981",
  overstock: "#8B5CF6",
};

const LABELS = {
  critical: "Critical",
  low: "Low Stock",
  watch: "Watch",
  healthy: "Healthy",
  overstock: "Overstock",
};

export function StockHealthDonut({
  data,
  title = "Stock Health",
  height = 280,
  showLegend = true,
  onStatusClick,
  showExport = true,
}: StockHealthDonutProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Use shared export hook with lazy-loaded html2canvas
  const { exportToPNG, isExporting } = useWidgetExport({
    widgetRef: chartRef,
    title,
  });

  // Memoize chart data transformation
  const chartData = useMemo(
    () =>
      Object.entries(data)
        .filter(([, value]) => value > 0)
        .map(([key, value]) => ({
          name: LABELS[key as keyof typeof LABELS],
          value,
          color: COLORS[key as keyof typeof COLORS],
          status: key as StockStatus,
        })),
    [data]
  );

  const total = useMemo(
    () => chartData.reduce((sum, item) => sum + item.value, 0),
    [chartData]
  );

  // Handle segment click for drill-down
  const handleSegmentClick = useCallback(
    (entry: { status: StockStatus; value: number }) => {
      if (onStatusClick) {
        onStatusClick(entry.status, entry.value);
      }
    },
    [onStatusClick]
  );

  // Export data as CSV
  const exportToCSV = useCallback(() => {
    const csvContent = [
      "Status,Count,Percentage",
      ...Object.entries(data).map(
        ([key, value]) =>
          `${LABELS[key as keyof typeof LABELS]},${value},${total > 0 ? Math.round((value / total) * 100) : 0}%`,
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [data, title, total]);

  if (total === 0) {
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
        {showExport && (
          <div className="flex gap-1">
            <button
              onClick={exportToPNG}
              disabled={isExporting}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
              title="Export as PNG"
              aria-label="Export chart as PNG image"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={exportToCSV}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Export as CSV"
              aria-label="Export data as CSV file"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

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
              onClick={(_, index) => handleSegmentClick(chartData[index])}
              style={{ cursor: onStatusClick ? "pointer" : "default" }}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
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
          <button
            key={key}
            className={`text-center p-2 rounded-lg transition-colors ${
              onStatusClick ? "hover:bg-gray-50 cursor-pointer" : ""
            }`}
            onClick={() =>
              onStatusClick?.(
                key as StockStatus,
                data[key as keyof StockHealthData],
              )
            }
            disabled={!onStatusClick}
          >
            <div
              className="w-3 h-3 rounded-full mx-auto mb-1"
              style={{ backgroundColor: COLORS[key as keyof typeof COLORS] }}
            />
            <p className="text-lg font-bold text-gray-900">
              {data[key as keyof StockHealthData]}
            </p>
            <p className="text-xs text-gray-500">{label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default StockHealthDonut;
