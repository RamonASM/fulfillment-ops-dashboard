// =============================================================================
// CONFIDENCE BADGE COMPONENT
// Visual indicator for DS Analytics confidence scores with detailed breakdown
// =============================================================================

import { Info } from "lucide-react";
import clsx from "clsx";
import { useState } from "react";

interface ConfidenceFactor {
  name: string;
  value: number; // 0-1
  description?: string;
}

interface ConfidenceBadgeProps {
  score: number; // 0-1
  level?: "high" | "medium" | "low";
  factors?: ConfidenceFactor[];
  dataMonths?: number;
  tier?: string;
  method?: string;
  showBreakdown?: boolean;
  compact?: boolean;
}

const levelConfig = {
  high: {
    className: "bg-emerald-100 text-emerald-800 ring-emerald-500/20",
    label: "High",
    color: "text-emerald-600",
    bgColor: "bg-emerald-600",
  },
  medium: {
    className: "bg-yellow-100 text-yellow-800 ring-yellow-500/20",
    label: "Medium",
    color: "text-yellow-600",
    bgColor: "bg-yellow-600",
  },
  low: {
    className: "bg-gray-100 text-gray-600 ring-gray-500/20",
    label: "Low",
    color: "text-gray-500",
    bgColor: "bg-gray-600",
  },
};

export function ConfidenceBadge({
  score,
  level,
  factors,
  dataMonths,
  tier,
  method,
  showBreakdown = true,
  compact = false,
}: ConfidenceBadgeProps) {
  const [showPopover, setShowPopover] = useState(false);

  // Determine level from score if not provided
  const confidenceLevel =
    level || (score >= 0.75 ? "high" : score >= 0.5 ? "medium" : "low");
  const config = levelConfig[confidenceLevel];
  const percentage = Math.round(score * 100);

  // Build tooltip text
  const tooltipText = `${percentage}% ${config.label} Confidence - ${
    confidenceLevel === "high"
      ? "Substantial historical data with consistent patterns"
      : confidenceLevel === "medium"
        ? "Moderate data available, generally accurate"
        : "Limited data, recommendations should be verified"
  }${dataMonths ? ` (${dataMonths} months data)` : ""}${method ? ` | ${method}` : ""}`;

  // Compact version - just the badge
  if (compact) {
    return (
      <span
        className={clsx(
          "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
          config.className,
        )}
        title={tooltipText}
      >
        {percentage}%
      </span>
    );
  }

  // Standard version with icon
  if (!showBreakdown) {
    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
          config.className,
        )}
        title={tooltipText}
      >
        <Info className="h-3 w-3" />
        {percentage}% {config.label}
      </span>
    );
  }

  // Full version with expandable breakdown
  return (
    <div className="relative inline-block">
      <button
        type="button"
        className={clsx(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset cursor-help transition-all",
          config.className,
          showPopover && "ring-2",
        )}
        onClick={() => setShowPopover(!showPopover)}
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => setShowPopover(false)}
      >
        <Info className="h-3 w-3" />
        {percentage}% {config.label}
      </button>

      {/* Popover with breakdown */}
      {showPopover && (
        <div
          className="absolute z-50 w-80 p-4 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 left-0 top-full"
          onMouseEnter={() => setShowPopover(true)}
          onMouseLeave={() => setShowPopover(false)}
        >
          <div className="space-y-3">
            {/* Header */}
            <div>
              <h4 className="font-semibold text-sm mb-1">
                {config.label} Confidence
              </h4>
              <p className="text-xs text-gray-500">
                Indicates reliability of the calculated values
              </p>
            </div>

            {/* Overall Score */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Overall Score</span>
                <span className={`font-semibold ${config.color}`}>
                  {percentage}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={clsx("h-2 rounded-full", config.bgColor)}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>

            {/* Metadata */}
            {(dataMonths || tier || method) && (
              <div className="pt-2 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {dataMonths && (
                    <div>
                      <span className="text-gray-500">Data Available:</span>
                      <div className="font-medium">{dataMonths} months</div>
                    </div>
                  )}
                  {tier && (
                    <div>
                      <span className="text-gray-500">Calculation Tier:</span>
                      <div className="font-medium capitalize">
                        {tier.replace(/_/g, " ")}
                      </div>
                    </div>
                  )}
                  {method && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Method:</span>
                      <div className="font-medium capitalize">
                        {method.replace(/_/g, " ")}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Confidence Factors Breakdown */}
            {factors && factors.length > 0 && (
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs font-semibold mb-2 text-gray-700">
                  Confidence Factors
                </p>
                <div className="space-y-2">
                  {factors.map((factor) => {
                    const factorPercentage = Math.round(factor.value * 100);
                    return (
                      <div key={factor.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-600">{factor.name}</span>
                          <span className="font-medium text-gray-900">
                            {factorPercentage}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${factorPercentage}%` }}
                          />
                        </div>
                        {factor.description && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {factor.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Interpretation Guide */}
            <div className="pt-2 border-t border-gray-200 text-[10px] text-gray-500">
              <p className="font-medium mb-1">What this means:</p>
              {confidenceLevel === "high" && (
                <p>
                  High confidence - calculations based on substantial historical
                  data with consistent patterns. Recommendations are reliable.
                </p>
              )}
              {confidenceLevel === "medium" && (
                <p>
                  Medium confidence - calculations based on moderate data.
                  Recommendations are generally accurate but should be reviewed.
                </p>
              )}
              {confidenceLevel === "low" && (
                <p>
                  Low confidence - limited historical data available.
                  Recommendations are estimates and should be verified manually.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
