import clsx from 'clsx';

type UsageCalculationTier = '12_month' | '6_month' | '3_month' | 'weekly' | null | undefined;
type UsageConfidence = 'high' | 'medium' | 'low' | null | undefined;

interface UsageTierBadgeProps {
  tier: UsageCalculationTier;
  confidence: UsageConfidence;
  monthlyUsage?: number | null;
  showValue?: boolean;
  compact?: boolean;
}

/**
 * Get display info for a usage calculation tier
 */
function getTierDisplay(tier: UsageCalculationTier): {
  label: string;
  shortLabel: string;
  color: 'green' | 'blue' | 'amber' | 'gray';
  tooltip: string;
} {
  switch (tier) {
    case '12_month':
      return {
        label: '12-mo avg',
        shortLabel: '12-mo',
        color: 'green',
        tooltip: 'Calculated from 12+ months of transaction data (high confidence)',
      };
    case '6_month':
      return {
        label: '6-mo avg',
        shortLabel: '6-mo',
        color: 'blue',
        tooltip: 'Calculated from 6-11 months of transaction data (medium confidence)',
      };
    case '3_month':
      return {
        label: '3-mo avg',
        shortLabel: '3-mo',
        color: 'amber',
        tooltip: 'Calculated from 3-5 months of transaction data (medium confidence)',
      };
    case 'weekly':
      return {
        label: '< 3 mo',
        shortLabel: '< 3 mo',
        color: 'gray',
        tooltip: 'Limited data: calculated from less than 3 months of transactions (low confidence)',
      };
    default:
      return {
        label: 'No data',
        shortLabel: 'N/A',
        color: 'gray',
        tooltip: 'No transaction data available to calculate usage',
      };
  }
}

const colorClasses = {
  green: 'bg-green-100 text-green-800 ring-green-500/20',
  blue: 'bg-blue-100 text-blue-800 ring-blue-500/20',
  amber: 'bg-amber-100 text-amber-800 ring-amber-500/20',
  gray: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

export function UsageTierBadge({
  tier,
  confidence: _confidence,
  monthlyUsage,
  showValue = true,
  compact = false,
}: UsageTierBadgeProps) {
  const display = getTierDisplay(tier);

  return (
    <div className="flex items-center gap-2">
      <span
        className={clsx(
          'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
          colorClasses[display.color]
        )}
        title={display.tooltip}
      >
        {compact ? display.shortLabel : display.label}
        <span className="sr-only">{display.tooltip}</span>
      </span>

      {showValue && monthlyUsage !== null && monthlyUsage !== undefined && (
        <span className="text-sm text-gray-600">
          {monthlyUsage.toFixed(1)}/mo
        </span>
      )}
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

export default UsageTierBadge;
