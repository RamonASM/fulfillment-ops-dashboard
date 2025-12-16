// =============================================================================
// TIME RANGE SELECTOR COMPONENT
// Allows users to select predefined or custom date ranges for filtering data
// =============================================================================

import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";

export type TimeRangePreset =
  | "7d"
  | "30d"
  | "90d"
  | "6m"
  | "1y"
  | "ytd"
  | "all"
  | "custom";

export interface TimeRange {
  preset: TimeRangePreset;
  startDate: Date;
  endDate: Date;
  label: string;
}

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  showCustom?: boolean;
  presets?: TimeRangePreset[];
  className?: string;
}

const PRESET_LABELS: Record<TimeRangePreset, string> = {
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "90d": "Last 90 Days",
  "6m": "Last 6 Months",
  "1y": "Last Year",
  ytd: "Year to Date",
  all: "All Time",
  custom: "Custom Range",
};

function calculateDateRange(preset: TimeRangePreset): {
  startDate: Date;
  endDate: Date;
} {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);

  let startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  switch (preset) {
    case "7d":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "30d":
      startDate.setDate(startDate.getDate() - 30);
      break;
    case "90d":
      startDate.setDate(startDate.getDate() - 90);
      break;
    case "6m":
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case "1y":
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case "ytd":
      startDate = new Date(startDate.getFullYear(), 0, 1);
      break;
    case "all":
      startDate = new Date(2020, 0, 1); // Reasonable default for "all time"
      break;
    default:
      startDate.setDate(startDate.getDate() - 30);
  }

  return { startDate, endDate };
}

export function getDefaultTimeRange(
  preset: TimeRangePreset = "30d",
): TimeRange {
  const { startDate, endDate } = calculateDateRange(preset);
  return {
    preset,
    startDate,
    endDate,
    label: PRESET_LABELS[preset],
  };
}

export function TimeRangeSelector({
  value,
  onChange,
  showCustom = true,
  presets = ["7d", "30d", "90d", "6m", "1y", "ytd", "all"],
  className = "",
}: TimeRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowCustomPicker(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePresetSelect = (preset: TimeRangePreset) => {
    if (preset === "custom") {
      setShowCustomPicker(true);
      // Initialize custom inputs with current range
      setCustomStart(value.startDate.toISOString().split("T")[0]);
      setCustomEnd(value.endDate.toISOString().split("T")[0]);
    } else {
      const { startDate, endDate } = calculateDateRange(preset);
      onChange({
        preset,
        startDate,
        endDate,
        label: PRESET_LABELS[preset],
      });
      setIsOpen(false);
      setShowCustomPicker(false);
    }
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      const startDate = new Date(customStart);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(customEnd);
      endDate.setHours(23, 59, 59, 999);

      if (startDate <= endDate) {
        onChange({
          preset: "custom",
          startDate,
          endDate,
          label: `${formatDate(startDate)} - ${formatDate(endDate)}`,
        });
        setIsOpen(false);
        setShowCustomPicker(false);
      }
    }
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const displayLabel =
    value.preset === "custom" ? value.label : PRESET_LABELS[value.preset];

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        <Calendar className="w-4 h-4 text-gray-400" />
        <span>{displayLabel}</span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px]">
          {!showCustomPicker ? (
            <div className="py-1">
              {presets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handlePresetSelect(preset)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                    value.preset === preset
                      ? "bg-blue-50 text-blue-600 font-medium"
                      : "text-gray-700"
                  }`}
                >
                  {PRESET_LABELS[preset]}
                </button>
              ))}
              {showCustom && (
                <>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => handlePresetSelect("custom")}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                      value.preset === "custom"
                        ? "bg-blue-50 text-blue-600 font-medium"
                        : "text-gray-700"
                    }`}
                  >
                    <Calendar className="w-4 h-4 inline mr-2" />
                    {PRESET_LABELS.custom}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="p-4 min-w-[280px]">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-medium text-gray-900">
                  Custom Range
                </h4>
                <button
                  onClick={() => setShowCustomPicker(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setShowCustomPicker(false)}
                    className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCustomApply}
                    disabled={!customStart || !customEnd}
                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TimeRangeSelector;
