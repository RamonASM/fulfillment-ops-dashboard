// =============================================================================
// SMART REORDER WIDGET
// AI-powered reorder recommendations with confidence scoring
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  Calendar,
  ShoppingCart,
  Camera,
  FileSpreadsheet,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import html2canvas from "html2canvas";
import { api } from "@/api/client";
import { format } from "date-fns";
import { ConfidenceBadge } from "../shared/ConfidenceBadge";

interface ReorderRecommendation {
  productId: string;
  productName: string;
  currentStock: number;
  currentStockPacks: number;
  monthlyUsage: number;
  monthlyUsagePacks: number;
  weeksRemaining: number;
  stockStatus: string;
  suggestedQty: number;
  suggestedQtyPacks: number;
  urgency: "critical" | "high" | "medium" | "low";
  reason: string;
  stockoutDate: string | null;
  confidence: string;
  confidenceScore: number;
  trend: string;
  calculationMethod: string;
  seasonalityDetected: boolean;
}

interface SmartReorderWidgetProps {
  clientId: string;
  limit?: number;
  showExport?: boolean;
}

interface ReorderRecommendationsResponse {
  data: ReorderRecommendation[];
}

const urgencyConfig = {
  critical: {
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-800",
    label: "Critical",
  },
  high: {
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    badge: "bg-orange-100 text-orange-800",
    label: "High",
  },
  medium: {
    color: "text-yellow-700",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    badge: "bg-yellow-100 text-yellow-800",
    label: "Medium",
  },
  low: {
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-800",
    label: "Low",
  },
};

const trendIcons = {
  increasing: TrendingUp,
  stable: Minus,
  decreasing: TrendingDown,
};

export function SmartReorderWidget({
  clientId,
  limit = 10,
  showExport = true,
}: SmartReorderWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["reorder-recommendations", clientId],
    queryFn: () =>
      api.get<ReorderRecommendationsResponse>(
        `/analytics/reorder-recommendations/${clientId}`,
      ),
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  const exportToPNG = async () => {
    if (!widgetRef.current) return;
    try {
      const canvas = await html2canvas(widgetRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `Smart_Reorder_Recommendations_${new Date().toISOString().split("T")[0]}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Error exporting widget:", error);
    }
  };

  const exportToCSV = () => {
    if (!data?.data) return;
    const headers = [
      "Product Name",
      "Current Stock (Packs)",
      "Weeks Remaining",
      "Suggested Qty (Packs)",
      "Urgency",
      "Confidence",
      "Trend",
      "Stockout Date",
    ];
    const rows = data.data
      .slice(0, limit)
      .map((rec) => [
        rec.productName,
        rec.currentStockPacks,
        rec.weeksRemaining.toFixed(1),
        rec.suggestedQtyPacks,
        rec.urgency,
        rec.confidence,
        rec.trend,
        rec.stockoutDate
          ? format(new Date(rec.stockoutDate), "yyyy-MM-dd")
          : "N/A",
      ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `Smart_Reorder_Recommendations_${new Date().toISOString().split("T")[0]}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 text-red-600 mb-2">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="text-lg font-semibold">
            Error Loading Recommendations
          </h3>
        </div>
        <p className="text-sm text-gray-600">
          Failed to load reorder recommendations. Please try again later.
        </p>
      </div>
    );
  }

  const recommendations = data?.data?.slice(0, limit) || [];

  if (recommendations.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-emerald-600" />
          Smart Reorder Recommendations
        </h3>
        <div className="text-center py-8">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            No reorder recommendations at this time
          </p>
          <p className="text-sm text-gray-400 mt-1">
            All products have sufficient stock levels
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={widgetRef}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Smart Reorder Recommendations
          </h3>
          <span className="text-sm text-gray-500">
            ({recommendations.length} item
            {recommendations.length !== 1 ? "s" : ""})
          </span>
        </div>

        {showExport && (
          <div className="flex gap-2">
            <button
              onClick={exportToPNG}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Export as PNG"
              aria-label="Export reorder recommendations as PNG image"
            >
              <Camera className="h-4 w-4" />
            </button>
            <button
              onClick={exportToCSV}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Export as CSV"
              aria-label="Export reorder recommendations as CSV file"
            >
              <FileSpreadsheet className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Recommendations List */}
      <div className="space-y-3">
        {recommendations.map((rec) => {
          const urgency = urgencyConfig[rec.urgency];
          const TrendIcon =
            trendIcons[rec.trend as keyof typeof trendIcons] || Minus;

          return (
            <div
              key={rec.productId}
              className={`${urgency.bg} ${urgency.border} border rounded-lg p-4 transition-all hover:shadow-md`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-900">
                      {rec.productName}
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${urgency.badge}`}
                    >
                      {urgency.label}
                    </span>
                  </div>

                  <p className={`text-sm ${urgency.color} mb-2`}>
                    {rec.reason}
                  </p>

                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Package className="h-4 w-4" />
                      <span>
                        {rec.currentStockPacks} packs (
                        {rec.weeksRemaining.toFixed(1)}w runway)
                      </span>
                    </div>

                    {rec.stockoutDate && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          Stockout:{" "}
                          {format(new Date(rec.stockoutDate), "MMM d, yyyy")}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <TrendIcon className="h-4 w-4" />
                      <span className="capitalize">{rec.trend}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right ml-4">
                  <div className="text-2xl font-bold text-gray-900">
                    {rec.suggestedQtyPacks}
                  </div>
                  <div className="text-xs text-gray-500 mb-2">packs</div>
                  <ConfidenceBadge
                    score={rec.confidenceScore}
                    level={rec.confidence as "high" | "medium" | "low"}
                    method={rec.calculationMethod}
                    showBreakdown={true}
                  />
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                <div className="flex gap-3 text-xs text-gray-500">
                  <span>Method: {rec.calculationMethod}</span>
                  {rec.seasonalityDetected && (
                    <span className="text-purple-600 font-medium">
                      📊 Seasonal pattern detected
                    </span>
                  )}
                </div>

                <Link
                  to={`/clients/${clientId}/products`}
                  state={{ productId: rec.productId }}
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  View Details
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with View All Link */}
      {data?.data && data.data.length > limit && (
        <div className="mt-4 pt-4 border-t border-gray-200 text-center">
          <Link
            to={`/clients/${clientId}/products?filter=needsReorder`}
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View all {data.data.length} recommendations
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
