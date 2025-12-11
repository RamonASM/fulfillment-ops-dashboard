import { useMemo, useState } from 'react';

interface DonutSegment {
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  showLegend?: boolean;
  centerLabel?: string;
  centerValue?: string | number;
  animated?: boolean;
}

export function DonutChart({
  segments,
  size = 200,
  strokeWidth = 30,
  showLegend = true,
  centerLabel,
  centerValue,
  animated = true,
}: DonutChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = useMemo(
    () => segments.reduce((sum, seg) => sum + seg.value, 0),
    [segments]
  );

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  // Calculate segment offsets
  const segmentData = useMemo(() => {
    let currentOffset = 0;
    return segments.map((segment, index) => {
      const percentage = total > 0 ? segment.value / total : 0;
      const length = percentage * circumference;
      const offset = currentOffset;
      currentOffset += length;

      return {
        ...segment,
        percentage,
        length,
        offset,
        dashArray: `${length} ${circumference - length}`,
        dashOffset: -offset,
        index,
      };
    });
  }, [segments, total, circumference]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#F3F4F6"
            strokeWidth={strokeWidth}
          />

          {/* Segments */}
          {segmentData.map((seg) => (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={hoveredIndex === seg.index ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={seg.dashArray}
              strokeDashoffset={seg.dashOffset}
              className={`cursor-pointer ${animated ? 'transition-all duration-300' : ''}`}
              onMouseEnter={() => setHoveredIndex(seg.index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={seg.onClick}
              style={{
                opacity: hoveredIndex !== null && hoveredIndex !== seg.index ? 0.5 : 1,
              }}
            />
          ))}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue !== undefined && (
            <span className="text-3xl font-bold text-gray-900">{centerValue}</span>
          )}
          {centerLabel && (
            <span className="text-sm text-gray-500">{centerLabel}</span>
          )}
          {hoveredIndex !== null && (
            <div className="absolute text-center">
              <span className="text-2xl font-bold text-gray-900">
                {segmentData[hoveredIndex].value}
              </span>
              <span className="block text-xs text-gray-500">
                {segmentData[hoveredIndex].label}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap justify-center gap-4">
          {segmentData.map((seg) => (
            <button
              key={seg.label}
              className={`flex items-center gap-2 px-2 py-1 rounded transition-opacity ${
                hoveredIndex !== null && hoveredIndex !== seg.index ? 'opacity-50' : ''
              }`}
              onMouseEnter={() => setHoveredIndex(seg.index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={seg.onClick}
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-sm text-gray-600">{seg.label}</span>
              <span className="text-sm font-medium text-gray-900">
                ({Math.round(seg.percentage * 100)}%)
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default DonutChart;
