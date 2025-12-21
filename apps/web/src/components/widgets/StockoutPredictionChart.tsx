import { useState, useEffect } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { AlertTriangle, Calendar, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { api } from "@/api/client";
import { ConfidenceBadge } from "../shared/ConfidenceBadge";

// Helper to safely extract error message from Axios errors
function getErrorMessage(error: unknown, defaultMessage = "An error occurred"): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.error || error.response?.data?.message || error.message || defaultMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return defaultMessage;
}

interface StockoutPredictionData {
  productId: string;
  predicted_stockout_date: string | null;
  days_until_stockout: number | null;
  confidence: number;
  daily_usage_forecast: Array<{
    date: string;
    predicted_usage: number;
    remaining_stock: number;
  }>;
  productName?: string;
  productCode?: string;
}

interface StockoutPredictionChartProps {
  productId: string;
  productName?: string;
  currentStock: number;
  horizonDays?: number;
}

export function StockoutPredictionChart({
  productId,
  productName,
  currentStock,
  horizonDays = 90,
}: StockoutPredictionChartProps) {
  const [chartData, setChartData] = useState<any[]>([]);

  const {
    data: prediction,
    isLoading,
    error,
  } = useQuery<StockoutPredictionData>({
    queryKey: ["ml-stockout", productId, horizonDays],
    queryFn: async () => {
      const response = await api.get<{ data: StockoutPredictionData }>(
        `/ml/stockout/${productId}`,
        { params: { horizonDays } },
      );
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (prediction?.daily_usage_forecast) {
      const data = prediction.daily_usage_forecast.map((day) => ({
        date: new Date(day.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        fullDate: day.date,
        usage: Math.round(day.predicted_usage),
        stock: Math.round(day.remaining_stock),
      }));
      setChartData(data);
    }
  }, [prediction]);

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
        return "text-red-700 bg-red-50 border-red-200";
      case "warning":
        return "text-orange-700 bg-orange-50 border-orange-200";
      case "watch":
        return "text-yellow-700 bg-yellow-50 border-yellow-200";
      default:
        return "text-green-700 bg-green-50 border-green-200";
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = getErrorMessage(error, "Unable to generate prediction");

    // Provide clear, helpful messages instead of "failed" or "offline"
    let displayMessage = errorMessage;
    let helperText = "";
    let daysOfData = 0;
    const daysNeeded = 30;

    if (errorMessage.includes("No transaction data")) {
      displayMessage = "Collecting Transaction Data";
      helperText = "This product needs transaction history to predict stockouts. The system automatically collects data with each order.";
      daysOfData = 0;
    } else if (errorMessage.includes("Insufficient data")) {
      displayMessage = "Building Prediction Model";
      helperText = "More transaction history is needed for accurate predictions. The system continues to collect data automatically.";
      // Try to extract days from error message if available
      const daysMatch = errorMessage.match(/(\d+)\s*days?/i);
      if (daysMatch) {
        daysOfData = parseInt(daysMatch[1]);
      }
    }

    const progressPercent = Math.min((daysOfData / daysNeeded) * 100, 100);

    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 text-blue-600 mb-4">
          <AlertTriangle className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Stockout Prediction</h3>
        </div>
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-900">{displayMessage}</p>
          {helperText && (
            <p className="text-xs text-blue-700 mt-2">{helperText}</p>
          )}

          {/* Data Collection Progress */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-blue-700 mb-2">
              <span>Transaction History</span>
              <span className="font-medium">{daysOfData} of {daysNeeded}+ days</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-blue-600 mt-2">
              {daysOfData === 0
                ? "📊 Start placing orders to begin data collection"
                : daysOfData < daysNeeded
                ? `📈 ${daysNeeded - daysOfData} more days needed for predictions`
                : "✓ Sufficient data - predictions available soon"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const urgencyLevel = getUrgencyLevel(prediction?.days_until_stockout || null);
  const urgencyColors = getUrgencyColor(urgencyLevel);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-orange-600" />
        <h3 className="text-lg font-semibold">
          Stockout Prediction
          {productName && (
            <span className="text-sm font-normal text-gray-600 ml-2">
              ({productName})
            </span>
          )}
        </h3>
      </div>

      {/* Prediction Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-600 mb-1">Current Stock</div>
          <div className="text-lg font-semibold text-gray-900">
            {currentStock.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">units</div>
        </div>

        <div className={`rounded-lg p-3 border ${urgencyColors}`}>
          <div className="text-xs mb-1">Stockout Date</div>
          <div className="text-lg font-semibold">
            {prediction?.predicted_stockout_date ? (
              new Date(prediction.predicted_stockout_date).toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                },
              )
            ) : (
              <span className="text-green-700">No stockout</span>
            )}
          </div>
          <div className="text-xs mt-1">
            {prediction?.days_until_stockout
              ? `in ${prediction.days_until_stockout} days`
              : "within forecast period"}
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-3">
          <div className="text-xs text-gray-600 mb-2">
            Prediction Confidence
          </div>
          {prediction?.confidence ? (
            <ConfidenceBadge
              score={prediction.confidence}
              showBreakdown={true}
              method="stockout_prediction"
            />
          ) : (
            <div className="text-sm text-gray-500">N/A</div>
          )}
        </div>
      </div>

      {/* Urgency Alert */}
      {prediction?.days_until_stockout &&
        prediction.days_until_stockout <= 30 && (
          <div className={`p-3 rounded-lg border mb-6 ${urgencyColors}`}>
            <div className="flex items-start gap-2">
              {urgencyLevel === "critical" ? (
                <AlertTriangle className="w-5 h-5 mt-0.5" />
              ) : (
                <Calendar className="w-5 h-5 mt-0.5" />
              )}
              <div>
                <p className="font-semibold text-sm">
                  {urgencyLevel === "critical"
                    ? "URGENT: Stockout Imminent"
                    : urgencyLevel === "warning"
                      ? "WARNING: Low Stock Alert"
                      : "NOTICE: Stock Running Low"}
                </p>
                <p className="text-sm mt-1">
                  This product is predicted to stock out in{" "}
                  {prediction.days_until_stockout} days. Consider placing a
                  reorder soon to avoid disruption.
                </p>
              </div>
            </div>
          </div>
        )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
            stroke="#6B7280"
            style={{ fontSize: "12px" }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            yAxisId="left"
            stroke="#6B7280"
            style={{ fontSize: "12px" }}
            label={{
              value: "Remaining Stock",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: "12px", fill: "#6B7280" },
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#F59E0B"
            style={{ fontSize: "12px" }}
            label={{
              value: "Daily Usage",
              angle: 90,
              position: "insideRight",
              style: { fontSize: "12px", fill: "#F59E0B" },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
            formatter={(value: any, name: string) => {
              const labels: Record<string, string> = {
                stock: "Remaining Stock",
                usage: "Daily Usage",
              };
              return [`${Math.round(value)} units`, labels[name] || name];
            }}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="line" />

          {/* Zero stock reference line */}
          <ReferenceLine
            y={0}
            yAxisId="left"
            stroke="#EF4444"
            strokeDasharray="3 3"
            label={{
              value: "Stockout Level",
              position: "right",
              fill: "#EF4444",
              fontSize: 12,
            }}
          />

          {/* Remaining stock area */}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="stock"
            stroke="#3B82F6"
            fill="#DBEAFE"
            fillOpacity={0.6}
            name="Remaining Stock"
          />

          {/* Daily usage line */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="usage"
            stroke="#F59E0B"
            strokeWidth={2}
            dot={{ fill: "#F59E0B", r: 3 }}
            name="Daily Usage"
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-4 flex items-start gap-2 text-xs text-gray-600">
        <TrendingDown className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          This prediction is based on historical usage patterns and current
          stock levels. The confidence score indicates the reliability of the
          prediction. Consider ordering before the predicted stockout date to
          maintain adequate inventory.
        </p>
      </div>
    </div>
  );
}
