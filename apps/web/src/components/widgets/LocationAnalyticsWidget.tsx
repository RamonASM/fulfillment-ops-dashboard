// =============================================================================
// LOCATION ANALYTICS WIDGET
// Shows analytics by shipping location
// =============================================================================

import { useRef, useState } from "react";
import {
  MapPin,
  Building,
  TrendingUp,
  Package,
  Camera,
  FileSpreadsheet,
  Activity,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { useWidgetExport } from "@/hooks/useWidgetExport";

// Standard TopProduct interface
interface TopProduct {
  productId: string;
  productName: string;
  totalUnits: number;
  percentOfLocationVolume: number;
  lastOrderDate: string | null;
}

// Legacy product interface for backward compatibility
interface LegacyTopProduct {
  productId: string;
  name: string;
  units: number;
  percentOfLocationVolume?: number;
  lastOrderDate?: string | null;
}

type TopProductType = TopProduct | LegacyTopProduct;

// Type guard for TopProduct
function isTopProduct(product: TopProductType): product is TopProduct {
  return "productName" in product;
}

// Helper to get product name safely
function getProductName(product: TopProductType): string {
  return isTopProduct(product) ? product.productName : product.name;
}

// Helper to get product units safely
function getProductUnits(product: TopProductType): number {
  return isTopProduct(product) ? product.totalUnits : product.units;
}

// Legacy interface for backward compatibility
interface LocationData {
  locationId: string;
  locationName: string;
  company: string;
  totalOrders: number;
  totalUnits: number;
  orderFrequency: number;
  topProducts: TopProductType[];
  lastOrderDate: string | null;
}

// New enhanced interface matching backend
interface EnhancedLocationPerformance {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  performanceScore: number;
  performanceRank: number;
  performanceTier: "excellent" | "good" | "average" | "needs-attention";
  volumeScore: number;
  frequencyScore: number;
  healthScore: number;
  totalOrders: number;
  totalUnits: number;
  volumePercentOfClient: number;
  orderFrequency: number;
  frequencyConsistency: number;
  lastOrderDate: string | null;
  healthStatus: "healthy" | "watch" | "critical";
  totalProducts: number;
  stockoutCount: number;
  topProducts: TopProductType[];
}

type LocationDataType = LocationData | EnhancedLocationPerformance;

interface LocationAnalyticsWidgetProps {
  locations: LocationDataType[];
  title?: string;
  limit?: number;
  onViewMore?: () => void;
  showExport?: boolean;
  showEnhancedMetrics?: boolean;
}

// Helper functions to check data type and access fields safely
function isEnhancedData(
  location: LocationDataType,
): location is EnhancedLocationPerformance {
  return "performanceScore" in location;
}

function getLocationId(location: LocationDataType): string {
  return isEnhancedData(location) ? location.id : location.locationId;
}

function getLocationName(location: LocationDataType): string {
  return isEnhancedData(location) ? location.name : location.locationName;
}

function getLocationCompany(location: LocationDataType): string {
  if (isEnhancedData(location)) {
    return location.city && location.state
      ? `${location.city}, ${location.state}`
      : location.code;
  }
  return location.company;
}

export function LocationAnalyticsWidget({
  locations,
  title = "Top Locations",
  limit = 5,
  onViewMore,
  showExport = true,
  showEnhancedMetrics = false,
}: LocationAnalyticsWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set(),
  );

  // Use shared export hook with lazy-loaded html2canvas
  const { exportToPNG, isExporting } = useWidgetExport({
    widgetRef,
    title,
  });

  const displayLocations = locations.slice(0, limit);
  const totalUnits = locations.reduce((sum, l) => sum + l.totalUnits, 0);

  const toggleProductExpansion = (locationId: string) => {
    setExpandedProducts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(locationId)) {
        newSet.delete(locationId);
      } else {
        newSet.add(locationId);
      }
      return newSet;
    });
  };

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

  // Export as CSV
  const exportToCSV = () => {
    const headers = showEnhancedMetrics
      ? "Rank,Location Name,City/State,Performance Score,Total Orders,Total Units,Order Frequency,Last Order Date,Top Products"
      : "Rank,Location Name,Company,Total Orders,Total Units,Order Frequency,Last Order Date,Top Products";

    const csvContent = [
      headers,
      ...displayLocations.map((location, index) => {
        const locationName = getLocationName(location);
        const company = getLocationCompany(location);
        const products = location.topProducts
          .map((p) => getProductName(p))
          .join("; ");

        if (showEnhancedMetrics && isEnhancedData(location)) {
          return `${index + 1},"${locationName}","${company}",${location.performanceScore},${location.totalOrders},${location.totalUnits},${location.orderFrequency.toFixed(2)},${location.lastOrderDate || "N/A"},"${products}"`;
        }
        return `${index + 1},"${locationName}","${company}",${location.totalOrders},${location.totalUnits},${location.orderFrequency},${location.lastOrderDate || "N/A"},"${products}"`;
      }),
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
                disabled={isExporting}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                title="Export as PNG"
                aria-label="Export location analytics as PNG image"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={exportToCSV}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Export as CSV"
                aria-label="Export location data as CSV file"
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
          const locationId = getLocationId(location);
          const locationName = getLocationName(location);
          const company = getLocationCompany(location);
          const percentOfTotal =
            totalUnits > 0 ? (location.totalUnits / totalUnits) * 100 : 0;
          const isEnhanced = isEnhancedData(location);
          const isExpanded = expandedProducts.has(locationId);
          const productLimit = isExpanded ? 10 : 5;

          return (
            <div
              key={locationId}
              className="p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {locationName}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Building className="w-3 h-3" />
                      {company}
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

              {/* Performance Score (Enhanced Mode) */}
              {showEnhancedMetrics && isEnhanced && (
                <div
                  className={`flex items-center justify-between mb-3 p-2 rounded-lg border ${getTierConfig(location.performanceTier).bgColor} ${getTierConfig(location.performanceTier).borderColor}`}
                  title={`Volume: ${location.volumeScore}/100 (50%) | Frequency: ${location.frequencyScore}/100 (30%) | Health: ${location.healthScore}/100 (20%)`}
                >
                  <div className="flex items-center gap-2">
                    <Activity
                      className={`w-4 h-4 ${getTierConfig(location.performanceTier).color}`}
                    />
                    <div>
                      <div
                        className={`text-lg font-bold ${getTierConfig(location.performanceTier).color}`}
                      >
                        {location.performanceScore}
                      </div>
                      <div className="text-xs text-gray-600">
                        Performance Score
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${getTierConfig(location.performanceTier).bgColor} ${getTierConfig(location.performanceTier).color}`}
                  >
                    {getTierConfig(location.performanceTier).label}
                  </span>
                </div>
              )}

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
                    {typeof location.orderFrequency === "number"
                      ? location.orderFrequency.toFixed(2)
                      : location.orderFrequency}
                    /mo avg
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
                    Top Products (showing{" "}
                    {Math.min(productLimit, location.topProducts.length)} of{" "}
                    {location.topProducts.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {location.topProducts
                      .slice(0, productLimit)
                      .map((product) => {
                        const productName = getProductName(product);
                        const productUnits = getProductUnits(product);
                        return (
                          <span
                            key={product.productId}
                            className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600"
                          >
                            {productName} ({productUnits.toLocaleString()})
                          </span>
                        );
                      })}
                  </div>
                  {location.topProducts.length > 5 && (
                    <button
                      onClick={() => toggleProductExpansion(locationId)}
                      className="flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-700"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="w-3 h-3" />
                          Show fewer products
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3" />
                          Show all {location.topProducts.length} products
                        </>
                      )}
                    </button>
                  )}
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
