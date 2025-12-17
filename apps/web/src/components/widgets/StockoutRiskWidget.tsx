// =============================================================================
// STOCKOUT RISK WIDGET
// Shows products at high risk of stocking out based on ML predictions
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  Package,
  ExternalLink,
  TrendingDown,
} from "lucide-react";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";

interface StockoutRiskItem {
  productId: string;
  productName: string;
  productCode: string;
  clientId: string;
  clientName: string;
  currentStock: number;
  lastPrediction: {
    days_until_stockout: number | null;
    confidence: number;
    predicted_stockout_date: string | null;
    createdAt: string;
  };
}

interface StockoutRiskWidgetProps {
  clientId?: string;
  limit?: number;
  showClientName?: boolean;
}

export function StockoutRiskWidget({
  clientId,
  limit = 5,
  showClientName = true,
}: StockoutRiskWidgetProps) {
  const navigate = useNavigate();

  // TODO: Implement /ml/stockout-risks endpoint
  const { data, isLoading } = useQuery({
    queryKey: ["ml-stockout-risks", clientId, limit],
    queryFn: async () => {
      // Mock data for now
      return {
        data: [] as StockoutRiskItem[],
      };
    },
  });

  const risks = data?.data || [];

  const getUrgencyLevel = (daysUntil: number | null) => {
    if (!daysUntil) return "safe";
    if (daysUntil <= 7) return "critical";
    if (daysUntil <= 14) return "warning";
    if (daysUntil <= 30) return "watch";
    return "safe";
  };

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case "critical":
        return "red";
      case "warning":
        return "amber";
      case "watch":
        return "yellow";
      default:
        return "green";
    }
  };

  const getUrgencyLabel = (level: string) => {
    switch (level) {
      case "critical":
        return "URGENT";
      case "warning":
        return "WARNING";
      case "watch":
        return "WATCH";
      default:
        return "OK";
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Stockout Risk Predictions
          </h3>
        </div>
        <button
          onClick={() => navigate("/ml-analytics")}
          className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          View all
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(limit)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : risks.length === 0 ? (
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">No stockout predictions yet</p>
          <p className="text-xs text-gray-500 mt-1">
            System will automatically analyze products with low stock levels
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {risks.map((risk) => {
            const urgencyLevel = getUrgencyLevel(
              risk.lastPrediction.days_until_stockout,
            );
            const urgencyColor = getUrgencyColor(urgencyLevel);

            return (
              <div
                key={risk.productId}
                className={clsx(
                  "p-3 border rounded-lg hover:shadow-sm transition-shadow cursor-pointer",
                  urgencyColor === "red" && "border-red-200 bg-red-50",
                  urgencyColor === "amber" && "border-amber-200 bg-amber-50",
                  urgencyColor === "yellow" && "border-yellow-200 bg-yellow-50",
                  urgencyColor === "green" && "border-gray-200",
                )}
                onClick={() =>
                  navigate(
                    `/clients/${risk.clientId}?product=${risk.productId}`,
                  )
                }
              >
                <div className="flex items-start justify-between">
                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {risk.productName}
                      </p>
                      <span
                        className={clsx(
                          "px-2 py-0.5 text-xs font-bold rounded uppercase",
                          urgencyColor === "red" && "bg-red-600 text-white",
                          urgencyColor === "amber" && "bg-amber-600 text-white",
                          urgencyColor === "yellow" &&
                            "bg-yellow-600 text-white",
                          urgencyColor === "green" && "bg-green-600 text-white",
                        )}
                      >
                        {getUrgencyLabel(urgencyLevel)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      {showClientName && (
                        <>
                          <span>{risk.clientName}</span>
                          <span className="text-gray-400">"</span>
                        </>
                      )}
                      <span>{risk.productCode}</span>
                      <span className="text-gray-400">"</span>
                      <span>{risk.currentStock} units in stock</span>
                    </div>
                  </div>

                  {/* Days Until Stockout */}
                  {risk.lastPrediction.days_until_stockout && (
                    <div className="ml-3 flex-shrink-0 text-right">
                      <div
                        className={clsx(
                          "text-2xl font-bold",
                          urgencyColor === "red" && "text-red-700",
                          urgencyColor === "amber" && "text-amber-700",
                          urgencyColor === "yellow" && "text-yellow-700",
                          urgencyColor === "green" && "text-green-700",
                        )}
                      >
                        {risk.lastPrediction.days_until_stockout}
                      </div>
                      <p className="text-xs text-gray-600">days left</p>
                    </div>
                  )}
                </div>

                {/* Prediction Details */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>
                        Stockout:{" "}
                        {risk.lastPrediction.predicted_stockout_date
                          ? new Date(
                              risk.lastPrediction.predicted_stockout_date,
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" />
                      <span>
                        {risk.lastPrediction.confidence.toFixed(0)}% confidence
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Note */}
      {risks.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Showing {risks.length} products at highest risk of stocking out.
            Predictions based on ML analysis of usage patterns and current
            inventory levels.
          </p>
        </div>
      )}
    </div>
  );
}

export default StockoutRiskWidget;
