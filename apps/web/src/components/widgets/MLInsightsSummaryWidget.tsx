// =============================================================================
// ML INSIGHTS SUMMARY WIDGET
// Dashboard summary showing ML service status and key metrics
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Activity,
  ArrowRight,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { MLStatusBadge } from "@/components/MLStatusBadge";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { api } from "@/api/client";

interface MLSummary {
  status: "healthy" | "degraded" | "offline";
  totalForecasts: number;
  totalStockoutPredictions: number;
  averageAccuracy: number;
  activePredictions: number;
  criticalStockouts: number;
}

interface MLSummaryResponse {
  data: MLSummary;
}

export function MLInsightsSummaryWidget() {
  const navigate = useNavigate();

  // Fetch ML summary from actual API endpoint
  const { data: mlSummary, isLoading, isError } = useQuery({
    queryKey: ["ml-summary"],
    queryFn: async () => {
      try {
        const response = await api.get<MLSummaryResponse>("/ml/summary");
        return response.data;
      } catch {
        // Return offline status when ML service is not configured/available
        return {
          status: "offline" as const,
          totalForecasts: 0,
          totalStockoutPredictions: 0,
          averageAccuracy: 0,
          activePredictions: 0,
          criticalStockouts: 0,
        };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1, // Only retry once for ML service
  });

  // Default to offline when no data or error
  const summary: MLSummary = mlSummary || {
    status: isError ? "offline" : "healthy",
    totalForecasts: 0,
    totalStockoutPredictions: 0,
    averageAccuracy: 0,
    activePredictions: 0,
    criticalStockouts: 0,
  };

  const isHealthy = summary.status === "healthy";
  const isOffline = summary.status === "offline";
  const hasNoPredictions = summary.totalForecasts === 0 && summary.totalStockoutPredictions === 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            ML Analytics Summary
          </h3>
        </div>
        <MLStatusBadge showLabel={true} />
      </div>

      {/* ML Service Status */}
      {isLoading ? (
        <div className="h-32 bg-gray-100 rounded animate-pulse mb-4" />
      ) : (
        <>
          {isOffline && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-900">
                    ML Service Unavailable
                  </p>
                  <p className="text-xs text-red-700 mt-1">
                    The ML Analytics service cannot be reached. Please contact your administrator.
                  </p>
                </div>
              </div>
            </div>
          )}

          {hasNoPredictions && !isOffline && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Activity className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-900">
                    Collecting Transaction Data
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    AI predictions require 30+ days of transaction history. The system automatically collects data with each order.
                  </p>

                  {/* Data Collection Progress */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-blue-700 mb-1.5">
                      <span>ML Data Requirements</span>
                      <span className="font-medium">0 of 30+ days</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: '0%' }}
                      />
                    </div>
                    <p className="text-xs text-blue-600 mt-2">
                      📊 Start importing transaction data or placing orders to enable predictions
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {summary.status === "degraded" && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    ML Service Degraded
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Some ML predictions may be slower than usual.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isHealthy && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-900">
                    All Systems Operational
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    ML predictions are being generated in real-time
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Metrics Grid */}
      {!isOffline && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Active Predictions */}
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-blue-700">Active Predictions</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">
              {summary.activePredictions}
            </p>
            <p className="text-xs text-blue-600 mt-1">Products monitored</p>
          </div>

          {/* Average Accuracy */}
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-xs text-green-700">Avg. Accuracy</span>
            </div>
            <p className="text-2xl font-bold text-green-900">
              {summary.averageAccuracy.toFixed(0)}%
            </p>
            <p className="text-xs text-green-600 mt-1">Forecast MAPE</p>
          </div>

          {/* Critical Stockouts */}
          {summary.criticalStockouts > 0 && (
            <div className="col-span-2 p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-xs font-semibold text-red-700">
                      Critical Stockouts
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-red-900">
                    {summary.criticalStockouts}
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    Products predicted to stock out within 7 days
                  </p>
                </div>
                <button
                  onClick={() => navigate("/ml-analytics")}
                  className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  View Details
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats Row */}
      {!isOffline && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {summary.totalForecasts}
            </p>
            <p className="text-xs text-gray-600 mt-1">Forecasts Generated</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {summary.totalStockoutPredictions}
            </p>
            <p className="text-xs text-gray-600 mt-1">Stockout Predictions</p>
          </div>
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={() => navigate("/ml-analytics")}
        className={clsx(
          "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors text-sm font-medium",
          isOffline
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-purple-600 text-white hover:bg-purple-700",
        )}
        disabled={isOffline}
      >
        <span>View Full ML Analytics</span>
        <ArrowRight className="w-4 h-4" />
      </button>

      {/* Footer Note */}
      {!isOffline && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            ML predictions use Facebook Prophet to analyze usage patterns and
            forecast future demand. Accuracy improves with more historical data.
          </p>
        </div>
      )}
    </div>
  );
}

export default MLInsightsSummaryWidget;
