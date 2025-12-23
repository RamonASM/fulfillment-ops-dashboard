// =============================================================================
// USAGE CALCULATION DRAWER
// Slide-out panel showing detailed usage calculation breakdown
// Shows monthly data with weights and formula explanations
// =============================================================================

import { motion, AnimatePresence } from "framer-motion";
import { X, Calculator, TrendingUp, Info, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "../../api/client";

// =============================================================================
// TYPES
// =============================================================================

interface MonthlyBreakdown {
  month: string;
  units: number;
  packs: number;
  transactionCount: number;
  weight: number;
}

interface UsageBreakdownResponse {
  productId: string;
  productName: string;
  sku: string;
  packSize: number;
  currentStock: {
    packs: number;
    units: number;
  };
  monthlyUsage: {
    units: number;
    packs: number;
  };
  calculation: {
    tier: string;
    tierDisplay: {
      label: string;
      shortLabel: string;
      color: "green" | "blue" | "amber" | "gray";
      tooltip: string;
    };
    confidence: string;
    dataMonths: number;
    calculatedAt: string;
  };
  runway: {
    weeksRemaining: number | null;
  };
  suggestion: {
    suggestedPacks: number;
    suggestedUnits: number;
  };
  monthlyBreakdown: MonthlyBreakdown[];
  formula: {
    type: string;
    description: string;
    calculation: string;
  };
}

interface UsageCalculationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  clientId: string;
}

// =============================================================================
// COLOR UTILITIES
// =============================================================================

const tierColors = {
  green: {
    badge: "bg-green-100 text-green-800 ring-green-500/20",
    highlight: "bg-green-50 border-green-200",
    text: "text-green-700",
  },
  blue: {
    badge: "bg-blue-100 text-blue-800 ring-blue-500/20",
    highlight: "bg-blue-50 border-blue-200",
    text: "text-blue-700",
  },
  amber: {
    badge: "bg-amber-100 text-amber-800 ring-amber-500/20",
    highlight: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
  },
  gray: {
    badge: "bg-gray-100 text-gray-600 ring-gray-500/20",
    highlight: "bg-gray-50 border-gray-200",
    text: "text-gray-600",
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

export function UsageCalculationDrawer({
  isOpen,
  onClose,
  productId,
  clientId,
}: UsageCalculationDrawerProps) {
  const { data, isLoading, error } = useQuery<UsageBreakdownResponse>({
    queryKey: ["usage-breakdown", clientId, productId],
    queryFn: async () => {
      return api.get<UsageBreakdownResponse>(
        `/clients/${clientId}/products/${productId}/monthly-usage`
      );
    },
    enabled: isOpen && !!productId && !!clientId,
  });

  const colorScheme = data?.calculation.tierDisplay.color
    ? tierColors[data.calculation.tierDisplay.color]
    : tierColors.gray;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl z-50 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Calculator className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 id="drawer-title" className="text-lg font-semibold text-gray-900">
                    Usage Calculation Details
                  </h2>
                  {data && (
                    <p className="text-sm text-gray-500 truncate max-w-xs">
                      {data.sku} - {data.productName}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              )}

              {error && (
                <div className="text-center py-12 text-red-600">
                  <p>Failed to load usage data</p>
                </div>
              )}

              {data && (
                <>
                  {/* Summary Card */}
                  <div className={clsx("rounded-lg border p-4", colorScheme.highlight)}>
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium ring-1 ring-inset",
                          colorScheme.badge
                        )}
                      >
                        {data.calculation.tierDisplay.label}
                      </span>
                      <span className={clsx("text-sm font-medium", colorScheme.text)}>
                        {data.calculation.confidence.toUpperCase()} Confidence
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-gray-900">
                        {data.monthlyUsage.units.toFixed(1)}
                      </span>
                      <span className="text-gray-500">units/month</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      Based on {data.calculation.dataMonths} months of transaction data
                    </p>
                  </div>

                  {/* Formula Section */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Info className="w-4 h-4 text-gray-400" />
                      <h3 className="font-medium text-gray-900">Formula</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{data.formula.description}</p>
                    <div className="bg-white border border-gray-200 rounded-lg p-3 font-mono text-sm text-gray-700 overflow-x-auto">
                      {data.formula.calculation}
                    </div>
                  </div>

                  {/* Monthly Breakdown */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-4 h-4 text-gray-400" />
                      <h3 className="font-medium text-gray-900">Monthly Breakdown</h3>
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Month
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                              Units
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                              Txns
                            </th>
                            {data.calculation.tier === "12_month" && (
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                Weight
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {data.monthlyBreakdown.slice(-12).map((month, idx, arr) => {
                            const isWeighted =
                              data.calculation.tier === "12_month" && month.weight > 1;
                            return (
                              <tr
                                key={month.month}
                                className={clsx(
                                  isWeighted && "bg-green-50",
                                  idx === arr.length - 1 && "font-medium"
                                )}
                              >
                                <td className="px-3 py-2 text-sm text-gray-900">
                                  {formatMonth(month.month)}
                                </td>
                                <td className="px-3 py-2 text-sm text-gray-600 text-right">
                                  {Math.round(month.units).toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-sm text-gray-500 text-right">
                                  {month.transactionCount}
                                </td>
                                {data.calculation.tier === "12_month" && (
                                  <td className="px-3 py-2 text-sm text-right">
                                    <span
                                      className={clsx(
                                        "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
                                        isWeighted
                                          ? "bg-green-100 text-green-700"
                                          : "text-gray-400"
                                      )}
                                    >
                                      {month.weight}x
                                    </span>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {data.calculation.tier === "12_month" && (
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-400" />
                        Recent 3 months weighted 1.5x for trend sensitivity
                      </p>
                    )}
                  </div>

                  {/* Current Stock & Runway */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-500 mb-1">Current Stock</p>
                      <p className="text-xl font-semibold text-gray-900">
                        {data.currentStock.units.toLocaleString()} units
                      </p>
                      <p className="text-sm text-gray-500">
                        ({data.currentStock.packs} packs)
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-500 mb-1">Runway</p>
                      <p className="text-xl font-semibold text-gray-900">
                        {data.runway.weeksRemaining !== null
                          ? `${data.runway.weeksRemaining.toFixed(1)} weeks`
                          : "N/A"}
                      </p>
                      <p className="text-sm text-gray-500">at current usage</p>
                    </div>
                  </div>

                  {/* Suggested Reorder */}
                  {data.suggestion.suggestedPacks > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-600 mb-1">Suggested Reorder</p>
                      <p className="text-xl font-semibold text-blue-900">
                        {data.suggestion.suggestedPacks} packs
                      </p>
                      <p className="text-sm text-blue-600">
                        ({data.suggestion.suggestedUnits.toLocaleString()} units)
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default UsageCalculationDrawer;
