// =============================================================================
// TOP PRODUCTS WIDGET - PORTAL
// Shows top products by usage with trend indicators
// =============================================================================

import { TrendingUp, TrendingDown, Minus, Package } from "lucide-react";

interface TopProduct {
  id: string;
  name: string;
  units: number;
  trend: "growing" | "stable" | "declining";
}

interface TopProductsWidgetProps {
  products: TopProduct[];
  title?: string;
  limit?: number;
}

export function TopProductsWidget({
  products,
  title = "Top Products",
  limit = 5,
}: TopProductsWidgetProps) {
  const displayProducts = products.slice(0, limit);

  // Get trend icon and styling
  const getTrendConfig = (trend: string) => {
    switch (trend) {
      case "growing":
        return {
          icon: TrendingUp,
          color: "text-green-600",
          bgColor: "bg-green-100",
          label: "Growing",
        };
      case "declining":
        return {
          icon: TrendingDown,
          color: "text-red-600",
          bgColor: "bg-red-100",
          label: "Declining",
        };
      case "stable":
      default:
        return {
          icon: Minus,
          color: "text-gray-600",
          bgColor: "bg-gray-100",
          label: "Stable",
        };
    }
  };

  if (displayProducts.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No product data available</p>
        </div>
      </div>
    );
  }

  // Calculate total for percentages
  const totalUnits = products.reduce((sum, p) => sum + p.units, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <span className="text-sm text-gray-500">Last 30 days</span>
      </div>

      {/* Products List */}
      <div className="space-y-3">
        {displayProducts.map((product, index) => {
          const config = getTrendConfig(product.trend);
          const TrendIcon = config.icon;
          const percentOfTotal =
            totalUnits > 0 ? (product.units / totalUnits) * 100 : 0;

          return (
            <div
              key={product.id}
              className="p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{product.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {percentOfTotal.toFixed(1)}% of total volume
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">
                    {product.units.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">units</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${percentOfTotal}%` }}
                />
              </div>

              {/* Trend Indicator */}
              <div className="flex items-center justify-between">
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded-full ${config.bgColor}`}
                >
                  <TrendIcon className={`w-3 h-3 ${config.color}`} />
                  <span className={`text-xs font-medium ${config.color}`}>
                    {config.label}
                  </span>
                </div>

                {/* Monthly average */}
                <p className="text-xs text-gray-500">
                  ~{Math.round(product.units / 30)}/day avg
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {products.length > limit && (
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            Showing top {limit} of {products.length} products
          </p>
        </div>
      )}

      {/* Summary Footer */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {products.length}
            </p>
            <p className="text-xs text-gray-500">Total Products</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-600">
              {totalUnits.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">Total Units</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">
              {products.filter((p) => p.trend === "growing").length}
            </p>
            <p className="text-xs text-gray-500">Growing</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TopProductsWidget;
