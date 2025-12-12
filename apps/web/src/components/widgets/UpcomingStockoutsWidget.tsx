// =============================================================================
// UPCOMING STOCKOUTS WIDGET
// Shows products approaching stockout with days remaining
// =============================================================================

import { AlertTriangle, Clock, Package } from 'lucide-react';
import { Link } from 'react-router-dom';

interface UpcomingStockout {
  id: string;
  name: string;
  daysUntil: number;
  currentStock: number;
}

interface UpcomingStockoutsWidgetProps {
  stockouts: UpcomingStockout[];
  title?: string;
  clientId?: string;
  limit?: number;
}

function getUrgencyLevel(daysUntil: number): {
  color: string;
  bg: string;
  text: string;
} {
  if (daysUntil <= 7) {
    return { color: 'text-red-700', bg: 'bg-red-100', text: 'Critical' };
  }
  if (daysUntil <= 14) {
    return { color: 'text-amber-700', bg: 'bg-amber-100', text: 'Soon' };
  }
  return { color: 'text-blue-700', bg: 'bg-blue-100', text: 'Watch' };
}

export function UpcomingStockoutsWidget({
  stockouts,
  title = 'Upcoming Stockouts',
  clientId,
  limit = 5,
}: UpcomingStockoutsWidgetProps) {
  const displayStockouts = stockouts.slice(0, limit);

  if (displayStockouts.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <Package className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-gray-500">No stockouts predicted</p>
          <p className="text-sm text-gray-400">Inventory levels are healthy</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <span className="text-sm text-gray-500">
          {stockouts.length} product{stockouts.length !== 1 ? 's' : ''} at risk
        </span>
      </div>

      <div className="space-y-3">
        {displayStockouts.map((item) => {
          const urgency = getUrgencyLevel(item.daysUntil);

          return (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${urgency.bg}`}>
                  <Clock className={`w-4 h-4 ${urgency.color}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 truncate max-w-[180px]">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.currentStock.toLocaleString()} units remaining
                  </p>
                </div>
              </div>

              <div className="text-right">
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${urgency.bg} ${urgency.color}`}>
                  {item.daysUntil} days
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {stockouts.length > limit && clientId && (
        <Link
          to={`/clients/${clientId}/products?filter=low-stock`}
          className="block mt-4 pt-4 border-t border-gray-100 text-center text-sm text-blue-600 hover:text-blue-700"
        >
          View all {stockouts.length} at-risk products
        </Link>
      )}

      {/* Urgency legend */}
      <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-gray-500">≤7 days</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-xs text-gray-500">8-14 days</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-xs text-gray-500">15+ days</span>
        </div>
      </div>
    </div>
  );
}

export default UpcomingStockoutsWidget;
