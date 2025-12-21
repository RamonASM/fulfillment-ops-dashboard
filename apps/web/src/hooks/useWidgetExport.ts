// =============================================================================
// WIDGET EXPORT HOOK
// Lazy loads html2canvas only when export is triggered
// Saves ~300KB from initial bundle by deferring heavy library load
// =============================================================================

import { useCallback, useState, RefObject } from "react";

interface UseWidgetExportOptions {
  /** Reference to the DOM element to capture */
  widgetRef: RefObject<HTMLElement>;
  /** Title for the exported file (used in filename) */
  title: string;
  /** Optional callback when export starts */
  onExportStart?: () => void;
  /** Optional callback when export completes */
  onExportComplete?: () => void;
  /** Optional callback on export error */
  onExportError?: (error: Error) => void;
}

interface UseWidgetExportResult {
  /** Export widget as PNG image */
  exportToPNG: () => Promise<void>;
  /** Export data as CSV file */
  exportToCSV: (data: Record<string, unknown>[], columns?: string[]) => void;
  /** Whether an export is currently in progress */
  isExporting: boolean;
  /** Any export error that occurred */
  exportError: Error | null;
}

/**
 * Hook for exporting widgets to PNG/CSV with lazy-loaded html2canvas
 *
 * @example
 * const widgetRef = useRef<HTMLDivElement>(null);
 * const { exportToPNG, exportToCSV, isExporting } = useWidgetExport({
 *   widgetRef,
 *   title: "Monthly Trends"
 * });
 */
export function useWidgetExport({
  widgetRef,
  title,
  onExportStart,
  onExportComplete,
  onExportError,
}: UseWidgetExportOptions): UseWidgetExportResult {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<Error | null>(null);

  const exportToPNG = useCallback(async () => {
    if (!widgetRef.current) {
      const error = new Error("Widget reference not available");
      setExportError(error);
      onExportError?.(error);
      return;
    }

    setIsExporting(true);
    setExportError(null);
    onExportStart?.();

    try {
      // Lazy load html2canvas only when needed
      const html2canvas = (await import("html2canvas")).default;

      const canvas = await html2canvas(widgetRef.current, {
        backgroundColor: "#ffffff",
        scale: 2, // Higher resolution
        logging: false,
        useCORS: true,
      });

      // Create download link
      const link = document.createElement("a");
      const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
      const timestamp = new Date().toISOString().split("T")[0];
      link.download = `${sanitizedTitle}_${timestamp}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      onExportComplete?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Export failed");
      setExportError(error);
      onExportError?.(error);
    } finally {
      setIsExporting(false);
    }
  }, [widgetRef, title, onExportStart, onExportComplete, onExportError]);

  const exportToCSV = useCallback(
    (data: Record<string, unknown>[], columns?: string[]) => {
      if (!data || data.length === 0) {
        const error = new Error("No data to export");
        setExportError(error);
        onExportError?.(error);
        return;
      }

      try {
        // Get columns from first row if not specified
        const headers = columns || Object.keys(data[0]);

        // Build CSV content
        const csvRows = [
          headers.join(","),
          ...data.map((row) =>
            headers
              .map((header) => {
                const value = row[header];
                // Escape quotes and wrap in quotes if contains comma or quote
                const stringValue = String(value ?? "");
                if (stringValue.includes(",") || stringValue.includes('"')) {
                  return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
              })
              .join(",")
          ),
        ];

        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
        const timestamp = new Date().toISOString().split("T")[0];
        link.download = `${sanitizedTitle}_${timestamp}.csv`;
        link.href = url;
        link.click();

        URL.revokeObjectURL(url);
        onExportComplete?.();
      } catch (err) {
        const error = err instanceof Error ? err : new Error("CSV export failed");
        setExportError(error);
        onExportError?.(error);
      }
    },
    [title, onExportComplete, onExportError]
  );

  return {
    exportToPNG,
    exportToCSV,
    isExporting,
    exportError,
  };
}

export default useWidgetExport;
