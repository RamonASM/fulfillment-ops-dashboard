import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Check, Package, TrendingUp, Clock, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { UsageTierBadge } from '@/components/ui';

export interface ProductForOrder {
  id: string;
  productId: string;
  name: string;
  itemType: string;
  packSize: number;
  currentStockPacks: number;
  currentStockUnits: number;
  status: string;
  weeksRemaining: number;
  reorderPointPacks: number;
  suggestedOrderQty: number;
  // Phase 13 usage tier fields
  usageCalculationTier?: '12_month' | '6_month' | '3_month' | 'weekly' | null;
  usageConfidence?: 'high' | 'medium' | 'low' | null;
  monthlyUsagePacks?: number | null;
  monthlyUsageUnits?: number | null;
}

interface ProductOrderCardProps {
  product: ProductForOrder;
  inCart: boolean;
  quantity?: number;
  onAddToCart: (product: ProductForOrder) => void;
  compact?: boolean;
}

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  healthy: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  watch: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  low: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  stockout: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
};

export function ProductOrderCard({
  product,
  inCart,
  quantity,
  onAddToCart,
  compact = false,
}: ProductOrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const colors = statusColors[product.status] || statusColors.healthy;
  const isLowStock = ['critical', 'low', 'stockout'].includes(product.status);
  const hasUsageData = product.usageCalculationTier != null;

  if (compact) {
    return (
      <div
        className={clsx(
          'p-3 flex items-center justify-between rounded-lg border transition-all',
          inCart ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200 hover:border-gray-300',
          isLowStock && !inCart && 'border-l-4 border-l-amber-400'
        )}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{product.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500 font-mono">{product.productId}</span>
            <span className={clsx('text-xs px-1.5 py-0.5 rounded', colors.bg, colors.text)}>
              {product.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3">
          {product.suggestedOrderQty > 0 && (
            <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded">
              Suggested: {product.suggestedOrderQty}
            </span>
          )}
          {inCart ? (
            <div className="flex items-center gap-1 text-emerald-600">
              <Check className="w-4 h-4" />
              <span className="text-sm font-medium">{quantity}</span>
            </div>
          ) : (
            <button
              onClick={() => onAddToCart(product)}
              className="btn btn-sm btn-outline"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      layout
      className={clsx(
        'card overflow-hidden transition-all',
        inCart && 'ring-2 ring-emerald-500 ring-offset-1',
        isLowStock && !inCart && 'border-l-4 border-l-amber-400'
      )}
    >
      {/* Main Card Content */}
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Product Icon */}
          <div className={clsx('p-2 rounded-lg', colors.bg)}>
            <Package className={clsx('w-5 h-5', colors.text)} />
          </div>

          {/* Product Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900">{product.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-500 font-mono">{product.productId}</span>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', colors.bg, colors.text)}>
                    {product.status}
                  </span>
                  <span className="text-xs text-gray-400 capitalize">{product.itemType}</span>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex-shrink-0">
                {inCart ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                    <Check className="w-4 h-4" />
                    <span className="font-medium">{quantity} in cart</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onAddToCart(product)}
                    className="btn btn-primary btn-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add to Cart
                  </button>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {/* Current Stock */}
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-500 mb-0.5">Current Stock</p>
                <p className="font-semibold text-gray-900">
                  {product.currentStockUnits.toLocaleString()} units
                </p>
                <p className="text-xs text-gray-500">{product.currentStockPacks} packs</p>
              </div>

              {/* Monthly Usage */}
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-500 mb-0.5">Monthly Usage</p>
                {hasUsageData && product.monthlyUsagePacks != null ? (
                  <>
                    <p className="font-semibold text-gray-900">
                      {product.monthlyUsagePacks.toFixed(1)} packs
                    </p>
                    <UsageTierBadge
                      tier={product.usageCalculationTier}
                      confidence={product.usageConfidence}
                      compact
                    />
                  </>
                ) : (
                  <p className="text-gray-400 text-sm">No data</p>
                )}
              </div>

              {/* Runway */}
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-500 mb-0.5">Runway</p>
                <div className="flex items-center gap-1">
                  {product.weeksRemaining < 4 && (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <p className={clsx(
                    'font-semibold',
                    product.weeksRemaining < 2 ? 'text-red-600' :
                    product.weeksRemaining < 4 ? 'text-amber-600' : 'text-gray-900'
                  )}>
                    {product.weeksRemaining === 999 ? '∞' : `${product.weeksRemaining}w`}
                  </p>
                </div>
                <p className="text-xs text-gray-500">remaining</p>
              </div>

              {/* Suggested Order */}
              <div className={clsx(
                'rounded-lg p-2.5',
                product.suggestedOrderQty > 0 ? 'bg-amber-50' : 'bg-gray-50'
              )}>
                <p className="text-xs text-gray-500 mb-0.5">Suggested Qty</p>
                {product.suggestedOrderQty > 0 ? (
                  <>
                    <p className="font-semibold text-amber-700">
                      {product.suggestedOrderQty} packs
                    </p>
                    <p className="text-xs text-amber-600">
                      {product.suggestedOrderQty * product.packSize} units
                    </p>
                  </>
                ) : (
                  <p className="text-gray-400 text-sm">Stock OK</p>
                )}
              </div>
            </div>

            {/* Expand Toggle */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mt-3 transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Show details
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Details Panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-100 pt-4 bg-gray-50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Usage Details */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    Usage Analysis
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Calculation Method:</span>
                      <span className="font-medium text-gray-900">
                        {product.usageCalculationTier ? (
                          {
                            '12_month': '12-month average',
                            '6_month': '6-month average',
                            '3_month': '3-month average',
                            'weekly': 'Weekly extrapolation',
                          }[product.usageCalculationTier] || 'N/A'
                        ) : 'Insufficient data'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Confidence:</span>
                      <span className={clsx(
                        'font-medium capitalize',
                        product.usageConfidence === 'high' ? 'text-emerald-600' :
                        product.usageConfidence === 'medium' ? 'text-amber-600' : 'text-gray-600'
                      )}>
                        {product.usageConfidence || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Pack Size:</span>
                      <span className="font-medium text-gray-900">{product.packSize} units/pack</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Reorder Point:</span>
                      <span className="font-medium text-gray-900">{product.reorderPointPacks} packs</span>
                    </div>
                  </div>
                </div>

                {/* Stock Details */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    Stock Details
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Current Units:</span>
                      <span className="font-medium text-gray-900">{product.currentStockUnits.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Current Packs:</span>
                      <span className="font-medium text-gray-900">{product.currentStockPacks}</span>
                    </div>
                    {product.monthlyUsageUnits != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Monthly Units:</span>
                        <span className="font-medium text-gray-900">~{Math.round(product.monthlyUsageUnits).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Weeks Remaining:</span>
                      <span className={clsx(
                        'font-medium',
                        product.weeksRemaining < 2 ? 'text-red-600' :
                        product.weeksRemaining < 4 ? 'text-amber-600' : 'text-emerald-600'
                      )}>
                        {product.weeksRemaining === 999 ? 'Unlimited' : `${product.weeksRemaining} weeks`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommendation */}
              {product.suggestedOrderQty > 0 && (
                <div className="mt-4 p-3 bg-amber-100 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>Recommendation:</strong> Order {product.suggestedOrderQty} packs ({product.suggestedOrderQty * product.packSize} units)
                    to maintain ~8 weeks of stock based on your usage pattern.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default ProductOrderCard;
