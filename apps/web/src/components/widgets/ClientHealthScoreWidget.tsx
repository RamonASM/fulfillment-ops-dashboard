// =============================================================================
// CLIENT HEALTH SCORE WIDGET
// Displays comprehensive health scoring for a client
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle,
  Minus,
} from "lucide-react";
import { api } from "@/api/client";

interface ClientHealthScore {
  clientId: string;
  clientName: string;
  overallScore: number;
  scoreBreakdown: {
    stockHealth: number;
    alertHealth: number;
    orderHealth: number;
    engagementHealth: number;
    financialHealth: number;
  };
  riskLevel: "low" | "medium" | "high" | "critical";
  trend: "improving" | "stable" | "declining";
  recommendations: string[];
  lastCalculated: string;
}

interface Props {
  clientId: string;
}

const riskLevelConfig = {
  low: {
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    label: "Low Risk",
    icon: CheckCircle,
  },
  medium: {
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    label: "Medium Risk",
    icon: Minus,
  },
  high: {
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    label: "High Risk",
    icon: AlertTriangle,
  },
  critical: {
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    label: "Critical Risk",
    icon: AlertTriangle,
  },
};

const trendConfig = {
  improving: {
    color: "text-green-600",
    icon: TrendingUp,
    label: "Improving",
  },
  stable: {
    color: "text-gray-600",
    icon: Minus,
    label: "Stable",
  },
  declining: {
    color: "text-red-600",
    icon: TrendingDown,
    label: "Declining",
  },
};

export function ClientHealthScoreWidget({ clientId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["client-health", clientId],
    queryFn: () =>
      api.get<{ data: ClientHealthScore }>(`/client-health/${clientId}`),
    staleTime: 300000, // 5 minutes
  });

  const healthScore = data?.data;

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Client Health Score
          </h3>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-gray-200 rounded-lg" />
          <div className="h-32 bg-gray-200 rounded-lg" />
          <div className="h-24 bg-gray-200 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !healthScore) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Client Health Score
          </h3>
        </div>
        <div className="text-center py-8 text-gray-500">
          Unable to load health score
        </div>
      </div>
    );
  }

  const riskConfig = riskLevelConfig[healthScore.riskLevel];
  const trendConf = trendConfig[healthScore.trend];
  const RiskIcon = riskConfig.icon;
  const TrendIcon = trendConf.icon;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    if (score >= 40) return "text-orange-600";
    return "text-red-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return "bg-green-50";
    if (score >= 60) return "bg-yellow-50";
    if (score >= 40) return "bg-orange-50";
    return "bg-red-50";
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Client Health Score
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <TrendIcon className={`w-4 h-4 ${trendConf.color}`} />
          <span className={`text-sm font-medium ${trendConf.color}`}>
            {trendConf.label}
          </span>
        </div>
      </div>

      {/* Overall Score */}
      <div
        className={`${riskConfig.bgColor} ${riskConfig.borderColor} border-2 rounded-xl p-6 mb-6`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <RiskIcon className={`w-5 h-5 ${riskConfig.color}`} />
              <span className={`text-sm font-semibold ${riskConfig.color}`}>
                {riskConfig.label}
              </span>
            </div>
            <div className={`text-5xl font-bold ${riskConfig.color}`}>
              {healthScore.overallScore}
            </div>
            <div className="text-sm text-gray-600 mt-1">Overall Score</div>
          </div>
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-200"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(healthScore.overallScore / 100) * 251.2} 251.2`}
                className={riskConfig.color}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold ${riskConfig.color}`}>
                {healthScore.overallScore}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="space-y-3 mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">
          Health Breakdown
        </h4>

        {/* Stock Health */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">Stock Health (30%)</span>
            <span
              className={`text-sm font-semibold ${getScoreColor(healthScore.scoreBreakdown.stockHealth)}`}
            >
              {healthScore.scoreBreakdown.stockHealth}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${getScoreBgColor(healthScore.scoreBreakdown.stockHealth)} transition-all duration-500`}
              style={{
                width: `${healthScore.scoreBreakdown.stockHealth}%`,
              }}
            />
          </div>
        </div>

        {/* Alert Health */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">Alert Health (25%)</span>
            <span
              className={`text-sm font-semibold ${getScoreColor(healthScore.scoreBreakdown.alertHealth)}`}
            >
              {healthScore.scoreBreakdown.alertHealth}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${getScoreBgColor(healthScore.scoreBreakdown.alertHealth)} transition-all duration-500`}
              style={{
                width: `${healthScore.scoreBreakdown.alertHealth}%`,
              }}
            />
          </div>
        </div>

        {/* Order Health */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">
              Order Health (20%) - SLA
            </span>
            <span
              className={`text-sm font-semibold ${getScoreColor(healthScore.scoreBreakdown.orderHealth)}`}
            >
              {healthScore.scoreBreakdown.orderHealth}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${getScoreBgColor(healthScore.scoreBreakdown.orderHealth)} transition-all duration-500`}
              style={{
                width: `${healthScore.scoreBreakdown.orderHealth}%`,
              }}
            />
          </div>
        </div>

        {/* Engagement Health */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">
              Engagement Health (15%)
            </span>
            <span
              className={`text-sm font-semibold ${getScoreColor(healthScore.scoreBreakdown.engagementHealth)}`}
            >
              {healthScore.scoreBreakdown.engagementHealth}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${getScoreBgColor(healthScore.scoreBreakdown.engagementHealth)} transition-all duration-500`}
              style={{
                width: `${healthScore.scoreBreakdown.engagementHealth}%`,
              }}
            />
          </div>
        </div>

        {/* Financial Health */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">
              Financial Health (10%)
            </span>
            <span
              className={`text-sm font-semibold ${getScoreColor(healthScore.scoreBreakdown.financialHealth)}`}
            >
              {healthScore.scoreBreakdown.financialHealth}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${getScoreBgColor(healthScore.scoreBreakdown.financialHealth)} transition-all duration-500`}
              style={{
                width: `${healthScore.scoreBreakdown.financialHealth}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">
          Recommendations
        </h4>
        <ul className="space-y-2">
          {healthScore.recommendations.map((rec, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-sm text-gray-600"
            >
              <span className="text-blue-600 mt-1">•</span>
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Last Updated */}
      <div className="mt-4 text-xs text-gray-400 text-right">
        Last calculated: {new Date(healthScore.lastCalculated).toLocaleString()}
      </div>
    </div>
  );
}
