// =============================================================================
// BENCHMARK COMPARISON WIDGET
// Privacy-preserving cross-client performance comparison
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Users,
  Trophy,
  AlertCircle,
  Info,
  Eye,
  EyeOff,
} from "lucide-react";
import { api } from "@/api/client";
import { useState } from "react";

// =============================================================================
// TYPES
// =============================================================================

interface MetricComparison {
  value: number;
  percentile: number;
  cohortAvg: number;
  cohortP50: number;
  cohortP90: number;
  performance: "excellent" | "good" | "average" | "below_average" | "poor";
}

interface BenchmarkComparison {
  clientId: string;
  clientName: string;
  cohort: string;
  metrics: {
    productCount: MetricComparison;
    orderFrequency: MetricComparison;
    stockoutRate: MetricComparison;
    inventoryTurnover: MetricComparison;
  };
  rank: "top_10" | "top_25" | "above_avg" | "below_avg" | "bottom_25";
  participantCount: number;
  period: Date;
}

interface BenchmarkComparisonWidgetProps {
  clientId: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function BenchmarkComparisonWidget({
  clientId,
}: BenchmarkComparisonWidgetProps) {
  const [showDetails, setShowDetails] = useState(true);

  const {
    data: benchmark,
    isLoading,
    error,
  } = useQuery<BenchmarkComparison | null>({
    queryKey: ["benchmark", clientId],
    queryFn: async () => {
      const response = await api.get<{ data: BenchmarkComparison | null }>(
        `/benchmarking/client/${clientId}`,
      );
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 text-amber-600 mb-4">
          <AlertCircle className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Benchmark Comparison</h3>
        </div>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            Failed to load benchmark data. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  if (!benchmark) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold">Benchmark Comparison</h3>
        </div>
        <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium mb-2">
            Not Participating in Benchmarking
          </p>
          <p className="text-sm text-gray-500">
            Enable benchmarking to see how this client compares to peers in
            their industry.
          </p>
        </div>
      </div>
    );
  }

  const getRankColor = (rank: BenchmarkComparison["rank"]) => {
    switch (rank) {
      case "top_10":
        return "text-green-700 bg-green-50 border-green-200";
      case "top_25":
        return "text-blue-700 bg-blue-50 border-blue-200";
      case "above_avg":
        return "text-cyan-700 bg-cyan-50 border-cyan-200";
      case "below_avg":
        return "text-orange-700 bg-orange-50 border-orange-200";
      case "bottom_25":
        return "text-red-700 bg-red-50 border-red-200";
    }
  };

  const getRankLabel = (rank: BenchmarkComparison["rank"]) => {
    switch (rank) {
      case "top_10":
        return "Top 10%";
      case "top_25":
        return "Top 25%";
      case "above_avg":
        return "Above Average";
      case "below_avg":
        return "Below Average";
      case "bottom_25":
        return "Bottom 25%";
    }
  };

  const getPerformanceColor = (
    performance: MetricComparison["performance"],
  ) => {
    switch (performance) {
      case "excellent":
        return "#10B981";
      case "good":
        return "#3B82F6";
      case "average":
        return "#F59E0B";
      case "below_average":
        return "#F97316";
      case "poor":
        return "#EF4444";
    }
  };

  // Prepare chart data
  const chartData = [
    {
      metric: "Products",
      value: benchmark.metrics.productCount.percentile,
      cohortAvg: 50, // Median is always 50th percentile
      performance: benchmark.metrics.productCount.performance,
    },
    {
      metric: "Orders/Month",
      value: benchmark.metrics.orderFrequency.percentile,
      cohortAvg: 50,
      performance: benchmark.metrics.orderFrequency.performance,
    },
    {
      metric: "Stockout Rate",
      value: benchmark.metrics.stockoutRate.percentile,
      cohortAvg: 50,
      performance: benchmark.metrics.stockoutRate.performance,
    },
    {
      metric: "Inventory\nTurnover",
      value: benchmark.metrics.inventoryTurnover.percentile,
      cohortAvg: 50,
      performance: benchmark.metrics.inventoryTurnover.performance,
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-600" />
          <h3 className="text-lg font-semibold">Benchmark Comparison</h3>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
        >
          {showDetails ? (
            <>
              <EyeOff className="w-4 h-4" />
              Hide Details
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              Show Details
            </>
          )}
        </button>
      </div>

      {/* Overall Rank */}
      <div
        className={`p-4 rounded-lg border mb-6 ${getRankColor(benchmark.rank)}`}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-medium mb-1">Overall Performance</div>
            <div className="text-2xl font-bold">
              {getRankLabel(benchmark.rank)}
            </div>
            <div className="text-xs mt-1 opacity-75">
              Cohort: {benchmark.cohort} • {benchmark.participantCount}{" "}
              participants
            </div>
          </div>
          <Trophy className="w-8 h-8 opacity-50" />
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg mb-6">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-800">
          Privacy-preserving comparison across {benchmark.participantCount}{" "}
          anonymous participants. No individual client data is shared.
        </p>
      </div>

      {/* Percentile Chart */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">
          Performance by Metric
        </h4>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 70, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              label={{
                value: "Percentile",
                position: "insideBottom",
                offset: -5,
                style: { fontSize: 12, fill: "#6B7280" },
              }}
            />
            <YAxis
              type="category"
              dataKey="metric"
              width={80}
              style={{ fontSize: 12, fill: "#6B7280" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              }}
              formatter={(value: any) => [`${value}th percentile`, ""]}
            />
            <ReferenceLine
              x={50}
              stroke="#9CA3AF"
              strokeDasharray="3 3"
              label={{
                value: "Median",
                position: "top",
                fill: "#6B7280",
                fontSize: 10,
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getPerformanceColor(entry.performance)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed Metrics */}
      {showDetails && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">
            Detailed Comparison
          </h4>

          {/* Product Count */}
          <MetricDetail
            label="Product Count"
            value={benchmark.metrics.productCount.value}
            percentile={benchmark.metrics.productCount.percentile}
            cohortAvg={benchmark.metrics.productCount.cohortAvg}
            cohortP90={benchmark.metrics.productCount.cohortP90}
            performance={benchmark.metrics.productCount.performance}
            suffix="products"
          />

          {/* Order Frequency */}
          <MetricDetail
            label="Order Frequency"
            value={benchmark.metrics.orderFrequency.value}
            percentile={benchmark.metrics.orderFrequency.percentile}
            cohortAvg={benchmark.metrics.orderFrequency.cohortAvg}
            cohortP90={benchmark.metrics.orderFrequency.cohortP90}
            performance={benchmark.metrics.orderFrequency.performance}
            suffix="orders/mo"
          />

          {/* Stockout Rate */}
          <MetricDetail
            label="Stockout Rate"
            value={benchmark.metrics.stockoutRate.value * 100}
            percentile={benchmark.metrics.stockoutRate.percentile}
            cohortAvg={benchmark.metrics.stockoutRate.cohortAvg * 100}
            cohortP90={benchmark.metrics.stockoutRate.cohortP90 * 100}
            performance={benchmark.metrics.stockoutRate.performance}
            suffix="%"
          />

          {/* Inventory Turnover */}
          <MetricDetail
            label="Inventory Turnover"
            value={benchmark.metrics.inventoryTurnover.value}
            percentile={benchmark.metrics.inventoryTurnover.percentile}
            cohortAvg={benchmark.metrics.inventoryTurnover.cohortAvg}
            cohortP90={benchmark.metrics.inventoryTurnover.cohortP90}
            performance={benchmark.metrics.inventoryTurnover.performance}
            suffix="x/year"
          />
        </div>
      )}

      {/* Last Updated */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Last updated:{" "}
          {new Date(benchmark.period).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// METRIC DETAIL COMPONENT
// =============================================================================

interface MetricDetailProps {
  label: string;
  value: number;
  percentile: number;
  cohortAvg: number;
  cohortP90: number;
  performance: MetricComparison["performance"];
  suffix: string;
}

function MetricDetail({
  label,
  value,
  percentile,
  cohortAvg,
  cohortP90,
  performance,
  suffix,
}: MetricDetailProps) {
  const performanceColors = {
    excellent: "text-green-700 bg-green-50",
    good: "text-blue-700 bg-blue-50",
    average: "text-yellow-700 bg-yellow-50",
    below_average: "text-orange-700 bg-orange-50",
    poor: "text-red-700 bg-red-50",
  };

  const performanceLabels = {
    excellent: "Excellent",
    good: "Good",
    average: "Average",
    below_average: "Below Avg",
    poor: "Poor",
  };

  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span
          className={`text-xs px-2 py-1 rounded ${performanceColors[performance]}`}
        >
          {performanceLabels[performance]}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-gray-500">Your Value</div>
          <div className="font-semibold text-gray-900">
            {value.toFixed(value < 10 ? 1 : 0)} {suffix}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Cohort Avg</div>
          <div className="font-semibold text-gray-700">
            {cohortAvg.toFixed(cohortAvg < 10 ? 1 : 0)} {suffix}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Top 10%</div>
          <div className="font-semibold text-gray-700">
            {cohortP90.toFixed(cohortP90 < 10 ? 1 : 0)} {suffix}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <TrendingUp className="w-3 h-3 text-gray-400" />
        <span className="text-xs text-gray-600">{percentile}th percentile</span>
      </div>
    </div>
  );
}
