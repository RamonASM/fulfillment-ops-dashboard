// =============================================================================
// PRODUCT TABLE
// Table component for displaying client products with status and metrics
// Extracted from ClientDetail.tsx for maintainability
// =============================================================================

import { Package, ShoppingCart, Brain } from "lucide-react";
import { clsx } from "clsx";
import { STATUS_ICONS } from "@inventory/shared";
import type { ProductWithMetrics } from "@inventory/shared";
import { UsageTierBadge } from "@/components/ui";

// =============================================================================
// TYPES
// =============================================================================

interface PendingOrder {
  orderId: string;
  status: string;
  quantityPacks: number;
}

// Types matching UsageTierBadge component expectations
type UsageCalculationTier =
  | "12_month"
  | "6_month"
  | "3_month"
  | "weekly"
  | null
  | undefined;
type UsageConfidence = "high" | "medium" | "low" | null | undefined;

export interface ProductWithEnhancedMetrics extends ProductWithMetrics {
  usageCalculationTier?: UsageCalculationTier;
  usageConfidence?: UsageConfidence;
  monthlyUsagePacks?: number;
  hasOnOrder?: boolean;
  onOrderPacks?: number;
  pendingOrders?: PendingOrder[];
}

type ItemTypeTab = "evergreen" | "event" | "completed";

interface ProductTableProps {
  products: ProductWithEnhancedMetrics[];
  isLoading: boolean;
  search: string;
  activeTab: ItemTypeTab;
  onViewForecast: (product: ProductWithEnhancedMetrics) => void;
}

interface StatusPillProps {
  label: string;
  count: number;
  color: string;
}

// =============================================================================
// STATUS PILL COMPONENT
// =============================================================================

export function StatusPill({ label, count, color }: StatusPillProps) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 rounded-lg"
      style={{ backgroundColor: `${color}15` }}
    >
      <div
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="font-medium" style={{ color }}>
        {count}
      </span>
      <span className="text-gray-600">{label}</span>
    </div>
  );
}

// =============================================================================
// PRODUCT ROW COMPONENT
// =============================================================================

function ProductRow({
  product,
  onViewForecast,
}: {
  product: ProductWithEnhancedMetrics;
  onViewForecast: (product: ProductWithEnhancedMetrics) => void;
}) {
  const status = product.status;
  const stockPercent = status.percentOfReorderPoint;

  return (
    <tr className="cursor-pointer hover:bg-gray-50 transition-colors">
      <td>
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: status.color }}
            aria-hidden="true"
          />
          <span className="text-xs font-medium uppercase text-gray-500">
            {STATUS_ICONS[status.level]} {status.level}
          </span>
        </div>
      </td>
      <td>
        <span className="font-mono text-sm">{product.productId}</span>
      </td>
      <td>
        <span className="font-medium">{product.name}</span>
      </td>
      <td>
        <div>
          <div className="text-sm">
            {product.currentStockPacks} pks ({product.currentStockUnits} units)
          </div>
          <div
            className="w-24 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.min(100, stockPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Stock level: ${Math.min(100, stockPercent)}% of reorder point`}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, stockPercent)}%`,
                backgroundColor: status.color,
              }}
            />
          </div>
        </div>
      </td>
      <td>
        <UsageTierBadge
          tier={product.usageCalculationTier}
          confidence={product.usageConfidence}
          monthlyUsage={product.monthlyUsagePacks}
          showValue={true}
          compact={false}
        />
      </td>
      <td>
        {product.hasOnOrder ? (
          <div className="group relative">
            <div className="flex items-center gap-1.5 text-blue-600">
              <ShoppingCart className="w-4 h-4" aria-hidden="true" />
              <span className="font-medium text-sm">
                {product.onOrderPacks} pks
              </span>
            </div>
            {/* Tooltip on hover showing order details */}
            {product.pendingOrders && product.pendingOrders.length > 0 && (
              <div
                className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded-lg py-2 px-3 -top-2 left-1/2 -translate-x-1/2 -translate-y-full w-48 shadow-lg"
                role="tooltip"
              >
                <p className="font-semibold mb-1">
                  {product.pendingOrders.length} pending order
                  {product.pendingOrders.length > 1 ? "s" : ""}
                </p>
                {product.pendingOrders
                  .slice(0, 3)
                  .map((order: PendingOrder) => (
                    <div
                      key={order.orderId}
                      className="flex justify-between text-gray-300"
                    >
                      <span className="capitalize">{order.status}</span>
                      <span>{order.quantityPacks} pks</span>
                    </div>
                  ))}
                {product.pendingOrders.length > 3 && (
                  <p className="text-gray-400 mt-1">
                    +{product.pendingOrders.length - 3} more...
                  </p>
                )}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-4 border-transparent border-t-gray-900" />
              </div>
            )}
          </div>
        ) : (
          <span className="text-gray-400" aria-label="No orders pending">
            —
          </span>
        )}
      </td>
      <td>
        <span
          className={clsx(
            "font-medium",
            status.weeksRemaining < 2 && "text-red-600",
            status.weeksRemaining >= 2 &&
              status.weeksRemaining < 4 &&
              "text-amber-600",
            status.weeksRemaining >= 4 && "text-gray-900"
          )}
        >
          {status.weeksRemaining === 999 ? "—" : `${status.weeksRemaining}w`}
        </span>
      </td>
      <td>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewForecast(product);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 border border-purple-200 rounded-lg transition-colors"
          title="View AI-powered demand forecast and stockout predictions"
          aria-label={`View forecast for ${product.name}`}
        >
          <Brain className="w-4 h-4" aria-hidden="true" />
          <span>Forecast</span>
        </button>
      </td>
    </tr>
  );
}

// =============================================================================
// PRODUCT TABLE COMPONENT
// =============================================================================

export function ProductTable({
  products,
  isLoading,
  search,
  activeTab,
  onViewForecast,
}: ProductTableProps) {
  if (isLoading) {
    return (
      <div className="card overflow-hidden">
        <div className="p-8 text-center text-gray-500">Loading products...</div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="card overflow-hidden">
        <div className="p-12 text-center">
          <Package
            className="w-12 h-12 mx-auto text-gray-300"
            aria-hidden="true"
          />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No products found
          </h3>
          <p className="mt-2 text-gray-500">
            {search
              ? "Try adjusting your search terms"
              : `No ${activeTab} products for this client`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="table-container">
        <table className="table" role="grid">
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Product ID</th>
              <th scope="col">Name</th>
              <th scope="col">Stock</th>
              <th scope="col">Usage</th>
              <th scope="col">On Order</th>
              <th scope="col">Weeks Left</th>
              <th scope="col">AI Insights</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                onViewForecast={onViewForecast}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProductTable;
