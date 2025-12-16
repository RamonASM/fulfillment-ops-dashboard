// =============================================================================
// LOCATION ANALYTICS WIDGET
// Shows analytics by shipping location
// =============================================================================

import { useRef } from "react";
import {
  MapPin,
  Building,
  TrendingUp,
  Package,
  Camera,
  FileSpreadsheet,
} from "lucide-react";
import { format } from "date-fns";
import html2canvas from "html2canvas";

interface TopProduct {
  productId: string;
  name: string;
  units: number;
}

interface LocationData {
  locationId: string;
  locationName: string;
  company: string;
  totalOrders: number;
  totalUnits: number;
  orderFrequency: number;
  topProducts: TopProduct[];
  lastOrderDate: string | null;
}

interface LocationAnalyticsWidgetProps {
  locations: LocationData[];
  title?: string;
  limit?: number;
  onViewMore?: () => void;
  showExport?: boolean;
}

export function LocationAnalyticsWidget({
  locations,
  title = "Top Locations",
  limit = 5,
  onViewMore,
  showExport = true,
}: LocationAnalyticsWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const displayLocations = locations.slice(0, limit);
  const totalUnits = locations.reduce((sum, l) => sum + l.totalUnits, 0);

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
    const csvContent = [
      "Rank,Location Name,Company,Total Orders,Total Units,Order Frequency,Last Order Date,Top Products",
      ...displayLocations.map(
        (location, index) =>
          `${index + 1},"${location.locationName}","${location.company}",${location.totalOrders},${location.totalUnits},${location.orderFrequency},${location.lastOrderDate || "N/A"},"${location.topProducts.map((p) => p.name).join("; ")}"`,
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

  if (displayLocations.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Building className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-500">No location data available</p>
          <p className="text-sm text-gray-400">
            Import order history to see analytics
          </p>
        </div>
      </div>
    );
  }

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
            {locations.length} location{locations.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {displayLocations.map((location, index) => {
          const percentOfTotal =
            totalUnits > 0 ? (location.totalUnits / totalUnits) * 100 : 0;

          return (
            <div
              key={location.locationId}
              className="p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {location.locationName}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Building className="w-3 h-3" />
                      {location.company}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">
                    {location.totalUnits.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">
                    units ({percentOfTotal.toFixed(1)}%)
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${percentOfTotal}%` }}
                />
              </div>

              {/* Stats row */}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3" />
                    {location.totalOrders} orders
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {location.orderFrequency}/mo avg
                  </span>
                </div>
                {location.lastOrderDate && (
                  <span>
                    Last:{" "}
                    {format(new Date(location.lastOrderDate), "MMM d, yyyy")}
                  </span>
                )}
              </div>

              {/* Top products for this location */}
              {location.topProducts.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    Top Products
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {location.topProducts.slice(0, 3).map((product) => (
                      <span
                        key={product.productId}
                        className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600"
                      >
                        {product.name} ({product.units.toLocaleString()})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {locations.length > limit && (
        <button
          onClick={onViewMore}
          className="block w-full mt-4 pt-4 border-t border-gray-100 text-center text-sm text-blue-600 hover:text-blue-700"
        >
          View all {locations.length} locations
        </button>
      )}
    </div>
  );
}

export default LocationAnalyticsWidget;
