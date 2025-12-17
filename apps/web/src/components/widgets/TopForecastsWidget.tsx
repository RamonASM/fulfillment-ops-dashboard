// =============================================================================
// TOP FORECASTS WIDGET
// Shows top products with ML forecasts sorted by accuracy/confidence
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  Brain,
  AlertCircle,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";

interface ForecastItem {
  productId: string;
  productName: string;
  productCode: string;
  clientId: string;
  clientName: string;
  lastForecast: {
    mape: number;
    confidence: number;
    horizon: number;
    createdAt: string;
  };
}

interface TopForecastsWidgetProps {
  clientId?: string;
  limit?: number;
  showClientName?: boolean;
}

export function TopForecastsWidget({
  clientId,
  limit = 5,
  showClientName = true,
}: TopForecastsWidgetProps) {
  const navigate = useNavigate();

  // TODO: Implement /ml/top-forecasts endpoint
  const { data, isLoading } = useQuery({
    queryKey: ["ml-top-forecasts", clientId, limit],
    queryFn: async () => {
      // Mock data for now
      return {
        data: [] as ForecastItem[],
      };
    },
  });

  const forecasts = data?.data || [];

  const getAccuracyColor = (mape: number) => {
    const accuracy = 100 - mape;
    if (accuracy >= 80) return "green";
    if (accuracy >= 60) return "amber";
    return "red";
  };

  const getAccuracyLabel = (mape: number) => {
    const accuracy = 100 - mape;
    if (accuracy >= 80) return "Excellent";
    if (accuracy >= 60) return "Good";
    return "Fair";
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Top ML Forecasts
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
            <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : forecasts.length === 0 ? (
        <div className="text-center py-8">
          <Brain className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">No ML forecasts generated yet</p>
          <p className="text-xs text-gray-500 mt-1">
            Forecasts will appear here once generated for products
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {forecasts.map((forecast) => {
            const accuracyColor = getAccuracyColor(forecast.lastForecast.mape);
            const accuracy = 100 - forecast.lastForecast.mape;

            return (
              <div
                key={forecast.productId}
                className="p-3 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() =>
                  navigate(
                    `/clients/${forecast.clientId}?product=${forecast.productId}`,
                  )
                }
              >
                <div className="flex items-start justify-between">
                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {forecast.productName}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {showClientName && (
                        <>
                          <span className="text-xs text-gray-600">
                            {forecast.clientName}
                          </span>
                          <span className="text-xs text-gray-400">"</span>
                        </>
                      )}
                      <span className="text-xs text-gray-500">
                        {forecast.productCode}
                      </span>
                    </div>
                  </div>

                  {/* Accuracy Badge */}
                  <div className="ml-3 flex-shrink-0">
                    <div
                      className={clsx(
                        "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                        accuracyColor === "green" &&
                          "bg-green-100 text-green-700",
                        accuracyColor === "amber" &&
                          "bg-amber-100 text-amber-700",
                        accuracyColor === "red" && "bg-red-100 text-red-700",
                      )}
                    >
                      {accuracyColor === "green" ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <AlertCircle className="w-3 h-3" />
                      )}
                      <span>{accuracy.toFixed(0)}%</span>
                    </div>
                    <p className="text-xs text-gray-500 text-center mt-1">
                      {getAccuracyLabel(forecast.lastForecast.mape)}
                    </p>
                  </div>
                </div>

                {/* Forecast Details */}
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    <span>{forecast.lastForecast.horizon}d horizon</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Brain className="w-3 h-3" />
                    <span>MAPE: {forecast.lastForecast.mape.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Note */}
      {forecasts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Showing {forecasts.length} products with the most accurate ML
            forecasts. Accuracy measured by MAPE (Mean Absolute Percentage
            Error).
          </p>
        </div>
      )}
    </div>
  );
}

export default TopForecastsWidget;
