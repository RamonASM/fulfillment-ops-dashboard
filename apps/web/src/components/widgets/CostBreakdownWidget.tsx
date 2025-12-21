// =============================================================================
// COST BREAKDOWN WIDGET
// Shows inventory cost composition (purchase, holding, ordering, shortage)
// =============================================================================

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { DollarSign, Camera, Loader2 } from "lucide-react";
import { useWidgetExport } from "@/hooks/useWidgetExport";
import { api } from "@/api/client";

interface CostBreakdown {
  purchaseCost: number;
  holdingCost: number;
  orderingCost: number;
  shortageCost: number;
  total: number;
}

interface CostBreakdownWidgetProps {
  clientId: string;
}

const COLORS = {
  purchase: "#3b82f6", // blue
  holding: "#f59e0b", // amber
  ordering: "#10b981", // green
  shortage: "#ef4444", // red
};

export function CostBreakdownWidget({ clientId }: CostBreakdownWidgetProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Use shared export hook with lazy-loaded html2canvas
  const { exportToPNG, isExporting } = useWidgetExport({
    widgetRef: chartRef,
    title: "Cost_Breakdown",
  });

  // Fetch cost breakdown
  const { data: breakdownData, isLoading } = useQuery({
    queryKey: ["cost-breakdown", clientId, selectedMonth],
    queryFn: () =>
      api.get<{ data: CostBreakdown }>(
        `/financial/cost-breakdown/${clientId}?month=${selectedMonth}`,
      ),
    enabled: !!clientId,
  });

  const breakdown = breakdownData?.data;

  // Prepare chart data
  const chartData = breakdown
    ? [
        {
          name: "Purchase",
          value: breakdown.purchaseCost,
          color: COLORS.purchase,
        },
        {
          name: "Holding",
          value: breakdown.holdingCost,
          color: COLORS.holding,
        },
        {
          name: "Ordering",
          value: breakdown.orderingCost,
          color: COLORS.ordering,
        },
        {
          name: "Shortage",
          value: breakdown.shortageCost,
          color: COLORS.shortage,
        },
      ].filter((item) => item.value > 0)
    : [];

  // Generate month options (last 12 months)
  const getMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      options.push({ value, label });
    }
    return options;
  };

  // Custom label with percentages
  const renderLabel = (entry: any) => {
    if (!breakdown) return "";
    const percent = ((entry.value / breakdown.total) * 100).toFixed(1);
    return `${percent}%`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0];

    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-semibold text-gray-900 mb-1">{data.name}</p>
        <p className="text-lg font-bold" style={{ color: data.payload.color }}>
          ${data.value.toLocaleString()}
        </p>
        {breakdown && (
          <p className="text-sm text-gray-500">
            {((data.value / breakdown.total) * 100).toFixed(1)}% of total
          </p>
        )}
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

  if (!breakdown || breakdown.total === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            Cost Breakdown
          </h3>
        </div>
        <div className="text-center py-12">
          <p className="text-gray-500">No cost data available</p>
          <p className="text-sm text-gray-400">for {selectedMonth}</p>
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
          <DollarSign className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            Cost Breakdown
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportToPNG}
            disabled={isExporting}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
            title="Export as PNG"
            aria-label="Export cost breakdown as PNG image"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
          </button>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {getMonthOptions().map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Total Cost */}
      <div className="text-center mb-6">
        <p className="text-sm text-gray-500 mb-1">Total Inventory Costs</p>
        <p className="text-4xl font-bold text-gray-900">
          ${breakdown.total.toLocaleString()}
        </p>
      </div>

      {/* Donut Chart */}
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            label={renderLabel}
            labelLine={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend with Details */}
      <div className="grid grid-cols-2 gap-3 mt-6">
        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: COLORS.purchase }}
            />
            <p className="text-xs font-medium text-blue-900">Purchase</p>
          </div>
          <p className="text-lg font-bold text-blue-900">
            ${breakdown.purchaseCost.toLocaleString()}
          </p>
          <p className="text-xs text-blue-600">
            {((breakdown.purchaseCost / breakdown.total) * 100).toFixed(1)}%
          </p>
        </div>

        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: COLORS.holding }}
            />
            <p className="text-xs font-medium text-amber-900">Holding</p>
          </div>
          <p className="text-lg font-bold text-amber-900">
            ${breakdown.holdingCost.toLocaleString()}
          </p>
          <p className="text-xs text-amber-600">
            {((breakdown.holdingCost / breakdown.total) * 100).toFixed(1)}%
          </p>
        </div>

        <div className="p-3 rounded-lg border border-green-200 bg-green-50">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: COLORS.ordering }}
            />
            <p className="text-xs font-medium text-green-900">Ordering</p>
          </div>
          <p className="text-lg font-bold text-green-900">
            ${breakdown.orderingCost.toLocaleString()}
          </p>
          <p className="text-xs text-green-600">
            {((breakdown.orderingCost / breakdown.total) * 100).toFixed(1)}%
          </p>
        </div>

        <div className="p-3 rounded-lg border border-red-200 bg-red-50">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: COLORS.shortage }}
            />
            <p className="text-xs font-medium text-red-900">Shortage</p>
          </div>
          <p className="text-lg font-bold text-red-900">
            ${breakdown.shortageCost.toLocaleString()}
          </p>
          <p className="text-xs text-red-600">
            {((breakdown.shortageCost / breakdown.total) * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-600">
          <strong>Purchase:</strong> Direct product costs |{" "}
          <strong>Holding:</strong> Storage & carrying costs |{" "}
          <strong>Ordering:</strong> Processing & admin costs |{" "}
          <strong>Shortage:</strong> Stockout penalties
        </p>
      </div>
    </div>
  );
}

export default CostBreakdownWidget;
