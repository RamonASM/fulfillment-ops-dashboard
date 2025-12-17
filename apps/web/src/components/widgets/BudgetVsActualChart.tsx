// =============================================================================
// BUDGET VS ACTUAL CHART
// Time series visualization comparing budgeted vs actual spending
// =============================================================================

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { TrendingUp, Camera } from "lucide-react";
import html2canvas from "html2canvas";
import { api } from "@/api/client";

interface MonthlyBudgetData {
  month: string;
  budget: number;
  actual: number;
  forecast: number | null;
  variance: number;
}

interface BudgetVsActualChartProps {
  clientId: string;
  periodMonths?: number;
}

export function BudgetVsActualChart({
  clientId,
  periodMonths = 12,
}: BudgetVsActualChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Fetch budget time series data
  const { data: chartData, isLoading } = useQuery({
    queryKey: ["budget-vs-actual", clientId, periodMonths],
    queryFn: () =>
      api.get<{ data: MonthlyBudgetData[] }>(
        `/financial/budgets/time-series/${clientId}?months=${periodMonths}`,
      ),
    enabled: !!clientId,
  });

  const data = chartData?.data || [];

  // Export to PNG
  const exportToPNG = async () => {
    if (!chartRef.current) return;
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `budget_vs_actual_${new Date().toISOString().split("T")[0]}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Error exporting chart:", error);
    }
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const budget = payload.find((p: any) => p.dataKey === "budget")?.value || 0;
    const actual = payload.find((p: any) => p.dataKey === "actual")?.value || 0;
    const forecast =
      payload.find((p: any) => p.dataKey === "forecast")?.value || null;
    const variance = actual - budget;

    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-semibold text-gray-900 mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-blue-600">Budget:</span>
            <span className="font-medium">${budget.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-green-600">Actual:</span>
            <span className="font-medium">${actual.toLocaleString()}</span>
          </div>
          {forecast !== null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-purple-600">Forecast:</span>
              <span className="font-medium">${forecast.toLocaleString()}</span>
            </div>
          )}
          <div className="border-t border-gray-200 pt-1 mt-1">
            <div className="flex items-center justify-between gap-4">
              <span
                className={variance >= 0 ? "text-red-600" : "text-green-600"}
              >
                Variance:
              </span>
              <span
                className={`font-bold ${variance >= 0 ? "text-red-600" : "text-green-600"}`}
              >
                {variance >= 0 ? "+" : ""}${variance.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            Budget vs Actual
          </h3>
        </div>
        <div className="text-center py-12">
          <p className="text-gray-500">No budget data available</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={chartRef}
      className="bg-white rounded-lg border border-gray-200 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            Budget vs Actual Spending
          </h3>
        </div>
        <button
          onClick={exportToPNG}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title="Export as PNG"
        >
          <Camera className="w-4 h-4" />
        </button>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data}>
          <defs>
            <linearGradient id="varianceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
            tickLine={false}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "14px" }}
            iconType="line"
            iconSize={16}
          />

          {/* Variance shading area */}
          <Area
            type="monotone"
            dataKey="actual"
            fill="url(#varianceGradient)"
            stroke="none"
            fillOpacity={0.3}
          />

          {/* Budget line */}
          <Line
            type="monotone"
            dataKey="budget"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 4, fill: "#3b82f6" }}
            name="Budget"
          />

          {/* Actual line */}
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 4, fill: "#10b981" }}
            name="Actual"
          />

          {/* Forecast line (dotted) */}
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#8b5cf6"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3, fill: "#8b5cf6" }}
            name="Forecast"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-600 mb-1">Avg Budget</p>
          <p className="text-lg font-bold text-blue-900">
            $
            {(
              data.reduce((sum, d) => sum + d.budget, 0) / data.length
            ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <p className="text-xs text-green-600 mb-1">Avg Actual</p>
          <p className="text-lg font-bold text-green-900">
            $
            {(
              data.reduce((sum, d) => sum + d.actual, 0) / data.length
            ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <p className="text-xs text-purple-600 mb-1">Total Variance</p>
          <p
            className={`text-lg font-bold ${
              data.reduce((sum, d) => sum + d.variance, 0) >= 0
                ? "text-red-900"
                : "text-green-900"
            }`}
          >
            {data.reduce((sum, d) => sum + d.variance, 0) >= 0 ? "+" : ""}$
            {Math.abs(
              data.reduce((sum, d) => sum + d.variance, 0),
            ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>
    </div>
  );
}

export default BudgetVsActualChart;
