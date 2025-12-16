import { useState, useRef, ReactNode } from "react";
import { Camera, FileSpreadsheet } from "lucide-react";
import html2canvas from "html2canvas";

interface InteractiveChartProps {
  title: string;
  children: ReactNode;
  onExportData?: () => Record<string, unknown>[];
  onDrillDown?: (data: unknown) => void;
  exportFormats?: Array<"png" | "csv">;
  className?: string;
}

export function InteractiveChart({
  title,
  children,
  onExportData,
  exportFormats = ["png", "csv"],
  className = "",
}: InteractiveChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportToPNG = async () => {
    if (!chartRef.current) return;

    setIsExporting(true);
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: "#ffffff",
        scale: 2, // Higher resolution
      });

      const link = document.createElement("a");
      link.download = `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Error exporting chart to PNG:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToCSV = () => {
    if (!onExportData) return;

    try {
      const data = onExportData();
      if (!data || data.length === 0) {
        console.warn("No data to export");
        return;
      }

      // Get headers from first row
      const headers = Object.keys(data[0]);

      // Build CSV content
      const csvContent = [
        headers.join(","),
        ...data.map((row) =>
          headers
            .map((header) => {
              const value = row[header];
              // Handle values that need escaping
              if (
                typeof value === "string" &&
                (value.includes(",") ||
                  value.includes('"') ||
                  value.includes("\n"))
              ) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value ?? "";
            })
            .join(","),
        ),
      ].join("\n");

      // Create and trigger download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting chart to CSV:", error);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex gap-1">
          {exportFormats.includes("png") && (
            <button
              onClick={exportToPNG}
              disabled={isExporting}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
              title="Export as PNG"
            >
              <Camera className="w-4 h-4" />
            </button>
          )}
          {exportFormats.includes("csv") && onExportData && (
            <button
              onClick={exportToCSV}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              title="Export as CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div ref={chartRef} className="p-4">
        {children}
      </div>
    </div>
  );
}
