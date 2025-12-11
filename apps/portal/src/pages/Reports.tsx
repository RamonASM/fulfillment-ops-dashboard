// =============================================================================
// PORTAL REPORTS PAGE (Phase 11)
// Report generation and export for portal users
// =============================================================================

import { useState } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Loader2,
  FileSpreadsheet,
  FileIcon,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { usePortalAuthStore } from '../stores/auth.store';
import toast from 'react-hot-toast';

type ReportType = 'inventory-snapshot' | 'usage-trends' | 'order-history';
type ExportFormat = 'pdf' | 'excel' | 'csv';

interface ReportConfig {
  type: ReportType;
  title: string;
  description: string;
  icon: typeof FileText;
  formats: ExportFormat[];
}

const reports: ReportConfig[] = [
  {
    type: 'inventory-snapshot',
    title: 'Inventory Snapshot',
    description: 'Current stock levels, status, and reorder points for all products',
    icon: FileText,
    formats: ['pdf', 'excel', 'csv'],
  },
  {
    type: 'usage-trends',
    title: 'Usage Trends',
    description: 'Historical consumption patterns and forecasted demand',
    icon: FileSpreadsheet,
    formats: ['pdf', 'excel'],
  },
  {
    type: 'order-history',
    title: 'Order History',
    description: 'Complete order history with status and fulfillment details',
    icon: FileIcon,
    formats: ['pdf', 'excel', 'csv'],
  },
];

const formatIcons: Record<ExportFormat, typeof FileText> = {
  pdf: FileText,
  excel: FileSpreadsheet,
  csv: FileIcon,
};

const formatLabels: Record<ExportFormat, string> = {
  pdf: 'PDF',
  excel: 'Excel',
  csv: 'CSV',
};

export default function Reports() {
  const { user } = usePortalAuthStore();
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  });
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const handleExport = async (reportType: ReportType, format: ExportFormat) => {
    if (!user?.clientId) return;

    setIsExporting(`${reportType}-${format}`);

    try {
      const endpoint = `/portal/exports/${format}/${reportType}`;
      const params = new URLSearchParams({
        from: dateRange.from,
        to: dateRange.to,
      });

      // For file downloads, we need to handle the response differently
      const response = await fetch(
        `${(import.meta as any).env?.VITE_API_URL || ''}/api${endpoint}?${params}`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get filename from content-disposition header or generate one
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `${reportType}-${format}-${dateRange.from}-to-${dateRange.to}.${format === 'excel' ? 'xlsx' : format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      if ((import.meta as any).env?.DEV) console.error('Export error:', error);
      toast.error('Failed to export report. Please try again.');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate and download reports for your inventory data
        </p>
      </div>

      {/* Date Range Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>Date Range:</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-emerald-500 focus:border-emerald-500"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => {
          const Icon = report.icon;

          return (
            <div
              key={report.type}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Icon className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {report.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {report.description}
                  </p>
                </div>
              </div>

              {/* Export Buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                {report.formats.map((fmt) => {
                  const FormatIcon = formatIcons[fmt];
                  const isLoading = isExporting === `${report.type}-${fmt}`;

                  return (
                    <button
                      key={fmt}
                      onClick={() => handleExport(report.type, fmt)}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FormatIcon className="h-4 w-4" />
                      )}
                      {formatLabels[fmt]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Downloads */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Export
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Export all data for the selected date range
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => handleExport('inventory-snapshot', 'excel')}
            disabled={isExporting !== null}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {isExporting === 'inventory-snapshot-excel' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export All to Excel
          </button>
          <button
            onClick={() => handleExport('inventory-snapshot', 'pdf')}
            disabled={isExporting !== null}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isExporting === 'inventory-snapshot-pdf' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Export All to PDF
          </button>
        </div>
      </div>
    </div>
  );
}
