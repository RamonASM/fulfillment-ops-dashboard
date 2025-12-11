// =============================================================================
// KPI CARD WIDGET (Phase 11)
// KPI metric card with sparkline trend
// =============================================================================

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: number;
  unit?: string;
  trend: {
    direction: 'up' | 'down' | 'stable';
    percent: number;
    period: string;
  };
  sparkline: number[];
  color?: 'blue' | 'green' | 'amber' | 'red';
  onClick?: () => void;
}

const colorMap = {
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    sparkline: '#3B82F6',
    trendUp: 'text-green-600',
    trendDown: 'text-red-600',
  },
  green: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    sparkline: '#10B981',
    trendUp: 'text-green-600',
    trendDown: 'text-red-600',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    sparkline: '#F59E0B',
    trendUp: 'text-green-600',
    trendDown: 'text-red-600',
  },
  red: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    sparkline: '#EF4444',
    trendUp: 'text-red-600',
    trendDown: 'text-green-600',
  },
};

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const height = 24;
  const width = 60;
  const padding = 2;

  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function KPICard({
  label,
  value,
  unit,
  trend,
  sparkline,
  color = 'blue',
  onClick,
}: KPICardProps) {
  const colors = colorMap[color];

  const TrendIcon = trend.direction === 'up'
    ? TrendingUp
    : trend.direction === 'down'
      ? TrendingDown
      : Minus;

  const trendColor = trend.direction === 'up'
    ? colors.trendUp
    : trend.direction === 'down'
      ? colors.trendDown
      : 'text-gray-500';

  return (
    <div
      className={`${colors.bg} rounded-lg p-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={`text-2xl font-bold ${colors.text}`}>
              {value.toLocaleString()}
            </span>
            {unit && (
              <span className="text-sm text-gray-500">{unit}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <MiniSparkline data={sparkline} color={colors.sparkline} />
          <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            <span>{trend.percent.toFixed(1)}%</span>
            <span className="text-gray-400">{trend.period}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Grid of KPI cards
interface KPIGridProps {
  cards: KPICardProps[];
}

export function KPIGrid({ cards }: KPIGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <KPICard key={index} {...card} />
      ))}
    </div>
  );
}

export default KPICard;
