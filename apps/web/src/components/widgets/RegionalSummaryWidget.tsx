// =============================================================================
// REGIONAL SUMMARY WIDGET
// Shows state-level performance summary for locations
// =============================================================================

import { useRef, useState } from "react";
import {
  MapPin,
  TrendingUp,
  Package,
  Camera,
  FileSpreadsheet,
  Activity,
  ChevronDown,
  ChevronUp,
  Building2,
} from "lucide-react";
import html2canvas from "html2canvas";

interface StateSummary {
  state: string;
  locationCount: number;
  avgPerformanceScore: number;
  totalOrders: number;
  totalUnits: number;
  topLocation: {
    id: string;
    name: string;
    performanceScore: number;
  };
  performanceTier: "excellent" | "good" | "average" | "needs-attention";
}

interface RegionalPerformanceSummary {
  states: StateSummary[];
  totalLocations: number;
  avgClientPerformance: number;
}

interface RegionalSummaryWidgetProps {
  data: RegionalPerformanceSummary | null;
  title?: string;
  showExport?: boolean;
  onStateClick?: (state: string) => void;
}

export function RegionalSummaryWidget({
  data,
  title = "Regional Performance Summary",
  showExport = true,
  onStateClick,
}: RegionalSummaryWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  const displayStates = expanded
    ? data?.states || []
    : (data?.states || []).slice(0, 3);

  // Get performance tier styling
  const getTierConfig = (tier: string) => {
    switch (tier) {
      case "excellent":
        return {
          color: "text-green-700",
          bgColor: "bg-green-100",
          borderColor: "border-green-200",
          label: "Excellent",
        };
      case "good":
        return {
          color: "text-blue-700",
          bgColor: "bg-blue-100",
          borderColor: "border-blue-200",
          label: "Good",
        };
      case "average":
        return {
          color: "text-yellow-700",
          bgColor: "bg-yellow-100",
          borderColor: "border-yellow-200",
          label: "Average",
        };
      case "needs-attention":
        return {
          color: "text-red-700",
          bgColor: "bg-red-100",
          borderColor: "border-red-200",
          label: "Needs Attention",
        };
      default:
        return {
          color: "text-gray-700",
          bgColor: "bg-gray-100",
          borderColor: "border-gray-200",
          label: "Unknown",
        };
    }
  };

  // Export as PNG
  const exportToPNG = async () => {
    if (!widgetRef.current) return;
    try {
      const canvas = await html2canvas(widgetRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Error exporting widget:", error);
    }
  };

  // Export as CSV
  const exportToCSV = () => {
    if (!data) return;

    const csvContent = [
      "State,Location Count,Avg Performance Score,Total Orders,Total Units,Top Location,Top Location Score,Performance Tier",
      ...displayStates.map(
        (state) =>
          `"${state.state}",${state.locationCount},${state.avgPerformanceScore},${state.totalOrders},${state.totalUnits},"${state.topLocation.name}",${state.topLocation.performanceScore},"${getTierConfig(state.performanceTier).label}"`,
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!data || data.states.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-500">No regional data available</p>
          <p className="text-sm text-gray-400">
            Import order history to see regional performance
          </p>
        </div>
      </div>
    );
  }

  const topState = data.states[0];

  return (
    <div
      ref={widgetRef}
      className="bg-white rounded-lg border border-gray-200 p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {showExport && (
            <div className="flex gap-1">
              <button
                onClick={exportToPNG}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Export as PNG"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                onClick={exportToCSV}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Export as CSV"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>
            </div>
          )}
          <span className="text-sm text-gray-500">
            {data.states.length} state{data.states.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Total Locations</p>
          <p className="text-2xl font-bold text-gray-900">
            {data.totalLocations}
          </p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Avg Performance</p>
          <p className="text-2xl font-bold text-gray-900">
            {Math.round(data.avgClientPerformance)}
          </p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Top State</p>
          <p className="text-2xl font-bold text-gray-900">{topState.state}</p>
        </div>
      </div>

      {/* State Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {displayStates.map((state) => {
          const tierConfig = getTierConfig(state.performanceTier);
          return (
            <div
              key={state.state}
              onClick={() => onStateClick?.(state.state)}
              className={`p-4 rounded-lg border ${tierConfig.borderColor} ${tierConfig.bgColor} hover:shadow-md transition-all ${onStateClick ? "cursor-pointer" : ""}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-lg font-bold text-gray-900">
                    {state.state}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {state.locationCount} location
                    {state.locationCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Activity className={`w-4 h-4 ${tierConfig.color}`} />
                  <span className={`text-xl font-bold ${tierConfig.color}`}>
                    {Math.round(state.avgPerformanceScore)}
                  </span>
                </div>
              </div>

              <div
                className={`inline-block px-2 py-1 rounded-full text-xs font-medium mb-3 ${tierConfig.bgColor} ${tierConfig.color}`}
              >
                {tierConfig.label}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-gray-600">
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3" />
                    Orders
                  </span>
                  <span className="font-medium">
                    {state.totalOrders.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Units
                  </span>
                  <span className="font-medium">
                    {state.totalUnits.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Top Location</p>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {state.topLocation.name}
                </p>
                <p className="text-xs text-gray-500">
                  Score: {state.topLocation.performanceScore}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand/Collapse Button */}
      {data.states.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-center gap-1 w-full mt-4 pt-4 border-t border-gray-100 text-sm text-blue-600 hover:text-blue-700"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show top 3 states
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show all {data.states.length} states
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default RegionalSummaryWidget;
