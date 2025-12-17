// =============================================================================
// UPCOMING STOCKOUTS WIDGET - PORTAL
// Shows products approaching stockout with countdown timers
// =============================================================================

import { AlertTriangle, Package, ShoppingCart, Clock } from "lucide-react";

interface StockoutProduct {
  id: string;
  name: string;
  daysUntil: number;
  currentStock: number;
}

interface UpcomingStockoutsWidgetProps {
  products: StockoutProduct[];
  title?: string;
  limit?: number;
}

export function UpcomingStockoutsWidget({
  products,
  title = "Upcoming Stockouts",
  limit = 5,
}: UpcomingStockoutsWidgetProps) {
  const displayProducts = products.slice(0, limit);

  // Get urgency config based on days remaining
  const getUrgencyConfig = (daysUntil: number) => {
    if (daysUntil < 0) {
      return {
        color: "text-red-700",
        bgColor: "bg-red-100",
        borderColor: "border-red-200",
        label: "Overdue",
      };
    } else if (daysUntil <= 7) {
      return {
        color: "text-red-700",
        bgColor: "bg-red-100",
        borderColor: "border-red-200",
        label: "Critical",
      };
    } else if (daysUntil <= 14) {
      return {
        color: "text-yellow-700",
        bgColor: "bg-yellow-100",
        borderColor: "border-yellow-200",
        label: "Warning",
      };
    } else {
      return {
        color: "text-blue-700",
        bgColor: "bg-blue-100",
        borderColor: "border-blue-200",
        label: "Notice",
      };
    }
  };

  // Placeholder for quick order action
  const handleQuickOrder = (product: StockoutProduct) => {
    // TODO: Implement quick order functionality
    console.log("Quick order:", product);
    alert(`Order ${product.name} now`);
  };

  if (displayProducts.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No upcoming stockouts</p>
          <p className="text-sm text-gray-400">All inventory levels are good</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <span className="text-sm text-gray-500">
          {products.length} item{products.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Products List */}
      <div className="space-y-3">
        {displayProducts.map((product) => {
          const config = getUrgencyConfig(product.daysUntil);
          const isOverdue = product.daysUntil < 0;

          return (
            <div
              key={product.id}
              className={`p-4 rounded-lg border ${config.borderColor} ${config.bgColor}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {product.daysUntil <= 7 && (
                      <AlertTriangle className={`w-4 h-4 ${config.color}`} />
                    )}
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.bgColor} ${config.color}`}
                    >
                      {config.label}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900">{product.name}</p>
                  <p className="text-sm text-gray-600">
                    Current stock: {product.currentStock} units
                  </p>
                </div>
                <button
                  onClick={() => handleQuickOrder(product)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    product.daysUntil <= 7
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  Order
                </button>
              </div>

              {/* Countdown Display */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    {isOverdue ? (
                      <p className={`font-bold ${config.color}`}>
                        {Math.abs(product.daysUntil)} days overdue
                      </p>
                    ) : (
                      <div>
                        <p className="text-2xl font-bold text-gray-900">
                          {product.daysUntil}
                        </p>
                        <p className="text-xs text-gray-500">
                          day{product.daysUntil !== 1 ? "s" : ""} until stockout
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Visual countdown indicator */}
                  <div className="flex items-center gap-1">
                    {[...Array(Math.min(product.daysUntil, 14))].map(
                      (_, index) => (
                        <div
                          key={index}
                          className={`w-1 h-4 rounded ${
                            index < Math.ceil(product.daysUntil / 2)
                              ? product.daysUntil <= 7
                                ? "bg-red-400"
                                : product.daysUntil <= 14
                                  ? "bg-yellow-400"
                                  : "bg-blue-400"
                              : "bg-gray-200"
                          }`}
                        />
                      ),
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {products.length > limit && (
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            Showing {limit} of {products.length} upcoming stockouts
          </p>
        </div>
      )}
    </div>
  );
}

export default UpcomingStockoutsWidget;
