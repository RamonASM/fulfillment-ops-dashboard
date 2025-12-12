// =============================================================================
// REORDER QUEUE WIDGET
// Shows products that need to be reordered with urgency levels
// =============================================================================

import { ShoppingCart, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface ReorderRecommendation {
  productId: string;
  productName: string;
  currentStock: number;
  monthlyUsage: number;
  weeksOfSupply: number;
  suggestedOrderQty: number;
  urgency: 'critical' | 'soon' | 'planned';
  reason: string;
  estimatedStockoutDate: string | null;
}

interface ReorderQueueWidgetProps {
  recommendations: ReorderRecommendation[];
  title?: string;
  onReorder?: (productId: string, quantity: number) => void;
  limit?: number;
}

const urgencyConfig = {
  critical: {
    icon: AlertCircle,
    color: 'text-red-700',
    bg: 'bg-red-100',
    border: 'border-red-200',
    label: 'Critical',
  },
  soon: {
    icon: Clock,
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    border: 'border-amber-200',
    label: 'Soon',
  },
  planned: {
    icon: CheckCircle,
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    border: 'border-blue-200',
    label: 'Planned',
  },
};

export function ReorderQueueWidget({
  recommendations,
  title = 'Reorder Queue',
  onReorder,
  limit = 5,
}: ReorderQueueWidgetProps) {
  const displayRecommendations = recommendations.slice(0, limit);

  // Summary counts
  const criticalCount = recommendations.filter((r) => r.urgency === 'critical').length;
  const soonCount = recommendations.filter((r) => r.urgency === 'soon').length;
  const plannedCount = recommendations.filter((r) => r.urgency === 'planned').length;

  if (displayRecommendations.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-gray-500">No reorders needed</p>
          <p className="text-sm text-gray-400">All products are well stocked</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {criticalCount} critical
            </span>
          )}
          {soonCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              {soonCount} soon
            </span>
          )}
          {plannedCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              {plannedCount} planned
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {displayRecommendations.map((rec) => {
          const config = urgencyConfig[rec.urgency];
          const UrgencyIcon = config.icon;

          return (
            <div
              key={rec.productId}
              className={`p-4 rounded-lg border ${config.border} ${config.bg} bg-opacity-30`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${config.bg}`}>
                    <UrgencyIcon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {rec.productName}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{rec.reason}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>Stock: {rec.currentStock.toLocaleString()}</span>
                      <span>Usage: {rec.monthlyUsage.toLocaleString()}/mo</span>
                      <span>{rec.weeksOfSupply} weeks left</span>
                    </div>
                    {rec.estimatedStockoutDate && (
                      <p className="text-xs text-red-600 mt-1">
                        Stockout: {format(new Date(rec.estimatedStockoutDate), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right flex flex-col items-end gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                    {config.label}
                  </span>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">
                      {rec.suggestedOrderQty.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">suggested qty</p>
                  </div>
                  {onReorder && (
                    <button
                      onClick={() => onReorder(rec.productId, rec.suggestedOrderQty)}
                      className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add to Order
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {recommendations.length > limit && (
        <div className="mt-4 pt-4 border-t border-gray-100 text-center">
          <span className="text-sm text-gray-500">
            +{recommendations.length - limit} more recommendations
          </span>
        </div>
      )}
    </div>
  );
}

export default ReorderQueueWidget;
