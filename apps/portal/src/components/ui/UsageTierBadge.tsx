import clsx from 'clsx';
import { Info } from 'lucide-react';

type UsageCalculationTier = '12_month' | '6_month' | '3_month' | 'weekly' | null | undefined;
type UsageConfidence = 'high' | 'medium' | 'low' | null | undefined;

interface UsageTierBadgeProps {
  tier: UsageCalculationTier;
  confidence: UsageConfidence;
  monthlyUsage?: number | null;
  showValue?: boolean;
  compact?: boolean;
  showDetailsButton?: boolean;
  onShowDetails?: () => void;
}

/**
 * Get display info for a usage calculation tier
 * Enhanced with detailed formula explanations
 */
function getTierDisplay(tier: UsageCalculationTier): {
  label: string;
  shortLabel: string;
  color: 'green' | 'blue' | 'amber' | 'gray';
  tooltip: string;
  formula: string;
} {
  switch (tier) {
    case '12_month':
      return {
        label: '12-mo avg',
        shortLabel: '12-mo',
        color: 'green',
        tooltip: 'High Confidence: Weighted average of last 12 months',
        formula: 'Recent 3 months weighted 1.5x for trend sensitivity',
      };
    case '6_month':
      return {
        label: '6-mo avg',
        shortLabel: '6-mo',
        color: 'blue',
        tooltip: 'Medium Confidence: Simple average of last 6 months',
        formula: 'Sum of 6 months / 6',
      };
    case '3_month':
      return {
        label: '3-mo avg',
        shortLabel: '3-mo',
        color: 'amber',
        tooltip: 'Medium Confidence: Simple average of last 3 months',
        formula: 'Sum of 3 months / 3',
      };
    case 'weekly':
      return {
        label: '< 3 mo',
        shortLabel: '< 3 mo',
        color: 'gray',
        tooltip: 'Low Confidence: Extrapolated from limited weekly data',
        formula: 'Weekly rate x 4.33 (avg weeks/month)',
      };
    default:
      return {
        label: 'No data',
        shortLabel: 'N/A',
        color: 'gray',
        tooltip: 'No transaction data available',
        formula: 'No calculation possible',
      };
  }
}

const colorClasses = {
  green: 'bg-green-100 text-green-800 ring-green-500/20',
  blue: 'bg-blue-100 text-blue-800 ring-blue-500/20',
  amber: 'bg-amber-100 text-amber-800 ring-amber-500/20',
  gray: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

const detailsButtonColors = {
  green: 'text-green-600 hover:bg-green-100',
  blue: 'text-blue-600 hover:bg-blue-100',
  amber: 'text-amber-600 hover:bg-amber-100',
  gray: 'text-gray-500 hover:bg-gray-100',
};

export function UsageTierBadge({
  tier,
  confidence: _confidence,
  monthlyUsage,
  showValue = true,
  compact = false,
  showDetailsButton = false,
  onShowDetails,
}: UsageTierBadgeProps) {
  const display = getTierDisplay(tier);

  return (
    <div className="flex items-center gap-2 group relative">
      <span
        className={clsx(
          'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset cursor-help',
          colorClasses[display.color]
        )}
        title={`${display.tooltip}\n\nFormula: ${display.formula}`}
      >
        {compact ? display.shortLabel : display.label}
        <span className="sr-only">{display.tooltip}</span>
      </span>

      {showValue && monthlyUsage !== null && monthlyUsage !== undefined && (
        <span className="text-sm text-gray-600">
          {monthlyUsage.toFixed(1)}/mo
        </span>
      )}

      {showDetailsButton && onShowDetails && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShowDetails();
          }}
          className={clsx(
            'p-1 rounded-md transition-colors',
            detailsButtonColors[display.color]
          )}
          aria-label="View calculation details"
          title="View detailed calculation breakdown"
        >
          <Info className="w-4 h-4" />
        </button>
      )}

      {/* Enhanced Hover Tooltip */}
      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 pointer-events-none">
        <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs">
          <div className="font-medium mb-1">{display.tooltip}</div>
          <div className="text-gray-300 text-[11px]">
            <span className="text-gray-400">Formula:</span> {display.formula}
          </div>
          {showDetailsButton && (
            <div className="text-blue-300 text-[11px] mt-1">
              Click info icon for full breakdown
            </div>
          )}
          {/* Arrow */}
          <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
        </div>
      </div>
    </div>
  );
}

/**
 * Simplified badge for use in tables or compact spaces
 */
export function UsageTierBadgeCompact({
  tier,
  confidence,
}: {
  tier: UsageCalculationTier;
  confidence: UsageConfidence;
}) {
  return <UsageTierBadge tier={tier} confidence={confidence} showValue={false} compact={true} />;
}

/**
 * Badge with details button for interactive views
 */
export function UsageTierBadgeWithDetails({
  tier,
  confidence,
  monthlyUsage,
  onShowDetails,
}: {
  tier: UsageCalculationTier;
  confidence: UsageConfidence;
  monthlyUsage?: number | null;
  onShowDetails: () => void;
}) {
  return (
    <UsageTierBadge
      tier={tier}
      confidence={confidence}
      monthlyUsage={monthlyUsage}
      showDetailsButton={true}
      onShowDetails={onShowDetails}
    />
  );
}

export default UsageTierBadge;
