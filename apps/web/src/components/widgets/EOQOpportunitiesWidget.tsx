// =============================================================================
// EOQ OPPORTUNITIES WIDGET
// Shows Economic Order Quantity optimization opportunities for cost savings
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import {
  TrendingDown,
  Package,
  DollarSign,
  FileSpreadsheet,
  ArrowRight,
} from "lucide-react";
import { api } from "@/api/client";

interface EOQOpportunity {
  productId: string;
  productName: string;
  currentOrderQty: number;
  optimalOrderQty: number;
  currentAnnualCost: number;
  optimalAnnualCost: number;
  annualSavings: number;
  savingsPercent: number;
}

interface EOQOpportunitiesWidgetProps {
  clientId: string;
  limit?: number;
}

export function EOQOpportunitiesWidget({
  clientId,
  limit = 10,
}: EOQOpportunitiesWidgetProps) {
  // Fetch EOQ opportunities
  const { data: opportunitiesData, isLoading } = useQuery({
    queryKey: ["eoq-opportunities", clientId],
    queryFn: () =>
      api.get<{ data: EOQOpportunity[] }>(
        `/financial/eoq/opportunities/${clientId}`,
      ),
    enabled: !!clientId,
  });

  const opportunities = opportunitiesData?.data || [];
  const displayOpportunities = opportunities.slice(0, limit);
  const totalSavings = opportunities.reduce(
    (sum, opp) => sum + opp.annualSavings,
    0,
  );

  // Export to CSV
  const exportToCSV = () => {
    if (opportunities.length === 0) return;

    const csvContent = [
      "Product,Current Order Qty,Optimal Order Qty,Current Annual Cost,Optimal Annual Cost,Annual Savings,Savings %",
      ...displayOpportunities.map(
        (opp) =>
          `"${opp.productName}",${opp.currentOrderQty},${opp.optimalOrderQty},${opp.currentAnnualCost},${opp.optimalAnnualCost},${opp.annualSavings},${opp.savingsPercent}`,
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `eoq_opportunities_${new Date().toISOString().split("T")[0]}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="w-5 h-5 text-green-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            EOQ Optimization Opportunities
          </h3>
        </div>
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No optimization opportunities found</p>
          <p className="text-sm text-gray-400">
            All products are optimally ordered
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-green-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            EOQ Optimization Opportunities
          </h3>
        </div>
        <button
          onClick={exportToCSV}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title="Export as CSV"
        >
          <FileSpreadsheet className="w-4 h-4" />
        </button>
      </div>

      {/* Total Savings Summary */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-green-700 mb-1">
              Total Annual Savings Potential
            </p>
            <p className="text-3xl font-bold text-green-900">
              ${totalSavings.toLocaleString()}
            </p>
            <p className="text-xs text-green-600 mt-1">
              from {opportunities.length} product
              {opportunities.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <DollarSign className="w-8 h-8 text-green-600" />
          </div>
        </div>
      </div>

      {/* Opportunities Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 text-xs font-semibold text-gray-600 uppercase">
                Product
              </th>
              <th className="text-center py-3 px-2 text-xs font-semibold text-gray-600 uppercase">
                Current Qty
              </th>
              <th className="text-center py-3 px-2 text-xs font-semibold text-gray-600 uppercase">
                Optimal Qty
              </th>
              <th className="text-right py-3 px-2 text-xs font-semibold text-gray-600 uppercase">
                Annual Savings
              </th>
            </tr>
          </thead>
          <tbody>
            {displayOpportunities.map((opp, index) => (
              <tr
                key={opp.productId}
                className={`${
                  index !== displayOpportunities.length - 1
                    ? "border-b border-gray-100"
                    : ""
                } hover:bg-gray-50`}
              >
                <td className="py-3 px-2">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {opp.productName}
                    </p>
                    <p className="text-xs text-green-600">
                      Save {opp.savingsPercent.toFixed(1)}%
                    </p>
                  </div>
                </td>
                <td className="py-3 px-2 text-center">
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-sm font-medium text-gray-700">
                    {opp.currentOrderQty}
                  </span>
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center justify-center gap-2">
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-100 text-sm font-medium text-green-700">
                      {opp.optimalOrderQty}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-2 text-right">
                  <div>
                    <p className="font-bold text-green-600">
                      ${opp.annualSavings.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      ${opp.currentAnnualCost.toLocaleString()} → $
                      {opp.optimalAnnualCost.toLocaleString()}
                    </p>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {opportunities.length > limit && (
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            Showing top {limit} of {opportunities.length} opportunities
          </p>
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-700">
          <strong>EOQ (Economic Order Quantity)</strong> calculates the optimal
          order size that minimizes total inventory costs (ordering + holding).
          Implementing these recommendations can reduce annual spending.
        </p>
      </div>
    </div>
  );
}

export default EOQOpportunitiesWidget;
