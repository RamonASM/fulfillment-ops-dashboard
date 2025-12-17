// =============================================================================
// BUDGET SUMMARY WIDGET
// Shows budget allocation, spending, and forecast with health indicators
// =============================================================================

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
} from "lucide-react";
import { api } from "@/api/client";

interface BudgetSummary {
  allocated: number;
  spent: number;
  forecast: number;
  remaining: number;
  percentUsed: number;
  status: "under" | "on_track" | "over" | "critical";
  productsOverBudget: number;
  productsUnderBudget: number;
  periodStart: string;
  periodEnd: string;
}

interface BudgetSummaryWidgetProps {
  clientId: string;
}

type Period = "month" | "quarter" | "year";

export function BudgetSummaryWidget({ clientId }: BudgetSummaryWidgetProps) {
  const [period, setPeriod] = useState<Period>("month");

  // Calculate period dates
  const getPeriodDates = (period: Period) => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    switch (period) {
      case "month":
        start.setDate(1);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        break;
      case "quarter":
        const quarter = Math.floor(now.getMonth() / 3);
        start.setMonth(quarter * 3);
        start.setDate(1);
        end.setMonth((quarter + 1) * 3);
        end.setDate(0);
        break;
      case "year":
        start.setMonth(0);
        start.setDate(1);
        end.setMonth(11);
        end.setDate(31);
        break;
    }

    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  };

  const { start, end } = getPeriodDates(period);

  // Fetch budget summary
  const { data: summaryData, isLoading } = useQuery({
    queryKey: ["budget-summary", clientId, period, start, end],
    queryFn: () =>
      api.get<{ data: BudgetSummary }>(
        `/financial/budgets/summary/${clientId}?periodStart=${start}&periodEnd=${end}`,
      ),
    enabled: !!clientId,
  });

  const summary = summaryData?.data;

  // Get status styling
  const getStatusConfig = (status: string) => {
    switch (status) {
      case "under":
        return {
          color: "text-green-700",
          bgColor: "bg-green-100",
          borderColor: "border-green-200",
          icon: CheckCircle,
          label: "Under Budget",
        };
      case "on_track":
        return {
          color: "text-blue-700",
          bgColor: "bg-blue-100",
          borderColor: "border-blue-200",
          icon: CheckCircle,
          label: "On Track",
        };
      case "over":
        return {
          color: "text-yellow-700",
          bgColor: "bg-yellow-100",
          borderColor: "border-yellow-200",
          icon: AlertCircle,
          label: "Over Budget",
        };
      case "critical":
        return {
          color: "text-red-700",
          bgColor: "bg-red-100",
          borderColor: "border-red-200",
          icon: AlertCircle,
          label: "Critical",
        };
      default:
        return {
          color: "text-gray-700",
          bgColor: "bg-gray-100",
          borderColor: "border-gray-200",
          icon: AlertCircle,
          label: "Unknown",
        };
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!summary) return;

    const csvContent = [
      "Metric,Amount",
      `Allocated,${summary.allocated}`,
      `Spent,${summary.spent}`,
      `Forecast,${summary.forecast}`,
      `Remaining,${summary.remaining}`,
      `Percent Used,${summary.percentUsed}%`,
      `Status,${getStatusConfig(summary.status).label}`,
      `Products Over Budget,${summary.productsOverBudget}`,
      `Products Under Budget,${summary.productsUnderBudget}`,
      `Period,${summary.periodStart} to ${summary.periodEnd}`,
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `budget_summary_${period}_${new Date().toISOString().split("T")[0]}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-green-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            Budget Summary
          </h3>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-500">No budget data available</p>
          <p className="text-sm text-gray-400">
            Set up budgets to track spending
          </p>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(summary.status);
  const StatusIcon = statusConfig.icon;

  // Progress bar color
  const getProgressColor = () => {
    if (summary.percentUsed <= 75) return "bg-green-500";
    if (summary.percentUsed <= 90) return "bg-yellow-500";
    if (summary.percentUsed <= 100) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            Budget Summary
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportToCSV}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Export as CSV"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </div>

      {/* Status Badge */}
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${statusConfig.bgColor} ${statusConfig.borderColor} border mb-4`}
      >
        <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
        <span className={`text-sm font-medium ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>

      {/* Main Numbers */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-1">Allocated</p>
          <p className="text-2xl font-bold text-gray-900">
            ${summary.allocated.toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-1">Spent</p>
          <p className="text-2xl font-bold text-gray-900">
            ${summary.spent.toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-1">Forecast</p>
          <p
            className={`text-2xl font-bold ${
              summary.forecast > summary.allocated
                ? "text-red-600"
                : "text-blue-600"
            }`}
          >
            ${summary.forecast.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Budget Usage
          </span>
          <span className="text-sm font-bold text-gray-900">
            {summary.percentUsed.toFixed(1)}%
          </span>
        </div>
        <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor()} transition-all duration-500 rounded-full`}
            style={{ width: `${Math.min(summary.percentUsed, 100)}%` }}
          />
        </div>
        {summary.percentUsed > 100 && (
          <p className="text-xs text-red-600 mt-1">
            Overspend: ${(summary.spent - summary.allocated).toLocaleString()}
          </p>
        )}
      </div>

      {/* Remaining */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-4">
        <span className="text-sm font-medium text-gray-700">
          Remaining Budget
        </span>
        <div className="flex items-center gap-2">
          {summary.remaining >= 0 ? (
            <TrendingUp className="w-4 h-4 text-green-600" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-600" />
          )}
          <span
            className={`text-lg font-bold ${
              summary.remaining >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            ${Math.abs(summary.remaining).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Product Breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600 mb-1">Over Budget</p>
          <p className="text-2xl font-bold text-red-700">
            {summary.productsOverBudget}
          </p>
          <p className="text-xs text-red-600">products</p>
        </div>
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-xs text-green-600 mb-1">Under Budget</p>
          <p className="text-2xl font-bold text-green-700">
            {summary.productsUnderBudget}
          </p>
          <p className="text-xs text-green-600">products</p>
        </div>
      </div>
    </div>
  );
}

export default BudgetSummaryWidget;
