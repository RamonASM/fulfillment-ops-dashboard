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
} from "recharts";
import { TrendingUp, AlertCircle, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

interface DemandForecastData {
  productId: string;
  predictions: Array<{
    ds: string;
    yhat: number;
    yhat_lower: number;
    yhat_upper: number;
  }>;
  model_metrics: {
    mape: number;
    rmse: number;
    training_samples: number;
  };
  seasonality_detected: boolean;
  productName?: string;
  productCode?: string;
}

interface DemandForecastChartProps {
  productId: string;
  productName?: string;
  horizonDays?: number;
  showMetrics?: boolean;
}

export function DemandForecastChart({
  productId,
  productName,
  horizonDays = 30,
  showMetrics = true,
}: DemandForecastChartProps) {
  const [chartData, setChartData] = useState<any[]>([]);

  const {
    data: forecast,
    isLoading,
    error,
  } = useQuery<DemandForecastData>({
    queryKey: ["ml-forecast", productId, horizonDays],
    queryFn: async () => {
      const response = await api.get<{ data: DemandForecastData }>(
        `/ml/forecast/${productId}`,
        { params: { horizonDays } },
      );
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (forecast?.predictions) {
      const data = forecast.predictions.map((pred) => ({
        date: new Date(pred.ds).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        fullDate: pred.ds,
        predicted: Math.round(pred.yhat),
        lower: Math.round(pred.yhat_lower),
        upper: Math.round(pred.yhat_upper),
      }));
      setChartData(data);
    }
  }, [forecast]);

  const exportToCSV = () => {
    if (!chartData.length) return;

    const csv = [
      "Date,Predicted Demand,Lower Bound,Upper Bound",
      ...chartData.map(
        (row) => `${row.fullDate},${row.predicted},${row.lower},${row.upper}`,
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `demand_forecast_${productId}_${new Date().toISOString().split("T")[0]}.csv`;
    link.href = url;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage =
      (error as any)?.response?.data?.error || "Failed to load demand forecast";

    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 text-amber-600 mb-4">
          <AlertCircle className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Demand Forecast</h3>
        </div>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">{errorMessage}</p>
          {errorMessage.includes("No transaction data") && (
            <p className="text-xs text-amber-600 mt-2">
              This product needs transaction history to generate forecasts.
            </p>
          )}
          {errorMessage.includes("Insufficient data") && (
            <p className="text-xs text-amber-600 mt-2">
              At least 30 days of historical data is required for forecasting.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold">
            Demand Forecast
            {productName && (
              <span className="text-sm font-normal text-gray-600 ml-2">
                ({productName})
              </span>
            )}
          </h3>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          title="Export forecast data to CSV"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {showMetrics && forecast?.model_metrics && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 mb-1">Accuracy (MAPE)</div>
            <div className="text-lg font-semibold text-blue-700">
              {forecast.model_metrics.mape.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {forecast.model_metrics.mape < 10
                ? "Excellent"
                : forecast.model_metrics.mape < 20
                  ? "Good"
                  : forecast.model_metrics.mape < 30
                    ? "Fair"
                    : "Poor"}
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 mb-1">Training Data</div>
            <div className="text-lg font-semibold text-purple-700">
              {forecast.model_metrics.training_samples}
            </div>
            <div className="text-xs text-gray-500 mt-1">data points</div>
          </div>

          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 mb-1">Seasonality</div>
            <div className="text-lg font-semibold text-green-700">
              {forecast.seasonality_detected ? "Detected" : "None"}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {forecast.seasonality_detected ? "Weekly/yearly" : "Linear trend"}
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-800">
          📊 This forecast predicts demand for the next {horizonDays} days based
          on historical transaction patterns.
          {forecast?.seasonality_detected &&
            " Seasonal patterns have been detected and incorporated."}
        </p>
      </div>

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
            stroke="#6B7280"
            style={{ fontSize: "12px" }}
            label={{
              value: "Units",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: "12px", fill: "#6B7280" },
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
                predicted: "Predicted Demand",
                lower: "Lower Bound",
                upper: "Upper Bound",
              };
              return [`${Math.round(value)} units`, labels[name] || name];
            }}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="line" />

          {/* Confidence interval area */}
          <Area
            type="monotone"
            dataKey="upper"
            stroke="none"
            fill="#DBEAFE"
            fillOpacity={0.6}
            name="Confidence Interval"
          />
          <Area
            type="monotone"
            dataKey="lower"
            stroke="none"
            fill="#FFFFFF"
            fillOpacity={1}
          />

          {/* Predicted demand line */}
          <Line
            type="monotone"
            dataKey="predicted"
            stroke="#3B82F6"
            strokeWidth={3}
            dot={{ fill: "#3B82F6", r: 4 }}
            activeDot={{ r: 6 }}
            name="Predicted Demand"
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-4 flex items-start gap-2 text-xs text-gray-600">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          The shaded area represents the 95% confidence interval. Actual demand
          is expected to fall within this range. MAPE (Mean Absolute Percentage
          Error) indicates forecast accuracy - lower is better.
        </p>
      </div>
    </div>
  );
}
