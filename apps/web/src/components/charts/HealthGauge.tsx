import { useMemo } from 'react';

interface HealthGaugeProps {
  value: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  animated?: boolean;
}

const sizeConfig = {
  sm: { width: 80, strokeWidth: 6, fontSize: 'text-sm' },
  md: { width: 120, strokeWidth: 8, fontSize: 'text-lg' },
  lg: { width: 160, strokeWidth: 10, fontSize: 'text-2xl' },
};

export function HealthGauge({
  value,
  size = 'md',
  showLabel = true,
  label = 'Health',
  animated = true,
}: HealthGaugeProps) {
  const config = sizeConfig[size];
  const radius = (config.width - config.strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  // Calculate the stroke offset for the progress
  const normalizedValue = Math.min(100, Math.max(0, value));
  const offset = circumference - (normalizedValue / 100) * circumference;

  // Determine color based on value
  const color = useMemo(() => {
    if (normalizedValue >= 80) return '#10B981'; // healthy green
    if (normalizedValue >= 60) return '#3B82F6'; // watch blue
    if (normalizedValue >= 40) return '#F59E0B'; // warning amber
    if (normalizedValue >= 20) return '#DC2626'; // critical red
    return '#991B1B'; // stockout dark red
  }, [normalizedValue]);

  const status = useMemo(() => {
    if (normalizedValue >= 80) return 'Healthy';
    if (normalizedValue >= 60) return 'Watch';
    if (normalizedValue >= 40) return 'Low';
    if (normalizedValue >= 20) return 'Critical';
    return 'Stockout';
  }, [normalizedValue]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: config.width, height: config.width }}>
        <svg
          className="transform -rotate-90"
          width={config.width}
          height={config.width}
        >
          {/* Background circle */}
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={config.strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={config.strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={animated ? 'transition-all duration-700 ease-out' : ''}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold ${config.fontSize}`} style={{ color }}>
            {Math.round(normalizedValue)}%
          </span>
          {showLabel && (
            <span className="text-xs text-gray-500">{status}</span>
          )}
        </div>
      </div>

      {label && (
        <span className="mt-2 text-sm text-gray-600">{label}</span>
      )}
    </div>
  );
}

export default HealthGauge;
