// =============================================================================
// SMART REORDER WIDGET - PORTAL
// Intelligent reorder suggestions with urgency indicators and quick actions
// =============================================================================

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock,
  Calendar,
  Package,
  ShoppingCart,
  Filter,
} from "lucide-react";
import { portalApi } from "@/api/client";

interface ReorderSuggestion {
  productId: string;
  productName: string;
  currentStock: number;
  monthlyUsage: number;
  weeksOfSupply: number;
  suggestedOrderQty: number;
  urgency: "critical" | "soon" | "planned";
  reason: string;
  estimatedStockoutDate: string | null;
}

interface SmartReorderWidgetProps {
  limit?: number;
  showExport?: boolean;
}

export function SmartReorderWidget({
  limit = 10,
  showExport = false,
}: SmartReorderWidgetProps) {
  const [urgencyFilter, setUrgencyFilter] = useState<
    "all" | "critical" | "soon" | "planned"
  >("all");

  // Fetch reorder suggestions
  const { data: suggestionsData, isLoading } = useQuery({
    queryKey: ["portal-reorder-suggestions"],
    queryFn: () =>
      portalApi.get<{ data: ReorderSuggestion[] }>(
        "/analytics/reorder-suggestions",
      ),
    staleTime: 60000, // 1 minute
  });

  const allSuggestions = suggestionsData?.data || [];

  // Filter by urgency
  const filteredSuggestions =
    urgencyFilter === "all"
      ? allSuggestions
      : allSuggestions.filter((s) => s.urgency === urgencyFilter);

  const displaySuggestions = filteredSuggestions.slice(0, limit);

  // Get urgency config
  const getUrgencyConfig = (urgency: string) => {
    switch (urgency) {
      case "critical":
        return {
          color: "text-red-700",
          bgColor: "bg-red-100",
          borderColor: "border-red-200",
          icon: AlertTriangle,
          label: "Critical",
        };
      case "soon":
        return {
          color: "text-yellow-700",
          bgColor: "bg-yellow-100",
          borderColor: "border-yellow-200",
          icon: Clock,
          label: "Soon",
        };
      case "planned":
        return {
          color: "text-blue-700",
          bgColor: "bg-blue-100",
          borderColor: "border-blue-200",
          icon: Calendar,
          label: "Planned",
        };
      default:
        return {
          color: "text-gray-700",
          bgColor: "bg-gray-100",
          borderColor: "border-gray-200",
          icon: Package,
          label: "Unknown",
        };
    }
  };

  // Placeholder for add to cart action
  const handleAddToCart = (suggestion: ReorderSuggestion) => {
    // TODO: Implement cart functionality
    console.log("Add to cart:", suggestion);
    alert(
      `Add ${suggestion.suggestedOrderQty} units of ${suggestion.productName} to cart`,
    );
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

  if (allSuggestions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            Smart Reorder Suggestions
          </h3>
        </div>
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No reorder suggestions at this time</p>
          <p className="text-sm text-gray-400">
            All inventory levels are optimal
          </p>
        </div>
      </div>
    );
  }

  const criticalCount = allSuggestions.filter(
    (s) => s.urgency === "critical",
  ).length;
  const soonCount = allSuggestions.filter((s) => s.urgency === "soon").length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            Smart Reorder Suggestions
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={urgencyFilter}
            onChange={(e) =>
              setUrgencyFilter(
                e.target.value as "all" | "critical" | "soon" | "planned",
              )
            }
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All ({allSuggestions.length})</option>
            <option value="critical">Critical ({criticalCount})</option>
            <option value="soon">Soon ({soonCount})</option>
            <option value="planned">
              Planned ({allSuggestions.length - criticalCount - soonCount})
            </option>
          </select>
        </div>
      </div>

      {/* Alert Summary */}
      {(criticalCount > 0 || soonCount > 0) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 font-medium">
            {criticalCount > 0 && (
              <>
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                {criticalCount} critical item{criticalCount !== 1 ? "s" : ""}{" "}
                need immediate attention
              </>
            )}
            {criticalCount > 0 && soonCount > 0 && " • "}
            {soonCount > 0 && (
              <>
                {soonCount} item{soonCount !== 1 ? "s" : ""} need ordering soon
              </>
            )}
          </p>
        </div>
      )}

      {/* Suggestions List */}
      <div className="space-y-3">
        {displaySuggestions.map((suggestion) => {
          const config = getUrgencyConfig(suggestion.urgency);
          const Icon = config.icon;

          return (
            <div
              key={suggestion.productId}
              className={`p-4 rounded-lg border ${config.borderColor} ${config.bgColor}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.bgColor} ${config.color}`}
                    >
                      {config.label}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900">
                    {suggestion.productName}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {suggestion.reason}
                  </p>
                </div>
                <button
                  onClick={() => handleAddToCart(suggestion)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Add
                </button>
              </div>

              <div className="grid grid-cols-4 gap-3 mt-3 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Current Stock</p>
                  <p className="font-medium text-gray-900">
                    {suggestion.currentStock}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Suggested Order</p>
                  <p className="font-bold text-blue-600">
                    {suggestion.suggestedOrderQty} units
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Monthly Usage</p>
                  <p className="font-medium text-gray-900">
                    {suggestion.monthlyUsage}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Weeks Supply</p>
                  <p
                    className={`font-medium ${
                      suggestion.weeksOfSupply < 2
                        ? "text-red-600"
                        : suggestion.weeksOfSupply < 4
                          ? "text-yellow-600"
                          : "text-green-600"
                    }`}
                  >
                    {suggestion.weeksOfSupply.toFixed(1)}
                  </p>
                </div>
              </div>

              {suggestion.estimatedStockoutDate && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-600">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Estimated stockout:{" "}
                    <span className="font-medium">
                      {new Date(
                        suggestion.estimatedStockoutDate,
                      ).toLocaleDateString()}
                    </span>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredSuggestions.length > limit && (
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            Showing {limit} of {filteredSuggestions.length} suggestions
          </p>
        </div>
      )}
    </div>
  );
}

export default SmartReorderWidget;
