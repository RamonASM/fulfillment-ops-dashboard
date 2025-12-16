// =============================================================================
// LOCATION PERFORMANCE MAP
// Geographic visualization of client locations with performance metrics
// =============================================================================

import { useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { MapPin, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

export interface LocationData {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;

  // Performance metrics
  totalProducts: number;
  activeProducts: number;
  totalOrders: number;
  healthScore: number; // 0-100
  stockoutCount: number;
  criticalCount: number;

  // Stock status
  stockStatus: "healthy" | "watch" | "critical";
}

interface LocationPerformanceMapProps {
  locations: LocationData[];
  onLocationClick?: (location: LocationData) => void;
  showLabels?: boolean;
  height?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const geoUrl = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const STATUS_COLORS = {
  healthy: "#10B981", // emerald-500
  watch: "#F59E0B", // amber-500
  critical: "#EF4444", // red-500
};

// =============================================================================
// COMPONENT
// =============================================================================

export function LocationPerformanceMap({
  locations,
  onLocationClick,
  showLabels = true,
  height = 500,
}: LocationPerformanceMapProps) {
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  const getMarkerSize = (location: LocationData): number => {
    // Size based on total orders (min 6, max 20)
    const baseSize = 6;
    const maxSize = 20;
    const maxOrders = Math.max(...locations.map((l) => l.totalOrders), 1);
    return baseSize + (location.totalOrders / maxOrders) * (maxSize - baseSize);
  };

  const getMarkerColor = (location: LocationData): string => {
    return STATUS_COLORS[location.stockStatus];
  };

  const handleLocationClick = (location: LocationData) => {
    setSelectedLocation(location.id);
    onLocationClick?.(location);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900">
              Location Performance
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {locations.length} locations
            </span>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-gray-600">Healthy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-gray-600">Watch</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-gray-600">Critical</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: `${height}px` }}>
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{
            scale: 1000,
          }}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup center={[-96, 38]} zoom={1}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="#E5E7EB"
                    stroke="#FFF"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: "#D1D5DB" },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {locations.map((location) => {
              const isHovered = hoveredLocation === location.id;
              const isSelected = selectedLocation === location.id;
              const markerSize = getMarkerSize(location);
              const markerColor = getMarkerColor(location);

              return (
                <Marker
                  key={location.id}
                  coordinates={[location.longitude, location.latitude]}
                  onMouseEnter={() => setHoveredLocation(location.id)}
                  onMouseLeave={() => setHoveredLocation(null)}
                  onClick={() => handleLocationClick(location)}
                >
                  {/* Marker Circle */}
                  <circle
                    r={isHovered || isSelected ? markerSize * 1.2 : markerSize}
                    fill={markerColor}
                    fillOpacity={isHovered || isSelected ? 1 : 0.8}
                    stroke="#FFF"
                    strokeWidth={isHovered || isSelected ? 3 : 2}
                    style={{
                      transition: "all 0.2s ease-in-out",
                      cursor: "pointer",
                    }}
                  />

                  {/* Location Label (on hover or if selected) */}
                  {showLabels && (isHovered || isSelected) && (
                    <g>
                      <rect
                        x={-60}
                        y={markerSize + 5}
                        width={120}
                        height={65}
                        fill="white"
                        stroke="#E5E7EB"
                        strokeWidth={1}
                        rx={4}
                        opacity={0.95}
                      />
                      <text
                        x={0}
                        y={markerSize + 20}
                        textAnchor="middle"
                        className="text-xs font-semibold"
                        fill="#111827"
                      >
                        {location.name}
                      </text>
                      <text
                        x={0}
                        y={markerSize + 35}
                        textAnchor="middle"
                        className="text-xs"
                        fill="#6B7280"
                      >
                        {location.city}, {location.state}
                      </text>
                      <text
                        x={0}
                        y={markerSize + 50}
                        textAnchor="middle"
                        className="text-xs"
                        fill="#6B7280"
                      >
                        {location.totalOrders} orders
                      </text>
                      <text
                        x={0}
                        y={markerSize + 63}
                        textAnchor="middle"
                        className="text-xs font-medium"
                        fill={markerColor}
                      >
                        Health: {location.healthScore}%
                      </text>
                    </g>
                  )}
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* Location Details Panel (when selected) */}
      {selectedLocation &&
        (() => {
          const location = locations.find((l) => l.id === selectedLocation);
          if (!location) return null;

          return (
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">
                    {location.name}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {location.city}, {location.state} • {location.code}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedLocation(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Products</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {location.activeProducts}/{location.totalProducts}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Orders</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {location.totalOrders}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Health Score</p>
                  <div className="flex items-center gap-1">
                    <p className="text-lg font-semibold text-gray-900">
                      {location.healthScore}%
                    </p>
                    {location.healthScore >= 80 ? (
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Issues</p>
                  <div className="flex items-center gap-1">
                    <p className="text-lg font-semibold text-gray-900">
                      {location.stockoutCount + location.criticalCount}
                    </p>
                    {location.stockoutCount + location.criticalCount > 0 && (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Empty State */}
      {locations.length === 0 && (
        <div className="p-12 text-center">
          <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No location data available</p>
          <p className="text-sm text-gray-400 mt-1">
            Location data will appear here once configured
          </p>
        </div>
      )}
    </div>
  );
}

export default LocationPerformanceMap;
