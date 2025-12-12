// =============================================================================
// ANOMALY ALERTS WIDGET
// Shows detected anomalies in ordering patterns
// =============================================================================

import { AlertTriangle, TrendingUp, TrendingDown, Archive, Package, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AnomalyAlert {
  type: 'demand_spike' | 'demand_drop' | 'unusual_order' | 'dead_stock' | 'overstock';
  severity: 'high' | 'medium' | 'low';
  productId?: string;
  productName?: string;
  locationId?: string;
  message: string;
  details: string;
  detectedAt: string;
  value?: number;
  expectedValue?: number;
}

interface AnomalyAlertsWidgetProps {
  anomalies: AnomalyAlert[];
  title?: string;
  limit?: number;
  onViewAll?: () => void;
  onDismiss?: (index: number) => void;
}

const typeConfig = {
  demand_spike: {
    icon: TrendingUp,
    color: 'text-emerald-700',
    bg: 'bg-emerald-100',
    label: 'Demand Spike',
  },
  demand_drop: {
    icon: TrendingDown,
    color: 'text-red-700',
    bg: 'bg-red-100',
    label: 'Demand Drop',
  },
  unusual_order: {
    icon: AlertTriangle,
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    label: 'Unusual Order',
  },
  dead_stock: {
    icon: Archive,
    color: 'text-gray-700',
    bg: 'bg-gray-100',
    label: 'Dead Stock',
  },
  overstock: {
    icon: Package,
    color: 'text-purple-700',
    bg: 'bg-purple-100',
    label: 'Overstock',
  },
};

const severityConfig = {
  high: { bg: 'bg-red-500', text: 'text-white', label: 'High' },
  medium: { bg: 'bg-amber-500', text: 'text-white', label: 'Medium' },
  low: { bg: 'bg-blue-500', text: 'text-white', label: 'Low' },
};

export function AnomalyAlertsWidget({
  anomalies,
  title = 'Anomaly Detection',
  limit = 5,
  onViewAll,
  onDismiss,
}: AnomalyAlertsWidgetProps) {
  const displayAnomalies = anomalies.slice(0, limit);

  // Summary counts by severity
  const highCount = anomalies.filter((a) => a.severity === 'high').length;
  const mediumCount = anomalies.filter((a) => a.severity === 'medium').length;
  const lowCount = anomalies.filter((a) => a.severity === 'low').length;

  if (displayAnomalies.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <Eye className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-gray-500">No anomalies detected</p>
          <p className="text-sm text-gray-400">All patterns look normal</p>
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
        <div className="flex items-center gap-2">
          {highCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {highCount} high
            </span>
          )}
          {mediumCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              {mediumCount} medium
            </span>
          )}
          {lowCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              {lowCount} low
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {displayAnomalies.map((anomaly, index) => {
          const config = typeConfig[anomaly.type];
          const severity = severityConfig[anomaly.severity];
          const TypeIcon = config.icon;

          return (
            <div
              key={index}
              className="p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${config.bg}`}>
                  <TypeIcon className={`w-4 h-4 ${config.color}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      {anomaly.message}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-medium ${severity.bg} ${severity.text}`}
                    >
                      {severity.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{anomaly.details}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span className={`px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                    <span>
                      {formatDistanceToNow(new Date(anomaly.detectedAt), { addSuffix: true })}
                    </span>
                    {anomaly.value !== undefined && anomaly.expectedValue !== undefined && (
                      <span>
                        {anomaly.value} vs expected {Math.round(anomaly.expectedValue)}
                      </span>
                    )}
                  </div>
                </div>

                {onDismiss && (
                  <button
                    onClick={() => onDismiss(index)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >
                    <span className="sr-only">Dismiss</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {anomalies.length > limit && (
        <button
          onClick={onViewAll}
          className="block w-full mt-4 pt-4 border-t border-gray-100 text-center text-sm text-blue-600 hover:text-blue-700"
        >
          View all {anomalies.length} anomalies
        </button>
      )}

      {/* Type legend */}
      <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-100">
        {Object.entries(typeConfig).map(([key, config]) => {
          const TypeIcon = config.icon;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`p-1 rounded ${config.bg}`}>
                <TypeIcon className={`w-3 h-3 ${config.color}`} />
              </div>
              <span className="text-xs text-gray-500">{config.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AnomalyAlertsWidget;
