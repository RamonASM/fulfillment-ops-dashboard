import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import {
  Info,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Calculator,
  HelpCircle,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface CalculationInput {
  label: string;
  value: string | number;
  source?: string;
  unit?: string;
}

export interface CalculationBreakdown {
  metricName: string;
  value: string | number;
  unit?: string;
  formula?: string;
  formulaExpanded?: string;
  inputs?: CalculationInput[];
  confidence: ConfidenceLevel;
  confidenceReason?: string;
  warnings?: string[];
  lastCalculated?: Date | string;
  helpText?: string;
}

interface CalculationTooltipProps {
  calculation: CalculationBreakdown;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children?: React.ReactNode;
}

// =============================================================================
// CONFIDENCE BADGE
// =============================================================================

function ConfidenceBadge({ level, compact = false }: { level: ConfidenceLevel; compact?: boolean }) {
  const configs = {
    HIGH: { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle, label: 'High confidence' },
    MEDIUM: { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertCircle, label: 'Medium confidence' },
    LOW: { color: 'bg-red-100 text-red-800 border-red-200', icon: AlertCircle, label: 'Low confidence' },
    NONE: { color: 'bg-gray-100 text-gray-800 border-gray-200', icon: HelpCircle, label: 'No data' },
  };

  const config = configs[level];
  const Icon = config.icon;

  if (compact) {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border', config.color)}>
        <Icon className="w-3 h-3" />
      </span>
    );
  }

  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border', config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// =============================================================================
// TOOLTIP CONTENT
// =============================================================================

function TooltipContent({ calculation, isExpanded, onToggle }: {
  calculation: CalculationBreakdown;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { metricName, value, unit, formula, formulaExpanded, inputs, confidence, confidenceReason, warnings, lastCalculated, helpText } = calculation;

  return (
    <div className="w-72 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
      {/* Header - Always Visible */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{metricName}</p>
            <p className="text-lg font-bold text-gray-900">
              {typeof value === 'number' ? value.toLocaleString() : value}
              {unit && <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>}
            </p>
          </div>
          <ConfidenceBadge level={confidence} compact />
        </div>

        {/* Simple explanation */}
        {helpText && !isExpanded && (
          <p className="text-xs text-gray-600 mt-2">{helpText}</p>
        )}
      </div>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-center gap-1 py-2 text-xs text-primary-600 hover:bg-primary-50 transition-colors"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="w-3 h-3" />
            Hide details
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" />
            Show details
          </>
        )}
      </button>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 pt-0 space-y-3 border-t border-gray-100 bg-gray-50">
              {/* Formula */}
              {formula && (
                <div>
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
                    <Calculator className="w-3 h-3" />
                    Formula
                  </div>
                  <div className="p-2 bg-white rounded border border-gray-200 font-mono text-xs text-gray-700">
                    {formula}
                  </div>
                  {formulaExpanded && (
                    <div className="p-2 mt-1 bg-white rounded border border-gray-200 font-mono text-xs text-gray-500">
                      = {formulaExpanded}
                    </div>
                  )}
                </div>
              )}

              {/* Inputs */}
              {inputs && inputs.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
                    <Info className="w-3 h-3" />
                    Inputs
                  </div>
                  <div className="space-y-1">
                    {inputs.map((input, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 bg-white rounded border border-gray-200">
                        <span className="text-gray-600">{input.label}</span>
                        <div className="text-right">
                          <span className="font-medium text-gray-900">
                            {typeof input.value === 'number' ? input.value.toLocaleString() : input.value}
                            {input.unit && <span className="text-gray-500 ml-0.5">{input.unit}</span>}
                          </span>
                          {input.source && (
                            <p className="text-[10px] text-gray-400">{input.source}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Confidence Explanation */}
              {confidenceReason && (
                <div className="flex items-start gap-2 text-xs">
                  <ConfidenceBadge level={confidence} />
                  <span className="text-gray-600">{confidenceReason}</span>
                </div>
              )}

              {/* Warnings */}
              {warnings && warnings.length > 0 && (
                <div className="space-y-1">
                  {warnings.map((warning, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs p-2 bg-amber-50 rounded border border-amber-200">
                      <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                      <span className="text-amber-800">{warning}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Last Calculated */}
              {lastCalculated && (
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  Last calculated: {new Date(lastCalculated).toLocaleString()}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CalculationTooltip({ calculation, className, position = 'bottom', children }: CalculationTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setIsExpanded(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  return (
    <div className={clsx('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors"
        type="button"
      >
        {children || (
          <Info className="w-4 h-4" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={clsx('absolute z-50', positionClasses[position])}
          >
            <TooltipContent
              calculation={calculation}
              isExpanded={isExpanded}
              onToggle={() => setIsExpanded(!isExpanded)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// INLINE VARIANT (for use in tables/lists)
// =============================================================================

export function CalculationValue({
  value,
  unit,
  calculation,
  className,
}: {
  value: string | number;
  unit?: string;
  calculation: CalculationBreakdown;
  className?: string;
}) {
  return (
    <span className={clsx('inline-flex items-center gap-1', className)}>
      <span className="font-medium">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="text-gray-500 text-sm ml-0.5">{unit}</span>}
      </span>
      <CalculationTooltip calculation={calculation}>
        <Info className="w-3.5 h-3.5 text-gray-400 hover:text-primary-500 cursor-help" />
      </CalculationTooltip>
    </span>
  );
}

// =============================================================================
// PRESET CALCULATIONS
// =============================================================================

export function createWeeksRemainingCalculation(
  weeksRemaining: number,
  currentStock: number,
  weeklyUsage: number,
  confidence: ConfidenceLevel,
  dataMonths: number
): CalculationBreakdown {
  return {
    metricName: 'Weeks Remaining',
    value: weeksRemaining,
    unit: 'weeks',
    helpText: 'How long your current stock will last based on average usage',
    formula: 'Current Stock / Weekly Usage',
    formulaExpanded: `${currentStock.toLocaleString()} / ${weeklyUsage.toFixed(1)} = ${weeksRemaining.toFixed(1)}`,
    inputs: [
      { label: 'Current Stock', value: currentStock, unit: 'units', source: 'from last import' },
      { label: 'Weekly Usage', value: weeklyUsage.toFixed(1), unit: 'units/week', source: `${dataMonths} months of data` },
    ],
    confidence,
    confidenceReason: confidence === 'HIGH'
      ? 'Based on 12+ months of transaction data'
      : confidence === 'MEDIUM'
        ? 'Based on 3-11 months of transaction data'
        : 'Based on limited transaction data (<3 months)',
  };
}

export function createReorderPointCalculation(
  reorderPoint: number,
  weeklyUsage: number,
  leadTimeWeeks: number,
  safetyBuffer: number,
  confidence: ConfidenceLevel
): CalculationBreakdown {
  return {
    metricName: 'Reorder Point',
    value: reorderPoint,
    unit: 'units',
    helpText: 'The stock level at which you should place a new order to avoid running out',
    formula: '(Weekly Usage × Lead Time) + Safety Buffer',
    formulaExpanded: `(${weeklyUsage.toFixed(1)} × ${leadTimeWeeks}) + ${safetyBuffer} = ${reorderPoint}`,
    inputs: [
      { label: 'Weekly Usage', value: weeklyUsage.toFixed(1), unit: 'units/week', source: 'calculated average' },
      { label: 'Lead Time', value: leadTimeWeeks, unit: 'weeks', source: 'default setting' },
      { label: 'Safety Buffer', value: safetyBuffer, unit: 'units', source: 'default 20% buffer' },
    ],
    confidence,
    confidenceReason: 'Based on historical usage patterns and configured lead times',
  };
}

export function createMonthlyUsageCalculation(
  monthlyUsage: number,
  totalUsed: number,
  monthsAnalyzed: number,
  confidence: ConfidenceLevel
): CalculationBreakdown {
  return {
    metricName: 'Monthly Usage',
    value: Math.round(monthlyUsage),
    unit: 'units/month',
    helpText: 'Average number of units consumed per month based on order history',
    formula: 'Total Units Used / Months Analyzed',
    formulaExpanded: `${totalUsed.toLocaleString()} / ${monthsAnalyzed} = ${Math.round(monthlyUsage)}`,
    inputs: [
      { label: 'Total Units Used', value: totalUsed, unit: 'units', source: `last ${monthsAnalyzed} months` },
      { label: 'Months Analyzed', value: monthsAnalyzed, unit: 'months', source: 'transaction data' },
    ],
    confidence,
    confidenceReason: monthsAnalyzed >= 12
      ? 'Full year of data provides reliable average'
      : monthsAnalyzed >= 6
        ? '6+ months of data provides moderate accuracy'
        : 'Limited data may not reflect typical usage',
    warnings: monthsAnalyzed < 3 ? ['Usage calculation based on limited data'] : undefined,
  };
}

export default CalculationTooltip;
