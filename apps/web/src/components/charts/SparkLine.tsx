import { useMemo } from 'react';

interface SparkLineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  showArea?: boolean;
  showDots?: boolean;
  trend?: 'up' | 'down' | 'stable';
}

export function SparkLine({
  data,
  width = 100,
  height = 30,
  color = '#3B82F6',
  fillColor,
  showArea = true,
  showDots = false,
}: SparkLineProps) {
  const pathData = useMemo(() => {
    if (data.length < 2) return { line: '', area: '' };

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const padding = 2;

    const effectiveWidth = width - padding * 2;
    const effectiveHeight = height - padding * 2;
    const stepX = effectiveWidth / (data.length - 1);

    const points = data.map((value, index) => ({
      x: padding + index * stepX,
      y: padding + effectiveHeight - ((value - min) / range) * effectiveHeight,
    }));

    // Create smooth curve using quadratic bezier
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      linePath += ` Q ${prev.x} ${prev.y}, ${midX} ${(prev.y + curr.y) / 2}`;
    }
    linePath += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;

    // Create area path
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return { line: linePath, area: areaPath, points };
  }, [data, width, height]);

  // Determine trend color if not specified
  const actualColor = useMemo(() => {
    if (color !== '#3B82F6') return color;
    if (data.length < 2) return color;

    const first = data[0];
    const last = data[data.length - 1];
    if (last > first * 1.1) return '#10B981'; // Green for up
    if (last < first * 0.9) return '#DC2626'; // Red for down
    return '#3B82F6'; // Blue for stable
  }, [data, color]);

  const actualFillColor = fillColor || `${actualColor}20`;

  if (data.length < 2) {
    return (
      <svg width={width} height={height}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#E5E7EB"
          strokeWidth={2}
          strokeDasharray="4 2"
        />
      </svg>
    );
  }

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Area fill */}
      {showArea && (
        <path
          d={pathData.area}
          fill={actualFillColor}
          className="transition-all duration-300"
        />
      )}

      {/* Line */}
      <path
        d={pathData.line}
        fill="none"
        stroke={actualColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-300"
      />

      {/* Dots */}
      {showDots && pathData.points && (
        <>
          {pathData.points.map((point, i) => (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r={3}
              fill="white"
              stroke={actualColor}
              strokeWidth={2}
            />
          ))}
        </>
      )}
    </svg>
  );
}

export default SparkLine;
