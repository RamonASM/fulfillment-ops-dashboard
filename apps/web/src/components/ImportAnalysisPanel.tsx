import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Package,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  CheckCircle,
  Info,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface StatusTransition {
  productId: string;
  productName: string;
  oldStatus: string;
  newStatus: string;
  oldStockUnits: number;
  newStockUnits: number;
  notificationPoint: number | null;
}

interface DataAnomaly {
  row: number;
  productId: string;
  field: string;
  value: number | string;
  anomalyType: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
}

interface AlertImpact {
  newAlerts: number;
  resolvedAlerts: number;
  unchangedAlerts: number;
  alertsByType: Record<string, { new: number; resolved: number }>;
  productsNeedingReorder: Array<{
    productId: string;
    productName: string;
    currentStock: number;
    notificationPoint: number;
    projectedWeeksRemaining: number;
  }>;
}

interface ProductChange {
  productId: string;
  productName: string;
  field: string;
  oldValue: number | string | null;
  newValue: number | string | null;
  percentChange?: number;
  changeType: 'increase' | 'decrease' | 'new' | 'unchanged' | 'modified';
}

export interface ImportAnalysis {
  importId: string;
  analyzedAt: Date;
  summary: {
    totalProducts: number;
    newProducts: number;
    updatedProducts: number;
    unchangedProducts: number;
    productsWithSignificantChanges: number;
  };
  stockChanges: ProductChange[];
  statusTransitions: StatusTransition[];
  anomalies: DataAnomaly[];
  alertImpact: AlertImpact;
  recommendations: string[];
}

interface ImportAnalysisPanelProps {
  analysis: ImportAnalysis | null;
  isLoading?: boolean;
  onAnalyze?: () => void;
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    HEALTHY: 'bg-green-100 text-green-800',
    WATCH: 'bg-blue-100 text-blue-800',
    LOW: 'bg-amber-100 text-amber-800',
    CRITICAL: 'bg-red-100 text-red-800',
    OUT_OF_STOCK: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', colors[status] || 'bg-gray-100 text-gray-800')}>
      {status.replace('_', ' ')}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const colors = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-blue-100 text-blue-800',
  };

  return (
    <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', colors[severity])}>
      {severity.toUpperCase()}
    </span>
  );
}

// =============================================================================
// COLLAPSIBLE SECTION
// =============================================================================

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
  variant = 'default',
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  variant?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const variants = {
    default: 'bg-gray-50 border-gray-200',
    warning: 'bg-amber-50 border-amber-200',
    danger: 'bg-red-50 border-red-200',
    success: 'bg-green-50 border-green-200',
  };

  return (
    <div className={clsx('border rounded-lg overflow-hidden', variants[variant])}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-black/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="font-medium text-sm">{title}</span>
          {count !== undefined && (
            <span className="px-2 py-0.5 bg-white/50 rounded text-xs font-medium">{count}</span>
          )}
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 pt-0 border-t border-inherit">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ImportAnalysisPanel({ analysis, isLoading, onAnalyze }: ImportAnalysisPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 bg-gray-200 rounded-lg" />
        <div className="h-32 bg-gray-200 rounded-lg" />
        <div className="h-24 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  if (!analysis && onAnalyze) {
    return (
      <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
        <Info className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-600 mb-3">
          Analyze the import to see what will change before confirming.
        </p>
        <button onClick={onAnalyze} className="btn-secondary text-sm">
          Analyze Import Impact
        </button>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const { summary, stockChanges, statusTransitions, anomalies, alertImpact, recommendations } = analysis;

  const hasIssues = anomalies.some(a => a.severity === 'high') || statusTransitions.some(t => t.newStatus === 'CRITICAL' || t.newStatus === 'OUT_OF_STOCK');

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 bg-blue-50 rounded-lg text-center">
          <p className="text-xl font-bold text-blue-700">{summary.totalProducts}</p>
          <p className="text-xs text-blue-600">Total Products</p>
        </div>
        <div className="p-3 bg-green-50 rounded-lg text-center">
          <p className="text-xl font-bold text-green-700">{summary.newProducts}</p>
          <p className="text-xs text-green-600">New</p>
        </div>
        <div className="p-3 bg-amber-50 rounded-lg text-center">
          <p className="text-xl font-bold text-amber-700">{summary.updatedProducts}</p>
          <p className="text-xs text-amber-600">Updated</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xl font-bold text-gray-700">{summary.unchangedProducts}</p>
          <p className="text-xs text-gray-600">Unchanged</p>
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className={clsx(
          'p-4 rounded-lg border',
          hasIssues ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
        )}>
          <div className="flex items-start gap-2">
            {hasIssues ? (
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className={clsx(
                'font-medium text-sm',
                hasIssues ? 'text-red-800' : 'text-green-800'
              )}>
                {hasIssues ? 'Review Required' : 'Ready to Import'}
              </h4>
              <ul className="mt-1 space-y-1">
                {recommendations.map((rec, i) => (
                  <li key={i} className={clsx(
                    'text-xs',
                    hasIssues ? 'text-red-700' : 'text-green-700'
                  )}>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Status Transitions */}
      {statusTransitions.length > 0 && (
        <CollapsibleSection
          title="Status Changes"
          count={statusTransitions.length}
          defaultOpen={statusTransitions.some(t => ['CRITICAL', 'OUT_OF_STOCK'].includes(t.newStatus))}
          variant={statusTransitions.some(t => ['CRITICAL', 'OUT_OF_STOCK'].includes(t.newStatus)) ? 'danger' : 'warning'}
        >
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {statusTransitions.map((transition, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-200 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{transition.productName}</p>
                  <p className="text-gray-500">
                    {transition.oldStockUnits.toLocaleString()} → {transition.newStockUnits.toLocaleString()} units
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={transition.oldStatus} />
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                  <StatusBadge status={transition.newStatus} />
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <CollapsibleSection
          title="Data Issues"
          count={anomalies.length}
          defaultOpen={anomalies.some(a => a.severity === 'high')}
          variant={anomalies.some(a => a.severity === 'high') ? 'danger' : 'warning'}
        >
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {anomalies.map((anomaly, i) => (
              <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-200 last:border-0">
                <SeverityBadge severity={anomaly.severity} />
                <div className="flex-1">
                  <p className="text-gray-900">{anomaly.message}</p>
                  <p className="text-gray-500">Row {anomaly.row} • {anomaly.productId}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Alert Impact */}
      {(alertImpact.newAlerts > 0 || alertImpact.resolvedAlerts > 0) && (
        <CollapsibleSection
          title="Alert Impact"
          defaultOpen={false}
          variant="default"
        >
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center p-2 bg-white rounded border">
              <p className="text-lg font-bold text-red-600">+{alertImpact.newAlerts}</p>
              <p className="text-xs text-gray-500">New Alerts</p>
            </div>
            <div className="text-center p-2 bg-white rounded border">
              <p className="text-lg font-bold text-green-600">-{alertImpact.resolvedAlerts}</p>
              <p className="text-xs text-gray-500">Resolved</p>
            </div>
            <div className="text-center p-2 bg-white rounded border">
              <p className="text-lg font-bold text-gray-600">{alertImpact.unchangedAlerts}</p>
              <p className="text-xs text-gray-500">Unchanged</p>
            </div>
          </div>

          {/* Products Needing Reorder */}
          {alertImpact.productsNeedingReorder.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-gray-700 mb-2">Products Needing Immediate Reorder:</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {alertImpact.productsNeedingReorder.map((product, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 px-2 bg-red-50 rounded">
                    <span className="font-medium text-gray-900">{product.productName}</span>
                    <span className={clsx(
                      'font-medium',
                      product.projectedWeeksRemaining <= 2 ? 'text-red-600' : 'text-amber-600'
                    )}>
                      {product.projectedWeeksRemaining} weeks
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Significant Stock Changes */}
      {stockChanges.filter(c => c.percentChange && Math.abs(c.percentChange) >= 50).length > 0 && (
        <CollapsibleSection
          title="Significant Changes (>50%)"
          count={stockChanges.filter(c => c.percentChange && Math.abs(c.percentChange) >= 50).length}
          defaultOpen={false}
          variant="default"
        >
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {stockChanges
              .filter(c => c.percentChange && Math.abs(c.percentChange) >= 50)
              .slice(0, 20)
              .map((change, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-200 last:border-0">
                  <div className="flex items-center gap-2">
                    {change.changeType === 'increase' ? (
                      <TrendingUp className="w-3 h-3 text-green-600" />
                    ) : change.changeType === 'decrease' ? (
                      <TrendingDown className="w-3 h-3 text-red-600" />
                    ) : (
                      <Package className="w-3 h-3 text-blue-600" />
                    )}
                    <span className="font-medium text-gray-900">{change.productName}</span>
                  </div>
                  <div className="text-right">
                    <span className={clsx(
                      'font-medium',
                      change.percentChange && change.percentChange > 0 ? 'text-green-600' : 'text-red-600'
                    )}>
                      {change.percentChange && change.percentChange > 0 ? '+' : ''}{Math.round(change.percentChange || 0)}%
                    </span>
                    <span className="text-gray-400 ml-2">
                      {change.oldValue} → {change.newValue}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

export default ImportAnalysisPanel;
