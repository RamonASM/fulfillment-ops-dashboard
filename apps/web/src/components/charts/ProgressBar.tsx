interface ProgressSegment {
  value: number;
  color: string;
  label?: string;
}

interface ProgressBarProps {
  segments: ProgressSegment[];
  total?: number;
  height?: number;
  showLabels?: boolean;
  animated?: boolean;
  className?: string;
}

export function ProgressBar({
  segments,
  total,
  height = 8,
  showLabels = false,
  animated = true,
  className = '',
}: ProgressBarProps) {
  const calculatedTotal = total || segments.reduce((sum, seg) => sum + seg.value, 0);

  return (
    <div className={className}>
      <div
        className="w-full bg-gray-100 rounded-full overflow-hidden flex"
        style={{ height }}
      >
        {segments.map((segment, index) => {
          const percentage = calculatedTotal > 0
            ? (segment.value / calculatedTotal) * 100
            : 0;

          if (percentage === 0) return null;

          return (
            <div
              key={index}
              className={`h-full ${animated ? 'transition-all duration-500' : ''}`}
              style={{
                width: `${percentage}%`,
                backgroundColor: segment.color,
              }}
              title={segment.label ? `${segment.label}: ${segment.value}` : String(segment.value)}
            />
          );
        })}
      </div>

      {showLabels && (
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          {segments.map((segment, index) => (
            <span key={index} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              {segment.label || segment.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Convenience component for status-based progress
interface StatusProgressBarProps {
  stockout?: number;
  critical?: number;
  low?: number;
  watch?: number;
  healthy?: number;
  height?: number;
  showLabels?: boolean;
  className?: string;
}

export function StatusProgressBar({
  stockout = 0,
  critical = 0,
  low = 0,
  watch = 0,
  healthy = 0,
  height = 8,
  showLabels = false,
  className = '',
}: StatusProgressBarProps) {
  const segments: ProgressSegment[] = [
    { value: stockout, color: '#991B1B', label: 'Stockout' },
    { value: critical, color: '#DC2626', label: 'Critical' },
    { value: low, color: '#F59E0B', label: 'Low' },
    { value: watch, color: '#3B82F6', label: 'Watch' },
    { value: healthy, color: '#10B981', label: 'Healthy' },
  ].filter((seg) => seg.value > 0);

  return (
    <ProgressBar
      segments={segments}
      height={height}
      showLabels={showLabels}
      className={className}
    />
  );
}

export default ProgressBar;
