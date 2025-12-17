// =============================================================================
// ORDER BY DATE WIDGET
// Shows clients when they need to order to avoid stockouts
// =============================================================================

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Clock,
  AlertTriangle,
  Package,
  TrendingDown,
  ChevronRight,
  Info,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { api } from "../lib/api";

// =============================================================================
// TYPES
// =============================================================================

type UrgencyLevel = "safe" | "upcoming" | "soon" | "critical" | "overdue";

interface OrderTimingResult {
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

interface TimingSummary {
  totalProducts: number;
  withUsageData: number;
  overdue: number;
  critical: number;
  soon: number;
  upcoming: number;
  safe: number;
  deadlineAlerts: OrderTimingResult[];
}

interface OrderByDateWidgetProps {
  limit?: number;
  showSummary?: boolean;
}

// =============================================================================
// URGENCY CONFIG
// =============================================================================

const urgencyConfig: Record<
  UrgencyLevel,
  {
    label: string;
    color: string;
    bg: string;
    badge: string;
    border: string;
  }
> = {
  overdue: {
    label: "Overdue",
    color: "text-red-700",
    bg: "bg-red-50",
    badge: "bg-red-500 text-white",
    border: "border-red-200",
  },
  critical: {
    label: "Order Now",
    color: "text-red-600",
    bg: "bg-red-50",
    badge: "bg-red-100 text-red-700",
    border: "border-red-200",
  },
  soon: {
    label: "Order Soon",
    color: "text-amber-600",
    bg: "bg-amber-50",
    badge: "bg-amber-100 text-amber-700",
    border: "border-amber-200",
  },
  upcoming: {
    label: "Upcoming",
    color: "text-blue-600",
    bg: "bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
    border: "border-blue-200",
  },
  safe: {
    label: "Safe",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-700",
    border: "border-emerald-200",
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

export function OrderByDateWidget({
  limit = 5,
  showSummary = true,
}: OrderByDateWidgetProps) {
  const [selectedUrgency, setSelectedUrgency] = useState<UrgencyLevel | "all">(
    "all",
  );

  // Fetch timing summary
  const { data: summary, isLoading } = useQuery({
    queryKey: ["portal", "timing", "summary"],
    queryFn: async () => {
      const response = await api.get<{ data: TimingSummary }>(
        "/portal/shipments/timing/summary",
      );
      return response.data;
    },
  });

  // Filter deadlines by urgency
  const filteredDeadlines =
    summary?.deadlineAlerts.filter((d) =>
      selectedUrgency === "all" ? true : d.urgencyLevel === selectedUrgency,
    ) || [];

  const displayDeadlines = filteredDeadlines.slice(0, limit);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="h-16 bg-gray-200 rounded" />
            <div className="h-16 bg-gray-200 rounded" />
            <div className="h-16 bg-gray-200 rounded" />
            <div className="h-16 bg-gray-200 rounded" />
          </div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded" />
            <div className="h-20 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">Order Timing</h3>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Order by these dates to avoid running out of stock
        </p>
      </div>

      {/* Summary Cards */}
      {showSummary && summary && (
        <div className="p-4 border-b border-gray-200">
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={() =>
                setSelectedUrgency(
                  selectedUrgency === "overdue" ? "all" : "overdue",
                )
              }
              className={`p-3 rounded-lg text-center transition-colors ${
                selectedUrgency === "overdue"
                  ? "bg-red-100 border-2 border-red-500"
                  : "bg-red-50 hover:bg-red-100 border border-red-200"
              }`}
            >
              <div className="text-2xl font-bold text-red-700">
                {summary.overdue}
              </div>
              <div className="text-xs text-red-600">Overdue</div>
            </button>
            <button
              onClick={() =>
                setSelectedUrgency(
                  selectedUrgency === "critical" ? "all" : "critical",
                )
              }
              className={`p-3 rounded-lg text-center transition-colors ${
                selectedUrgency === "critical"
                  ? "bg-red-50 border-2 border-red-400"
                  : "bg-gray-50 hover:bg-red-50 border border-gray-200"
              }`}
            >
              <div className="text-2xl font-bold text-red-600">
                {summary.critical}
              </div>
              <div className="text-xs text-gray-600">Critical</div>
            </button>
            <button
              onClick={() =>
                setSelectedUrgency(selectedUrgency === "soon" ? "all" : "soon")
              }
              className={`p-3 rounded-lg text-center transition-colors ${
                selectedUrgency === "soon"
                  ? "bg-amber-50 border-2 border-amber-400"
                  : "bg-gray-50 hover:bg-amber-50 border border-gray-200"
              }`}
            >
              <div className="text-2xl font-bold text-amber-600">
                {summary.soon}
              </div>
              <div className="text-xs text-gray-600">Soon</div>
            </button>
            <button
              onClick={() =>
                setSelectedUrgency(
                  selectedUrgency === "upcoming" ? "all" : "upcoming",
                )
              }
              className={`p-3 rounded-lg text-center transition-colors ${
                selectedUrgency === "upcoming"
                  ? "bg-blue-50 border-2 border-blue-400"
                  : "bg-gray-50 hover:bg-blue-50 border border-gray-200"
              }`}
            >
              <div className="text-2xl font-bold text-blue-600">
                {summary.upcoming}
              </div>
              <div className="text-xs text-gray-600">Upcoming</div>
            </button>
          </div>
          {selectedUrgency !== "all" && (
            <button
              onClick={() => setSelectedUrgency("all")}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700"
            >
              Show all deadlines
            </button>
          )}
        </div>
      )}

      {/* Deadline List */}
      <div className="divide-y divide-gray-200">
        {displayDeadlines.length > 0 ? (
          displayDeadlines.map((deadline) => {
            const config = urgencyConfig[deadline.urgencyLevel];
            const orderByDate = deadline.lastOrderByDate
              ? new Date(deadline.lastOrderByDate)
              : null;
            const stockoutDate = deadline.projectedStockoutDate
              ? new Date(deadline.projectedStockoutDate)
              : null;

            return (
              <div key={deadline.productId} className={`p-4 ${config.bg}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to={`/products/${deadline.productId}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate"
                      >
                        {deadline.productName}
                      </Link>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.badge}`}
                      >
                        {config.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      {deadline.productCode}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div className="flex items-center gap-1 text-gray-600">
                        <Clock className="w-3 h-3" />
                        <span>
                          Order by:{" "}
                          <span className={`font-semibold ${config.color}`}>
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
                          {deadline.currentStockUnits.toLocaleString()} units
                          left
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {deadline.daysUntilOrderDeadline !== null && (
                      <div className={`text-2xl font-bold ${config.color}`}>
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
                    <Link
                      to={`/order?product=${deadline.productId}`}
                      className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-700"
                    >
                      Order now <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {selectedUrgency !== "all"
                ? `No ${selectedUrgency} deadlines`
                : "No upcoming order deadlines"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Your inventory levels are healthy
            </p>
          </div>
        )}
      </div>

      {/* Footer with Info */}
      {displayDeadlines.length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Order-by dates are calculated based on your average daily usage
              and lead times. Order before the deadline to receive products
              before you run out.
            </p>
          </div>
        </div>
      )}

      {/* View All Link */}
      {filteredDeadlines.length > limit && (
        <div className="p-4 border-t border-gray-200">
          <Link
            to="/products?filter=order-soon"
            className="flex items-center justify-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          >
            View all {filteredDeadlines.length} products
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

export default OrderByDateWidget;
