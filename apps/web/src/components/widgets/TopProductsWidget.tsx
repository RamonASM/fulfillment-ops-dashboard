// =============================================================================
// TOP PRODUCTS WIDGET
// Shows top products by usage volume with trend indicators
// =============================================================================

import { useRef } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Camera,
  FileSpreadsheet,
} from "lucide-react";
import { Link } from "react-router-dom";
import html2canvas from "html2canvas";

interface TopProduct {
  id: string;
  name: string;
  units: number;
  trend: "growing" | "stable" | "declining";
}

interface TopProductsWidgetProps {
  products: TopProduct[];
  title?: string;
  clientId?: string;
  limit?: number;
  showExport?: boolean;
}

const trendConfig = {
  growing: {
    icon: TrendingUp,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    label: "Growing",
  },
  stable: {
    icon: Minus,
    color: "text-gray-500",
    bg: "bg-gray-50",
    label: "Stable",
  },
  declining: {
    icon: TrendingDown,
    color: "text-red-600",
    bg: "bg-red-50",
    label: "Declining",
  },
};

export function TopProductsWidget({
  products,
  title = "Top Products",
  clientId,
  limit = 5,
  showExport = true,
}: TopProductsWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const displayProducts = products.slice(0, limit);
  const maxUnits = Math.max(...displayProducts.map((p) => p.units), 1);

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
      "Rank,Product Name,Units,Trend",
      ...displayProducts.map(
        (product, index) =>
          `${index + 1},"${product.name}",${product.units},${product.trend}`,
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

  if (displayProducts.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <p className="text-gray-500 text-center py-8">
          No products with usage data
        </p>
      </div>
    );
  }

  return (
    <div
      ref={widgetRef}
      className="bg-white rounded-lg border border-gray-200 p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
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
          {clientId && (
            <Link
              to={`/clients/${clientId}/products`}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {displayProducts.map((product, index) => {
          const config = trendConfig[product.trend];
          const TrendIcon = config.icon;
          const barWidth = (product.units / maxUnits) * 100;

          return (
            <div key={product.id}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500 w-5">
                    #{index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                    {product.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">
                    {product.units.toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-500">units</span>
                  <div
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${config.bg}`}
                  >
                    <TrendIcon className={`w-3 h-3 ${config.color}`} />
                  </div>
                </div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-100">
        {Object.entries(trendConfig).map(([key, config]) => {
          const TrendIcon = config.icon;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`p-1 rounded ${config.bg}`}>
                <TrendIcon className={`w-3 h-3 ${config.color}`} />
              </div>
              <span className="text-xs text-gray-500">{config.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TopProductsWidget;
