// =============================================================================
// ML ANALYTICS PAGE
// Comprehensive ML hub for demand forecasting and stockout predictions
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Activity,
  Search,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { motion } from "framer-motion";
import { api } from "@/api/client";
import { MLStatusBadge } from "@/components/MLStatusBadge";
import { staggerContainer, staggerItem, fadeInUp } from "@/lib/animations";
import { clsx } from "clsx";
import { useState } from "react";

// =============================================================================
// TYPES
// =============================================================================

interface MLHealthResponse {
  status: "healthy" | "degraded" | "offline";
  service: string;
  database?: string;
  serviceUrl?: string;
  lastCheck?: string;
}

interface ProductPrediction {
  id: string;
  name: string;
  productCode: string;
  clientName: string;
  lastForecast?: {
    createdAt: string;
    confidence: number;
    mape: number;
    horizon: number;
  };
  lastStockout?: {
    createdAt: string;
    daysUntil: number | null;
    confidence: number;
  };
}

// =============================================================================
// COMPONENTS
// =============================================================================

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = "blue",
  loading = false,
  onClick,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  color?: "blue" | "green" | "amber" | "red" | "purple";
  loading?: boolean;
  onClick?: () => void;
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <motion.div
      variants={staggerItem}
      className={clsx(
        "bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow",
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          {loading ? (
            <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
          ) : (
            <>
              <p className="text-3xl font-bold text-gray-900">{value}</p>
              {subtitle && (
                <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
              )}
            </>
          )}
        </div>
        <div className={clsx("p-3 rounded-lg", colorClasses[color])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </motion.div>
  );
}

function PredictionRow({ prediction }: { prediction: ProductPrediction }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {prediction.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500">{prediction.clientName}</span>
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-500">
            {prediction.productCode}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {prediction.lastForecast && (
          <div className="text-right">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-blue-600" />
              <span className="text-xs font-medium text-blue-600">
                {prediction.lastForecast.confidence.toFixed(0)}% accurate
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {prediction.lastForecast.horizon}d forecast
            </p>
          </div>
        )}
        {prediction.lastStockout && (
          <div className="text-right">
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              <span className="text-xs font-medium text-amber-600">
                {prediction.lastStockout.daysUntil
                  ? `${prediction.lastStockout.daysUntil}d until stockout`
                  : "No stockout predicted"}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {prediction.lastStockout.confidence.toFixed(0)}% confidence
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function MLAnalytics() {
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch ML service health
  const { data: mlHealth, isLoading: healthLoading } = useQuery({
    queryKey: ["ml-health"],
    queryFn: () => api.get<MLHealthResponse>("/ml/health"),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 30000, // Check every 30 seconds
    retry: 1,
    meta: { hideError: true },
  });

  // Fetch recent predictions (mock data for now - will be implemented)
  const { data: predictionsData, isLoading: predictionsLoading } = useQuery({
    queryKey: ["ml-predictions"],
    queryFn: async () => {
      // TODO: Implement /ml/predictions endpoint
      return {
        data: [] as ProductPrediction[],
        meta: {
          totalForecasts: 0,
          totalStockoutPredictions: 0,
          averageAccuracy: 0,
          activePredictions: 0,
        },
      };
    },
    enabled: mlHealth?.status === "healthy",
  });

  const predictions = predictionsData?.data || [];
  const meta = predictionsData?.meta || {
    totalForecasts: 0,
    totalStockoutPredictions: 0,
    averageAccuracy: 0,
    activePredictions: 0,
  };

  const isHealthy = mlHealth?.status === "healthy";
  const isOffline = !mlHealth || mlHealth?.status === "offline";

  return (
    <motion.div
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">ML Analytics</h1>
            <MLStatusBadge showLabel={true} />
          </div>
          <p className="text-gray-600 mt-1">
            AI-powered demand forecasting and stockout predictions
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* ML Service Status Banner */}
      {isOffline && (
        <motion.div
          variants={fadeInUp}
          className="bg-red-50 border border-red-200 rounded-lg p-4"
        >
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-900">
                ML Analytics Service Offline
              </h3>
              <p className="text-sm text-red-700 mt-1">
                The ML service is currently unavailable. Demand forecasting and stockout predictions cannot be generated.
              </p>
              {mlHealth?.serviceUrl && (
                <p className="text-xs text-red-600 mt-2">
                  Service URL: <code className="bg-red-100 px-1 py-0.5 rounded">{mlHealth.serviceUrl}</code>
                </p>
              )}
              {mlHealth?.lastCheck && (
                <p className="text-xs text-red-600 mt-1">
                  Last check: {new Date(mlHealth.lastCheck).toLocaleString()}
                </p>
              )}
              <div className="mt-3 p-3 bg-red-100 rounded-lg">
                <p className="text-xs font-medium text-red-800 mb-2">To resolve:</p>
                <ol className="text-xs text-red-700 list-decimal list-inside space-y-1">
                  <li>Ensure <code className="bg-white/50 px-1 rounded">DS_ANALYTICS_URL</code> or <code className="bg-white/50 px-1 rounded">ML_SERVICE_URL</code> is set in production environment</li>
                  <li>Start the DS Analytics service: <code className="bg-white/50 px-1 rounded">cd apps/ds-analytics && python -m uvicorn main:app --port 8000</code></li>
                  <li>Verify the service is reachable from the API server</li>
                </ol>
                <p className="text-xs text-red-600 mt-2 italic">
                  Contact your system administrator if the issue persists.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {mlHealth?.status === "degraded" && (
        <motion.div
          variants={fadeInUp}
          className="bg-amber-50 border border-amber-200 rounded-lg p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900">
                ML Service Degraded
              </h3>
              <p className="text-sm text-amber-700 mt-1">
                The ML service is experiencing issues. Some predictions may be
                slower than usual.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {isHealthy && (
        <motion.div
          variants={fadeInUp}
          className="bg-green-50 border border-green-200 rounded-lg p-4"
        >
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-green-900">
                ML Service Active
              </h3>
              <p className="text-sm text-green-700 mt-1">
                All ML prediction services are operating normally. Forecasts are
                being generated in real-time.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Stats cards */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        data-testid="ml-stats"
      >
        <StatCard
          title="Total Forecasts"
          value={meta.totalForecasts}
          subtitle="Generated this week"
          icon={TrendingUp}
          color="blue"
          loading={healthLoading || predictionsLoading}
        />
        <StatCard
          title="Stockout Predictions"
          value={meta.totalStockoutPredictions}
          subtitle="Active predictions"
          icon={AlertTriangle}
          color="amber"
          loading={healthLoading || predictionsLoading}
        />
        <StatCard
          title="Average Accuracy"
          value={`${meta.averageAccuracy.toFixed(1)}%`}
          subtitle="MAPE across all models"
          icon={Activity}
          color="green"
          loading={healthLoading || predictionsLoading}
        />
        <StatCard
          title="Active Models"
          value={meta.activePredictions}
          subtitle="Products with predictions"
          icon={Brain}
          color="purple"
          loading={healthLoading || predictionsLoading}
        />
      </motion.div>

      {/* Search and Actions */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search products to generate forecasts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            disabled={isOffline}
          />
        </div>
        <button
          className="btn-outline flex items-center gap-2"
          disabled={isOffline}
        >
          <Download className="w-4 h-4" />
          Export Report
        </button>
      </div>

      {/* Recent Predictions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demand Forecasts */}
        <motion.div
          variants={fadeInUp}
          className="bg-white rounded-lg border border-gray-200 p-6"
          data-testid="recent-predictions"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Demand Forecasts
            </h2>
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>

          {predictionsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-16 bg-gray-100 rounded animate-pulse"
                />
              ))}
            </div>
          ) : predictions.filter((p) => p.lastForecast).length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                No forecasts generated yet
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Search for products above to generate predictions
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {predictions
                .filter((p) => p.lastForecast)
                .slice(0, 10)
                .map((prediction) => (
                  <PredictionRow key={prediction.id} prediction={prediction} />
                ))}
            </div>
          )}
        </motion.div>

        {/* Stockout Predictions */}
        <motion.div
          variants={fadeInUp}
          className="bg-white rounded-lg border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Stockout Risk Predictions
            </h2>
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>

          {predictionsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-16 bg-gray-100 rounded animate-pulse"
                />
              ))}
            </div>
          ) : predictions.filter((p) => p.lastStockout).length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                No stockout predictions yet
              </p>
              <p className="text-xs text-gray-400 mt-1">
                System will automatically generate predictions for low-stock
                items
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {predictions
                .filter((p) => p.lastStockout)
                .slice(0, 10)
                .map((prediction) => (
                  <PredictionRow key={prediction.id} prediction={prediction} />
                ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Model Performance Section */}
      <motion.div
        variants={fadeInUp}
        className="bg-white rounded-lg border border-gray-200 p-6"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Model Performance Metrics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-600 mb-2">Forecast Algorithm</p>
            <p className="text-lg font-semibold text-gray-900">
              Facebook Prophet
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Time series forecasting with seasonality detection
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-2">Training Data</p>
            <p className="text-lg font-semibold text-gray-900">30-90 days</p>
            <p className="text-xs text-gray-500 mt-1">
              Historical transaction data required
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-2">Prediction Horizon</p>
            <p className="text-lg font-semibold text-gray-900">30-90 days</p>
            <p className="text-xs text-gray-500 mt-1">
              Forecasts and stockout predictions
            </p>
          </div>
        </div>
      </motion.div>

      {/* Help Section */}
      <motion.div
        variants={fadeInUp}
        className="bg-gray-50 rounded-lg border border-gray-200 p-6"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          How ML Analytics Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Demand Forecasting
            </h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span>Analyzes historical usage patterns</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span>Detects seasonality and trends</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span>Generates 30-90 day predictions</span>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Stockout Prediction
            </h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span>Calculates daily usage rates</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span>Predicts exact stockout date</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span>Provides confidence scores</span>
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
