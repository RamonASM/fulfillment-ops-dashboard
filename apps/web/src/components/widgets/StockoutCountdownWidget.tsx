// =============================================================================
// STOCKOUT COUNTDOWN WIDGET
// Visual countdown showing products approaching stockout with urgency indicators
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock,
  Calendar,
  TrendingDown,
  Package,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { formatDistanceToNow, format } from "date-fns";
import clsx from "clsx";

interface StockoutPrediction {
  productId: string;
  productName: string;
  currentStock: number;
  currentStockPacks: number;
  dailyUsage: number;
  weeksRemaining: number;
  daysRemaining: number;
  predictedStockoutDate: string;
  urgency: "critical" | "high" | "medium" | "low";
  trend: "increasing" | "stable" | "decreasing";
  confidence: number;
}

interface StockoutCountdownWidgetProps {
  clientId: string;
  limit?: number;
}

interface StockoutPredictionsResponse {
  data: StockoutPrediction[];
}

const urgencyConfig = {
  critical: {
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-300",
    badge: "bg-red-100 text-red-800",
    progressBar: "bg-red-500",
    icon: AlertTriangle,
    label: "Critical",
    threshold: 7, // days
  },
  high: {
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-300",
    badge: "bg-orange-100 text-orange-800",
    progressBar: "bg-orange-500",
    icon: AlertTriangle,
    label: "High Priority",
    threshold: 14,
  },
  medium: {
    color: "text-yellow-700",
    bg: "bg-yellow-50",
    border: "border-yellow-300",
    badge: "bg-yellow-100 text-yellow-800",
    progressBar: "bg-yellow-500",
    icon: Clock,
    label: "Medium",
    threshold: 30,
  },
  low: {
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-300",
    badge: "bg-blue-100 text-blue-800",
    progressBar: "bg-blue-500",
    icon: Clock,
    label: "Low",
    threshold: 60,
  },
};

export function StockoutCountdownWidget({
  clientId,
  limit = 5,
}: StockoutCountdownWidgetProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stockout-countdown", clientId],
    queryFn: () =>
      api.get<StockoutPredictionsResponse>(
        `/analytics/stockout-predictions/${clientId}`,
      ),
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded"></div>
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
          <h3 className="text-lg font-semibold">Error Loading Predictions</h3>
        </div>
        <p className="text-sm text-gray-600">
          Failed to load stockout predictions. Please try again later.
        </p>
      </div>
    );
  }

  const predictions = data?.data.slice(0, limit) || [];

  if (predictions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Package className="h-5 w-5 text-emerald-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Stockout Countdown
          </h3>
        </div>
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-3">
            <Package className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="text-gray-700 font-medium">All Stock Levels Healthy</p>
          <p className="text-sm text-gray-500 mt-1">
            No products predicted to stock out in the next 60 days
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Stockout Countdown
          </h3>
          <span className="text-sm text-gray-500">
            ({predictions.length} product{predictions.length !== 1 ? "s" : ""})
          </span>
        </div>
      </div>

      {/* Countdown Items */}
      <div className="space-y-4">
        {predictions.map((prediction: StockoutPrediction) => {
          const urgency = urgencyConfig[prediction.urgency];
          const UrgencyIcon = urgency.icon;
          const daysLeft = prediction.daysRemaining;
          const maxDays = urgency.threshold;
          const progressPercentage = Math.min(
            ((maxDays - daysLeft) / maxDays) * 100,
            100,
          );

          return (
            <Link
              key={prediction.productId}
              to={`/clients/${clientId}/products`}
              state={{ productId: prediction.productId }}
              className={clsx(
                "block rounded-lg border-2 p-4 transition-all hover:shadow-md",
                urgency.border,
                urgency.bg,
              )}
            >
              {/* Header Row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <UrgencyIcon className={clsx("h-4 w-4", urgency.color)} />
                    <h4 className="font-semibold text-gray-900">
                      {prediction.productName}
                    </h4>
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        urgency.badge,
                      )}
                    >
                      {urgency.label}
                    </span>
                  </div>
                </div>

                {/* Countdown Display */}
                <div className="text-right ml-4">
                  <div className={clsx("text-3xl font-bold", urgency.color)}>
                    {daysLeft}
                  </div>
                  <div className="text-xs text-gray-600 uppercase tracking-wide">
                    {daysLeft === 1 ? "day" : "days"} left
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={clsx(
                      "h-2 rounded-full transition-all",
                      urgency.progressBar,
                    )}
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>

              {/* Details Row */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 text-gray-600">
                    <Package className="h-4 w-4" />
                    <span>{prediction.currentStockPacks} packs</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <TrendingDown className="h-4 w-4" />
                    <span>{prediction.dailyUsage.toFixed(1)}/day</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {format(
                        new Date(prediction.predictedStockoutDate),
                        "MMM d",
                      )}
                    </span>
                  </div>
                </div>

                {/* Confidence Badge */}
                {prediction.confidence > 0 && (
                  <div className="text-xs text-gray-500">
                    {Math.round(prediction.confidence * 100)}% confidence
                  </div>
                )}
              </div>

              {/* Relative Time */}
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Expected to run out{" "}
                  <span className="font-medium text-gray-700">
                    {formatDistanceToNow(
                      new Date(prediction.predictedStockoutDate),
                      {
                        addSuffix: true,
                      },
                    )}
                  </span>
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      {data?.data && data.data.length > limit && (
        <div className="mt-4 pt-4 border-t border-gray-200 text-center">
          <Link
            to={`/clients/${clientId}/products?filter=stockout_risk`}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View all {data.data.length} at-risk products →
          </Link>
        </div>
      )}
    </div>
  );
}
