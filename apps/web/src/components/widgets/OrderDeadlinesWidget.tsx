// =============================================================================
// ORDER DEADLINES WIDGET
// Shows upcoming order-by dates with urgency levels
// =============================================================================

import { useRef } from "react";
import {
  Clock,
  Package,
  TrendingDown,
  ArrowRight,
  Camera,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { useWidgetExport } from "@/hooks/useWidgetExport";

export type UrgencyLevel =
  | "safe"
  | "upcoming"
  | "soon"
  | "critical"
  | "overdue";

export interface OrderTimingResult {
  productId: string;
  productName: string;
  productCode: string;
  currentStockUnits: number;
  avgDailyUsage: number;
  daysOfStockRemaining: number | null;
  projectedStockoutDate: string | null;
  totalLeadTimeDays: number;
  lastOrderByDate: string | null;
  daysUntilOrderDeadline: number | null;
  urgencyLevel: UrgencyLevel;
  urgencyMessage: string;
  leadTimeBreakdown: {
    supplierDays: number;
    shippingDays: number;
    processingDays: number;
    safetyBufferDays: number;
  };
}

interface OrderDeadlinesWidgetProps {
  deadlines: OrderTimingResult[];
  title?: string;
  limit?: number;
  clientId?: string;
  onViewAll?: () => void;
  showExport?: boolean;
}

const urgencyConfig = {
  overdue: {
    bg: "bg-red-100",
    border: "border-red-300",
    text: "text-red-700",
    badge: "bg-red-500 text-white",
    label: "Overdue",
  },
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-600",
    badge: "bg-red-100 text-red-700",
    label: "Critical",
  },
  soon: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-600",
    badge: "bg-amber-100 text-amber-700",
    label: "Order Soon",
  },
  upcoming: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-600",
    badge: "bg-blue-100 text-blue-700",
    label: "Upcoming",
  },
  safe: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700",
    label: "Safe",
  },
};

export function OrderDeadlinesWidget({
  deadlines,
  title = "Order Deadlines",
  limit = 5,
  clientId,
  onViewAll,
  showExport = true,
}: OrderDeadlinesWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);

  // Use shared export hook with lazy-loaded html2canvas
  const { exportToPNG, isExporting } = useWidgetExport({
    widgetRef,
    title,
  });

  const displayDeadlines = deadlines.slice(0, limit);

  // Summary counts by urgency
  const overdueCount = deadlines.filter(
    (d) => d.urgencyLevel === "overdue",
  ).length;
  const criticalCount = deadlines.filter(
    (d) => d.urgencyLevel === "critical",
  ).length;
  const soonCount = deadlines.filter((d) => d.urgencyLevel === "soon").length;

  // Export as CSV
  const exportToCSV = () => {
    const csvContent = [
      "Product,Code,Order By Date,Days Until Deadline,Urgency,Current Stock,Daily Usage,Stockout Date,Lead Time",
      ...deadlines.map(
        (d) =>
          `"${d.productName}","${d.productCode}","${d.lastOrderByDate ? format(new Date(d.lastOrderByDate), "yyyy-MM-dd") : "N/A"}",${d.daysUntilOrderDeadline ?? "N/A"},"${d.urgencyLevel}",${d.currentStockUnits},${d.avgDailyUsage.toFixed(1)},"${d.projectedStockoutDate ? format(new Date(d.projectedStockoutDate), "yyyy-MM-dd") : "N/A"}",${d.totalLeadTimeDays}`,
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (displayDeadlines.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <Package className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-gray-500">No upcoming order deadlines</p>
          <p className="text-sm text-gray-400">
            All products have healthy stock levels
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={widgetRef}
      className="bg-white rounded-lg border border-gray-200 p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {showExport && (
            <div className="flex gap-1 mr-2">
              <button
                onClick={exportToPNG}
                disabled={isExporting}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                title="Export as PNG"
                aria-label="Export order deadlines as PNG image"
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
                aria-label="Export order deadlines as CSV file"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>
            </div>
          )}
          {overdueCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white">
              {overdueCount} overdue
            </span>
          )}
          {criticalCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {criticalCount} critical
            </span>
          )}
          {soonCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              {soonCount} soon
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {displayDeadlines.map((deadline) => {
          const config = urgencyConfig[deadline.urgencyLevel];
          const orderByDate = deadline.lastOrderByDate
            ? new Date(deadline.lastOrderByDate)
            : null;
          const stockoutDate = deadline.projectedStockoutDate
            ? new Date(deadline.projectedStockoutDate)
            : null;

          return (
            <div
              key={deadline.productId}
              className={`p-4 rounded-lg border ${config.bg} ${config.border}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {clientId ? (
                      <Link
                        to={`/clients/${clientId}/products/${deadline.productId}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate"
                      >
                        {deadline.productName}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {deadline.productName}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.badge}`}
                    >
                      {config.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    {deadline.productCode}
                  </p>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Clock className="w-3 h-3" />
                      <span>
                        Order by:{" "}
                        <span className={`font-medium ${config.text}`}>
                          {orderByDate ? format(orderByDate, "MMM d") : "N/A"}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <TrendingDown className="w-3 h-3" />
                      <span>
                        Stockout:{" "}
                        {stockoutDate
                          ? formatDistanceToNow(stockoutDate, {
                              addSuffix: true,
                            })
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <Package className="w-3 h-3" />
                      <span>
                        Stock: {deadline.currentStockUnits.toLocaleString()}{" "}
                        units
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <span>
                        Usage: {deadline.avgDailyUsage.toFixed(1)}/day
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  {deadline.daysUntilOrderDeadline !== null && (
                    <div className={`text-2xl font-bold ${config.text}`}>
                      {deadline.daysUntilOrderDeadline < 0
                        ? `${Math.abs(deadline.daysUntilOrderDeadline)}d`
                        : `${deadline.daysUntilOrderDeadline}d`}
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    {deadline.daysUntilOrderDeadline !== null &&
                    deadline.daysUntilOrderDeadline < 0
                      ? "overdue"
                      : "remaining"}
                  </div>
                </div>
              </div>

              {/* Lead time breakdown tooltip-like display */}
              <div className="mt-3 pt-3 border-t border-gray-200/50 flex items-center gap-4 text-xs text-gray-500">
                <span>Lead time: {deadline.totalLeadTimeDays} days</span>
                <span className="text-gray-300">|</span>
                <span>
                  S:{deadline.leadTimeBreakdown.supplierDays} + T:
                  {deadline.leadTimeBreakdown.shippingDays} + P:
                  {deadline.leadTimeBreakdown.processingDays} + B:
                  {deadline.leadTimeBreakdown.safetyBufferDays}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {deadlines.length > limit && (
        <button
          onClick={onViewAll}
          className="flex items-center justify-center gap-1 w-full mt-4 pt-4 border-t border-gray-100 text-sm text-blue-600 hover:text-blue-700"
        >
          View all {deadlines.length} deadlines
          <ArrowRight className="w-4 h-4" />
        </button>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-100">
        {Object.entries(urgencyConfig).map(([key, config]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${config.badge.split(" ")[0]}`} />
            <span className="text-xs text-gray-500">{config.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default OrderDeadlinesWidget;
