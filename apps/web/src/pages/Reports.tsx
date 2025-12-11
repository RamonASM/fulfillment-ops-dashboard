import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileBarChart,
  MapPin,
  BarChart3,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Package,
  Bell,
  Target,
  Users,
  FileText,
  X,
} from 'lucide-react';
import { api } from '@/api/client';
import { format, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { staggerContainer, staggerItem, fadeInUp } from '@/lib/animations';

// Types
interface Report {
  id: string;
  type: 'client_review' | 'location_performance' | 'executive_summary';
  title: string;
  clientId: string | null;
  locationId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  generatedAt: string;
  generatedBy: string;
  status: string;
  dataSnapshot: any;
  client?: { name: string; code: string } | null;
  location?: { name: string; code: string } | null;
}

interface Client {
  id: string;
  name: string;
  code: string;
}

interface Location {
  id: string;
  name: string;
  code: string;
}

const REPORT_TYPES = [
  {
    id: 'client_review',
    title: 'Client Review Report',
    description: 'Monthly inventory health, usage trends, alert summary, and recommendations',
    icon: FileBarChart,
    color: 'primary',
    requiresClient: true,
    requiresLocation: false,
    adminOnly: false,
  },
  {
    id: 'location_performance',
    title: 'Location Performance',
    description: 'Orders by location, product popularity, monthly trends, and comparisons',
    icon: MapPin,
    color: 'green',
    requiresClient: true,
    requiresLocation: true,
    adminOnly: false,
  },
  {
    id: 'executive_summary',
    title: 'Executive Summary',
    description: 'Portfolio overview, health metrics, order analytics, and client performance',
    icon: BarChart3,
    color: 'purple',
    requiresClient: false,
    requiresLocation: false,
    adminOnly: true,
  },
];

const PERIOD_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 6 months' },
  { value: 365, label: 'Last year' },
];

export default function Reports() {
  const queryClient = useQueryClient();
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<typeof REPORT_TYPES[number] | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [filterType, setFilterType] = useState<string>('all');

  // Fetch reports
  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ['reports', filterType],
    queryFn: () =>
      api.get<{ data: Report[]; meta: { total: number } }>('/reports', {
        params: filterType !== 'all' ? { type: filterType } : undefined,
      }),
  });

  // Fetch clients for dropdown
  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ data: Client[] }>('/clients'),
  });

  // Fetch locations for selected client
  const { data: locationsData } = useQuery({
    queryKey: ['locations', selectedClientId],
    queryFn: () =>
      api.get<{ data: Location[] }>(`/clients/${selectedClientId}/locations`),
    enabled: !!selectedClientId && selectedReportType?.requiresLocation,
  });

  // Generate report mutations
  const generateClientReview = useMutation({
    mutationFn: (params: { clientId: string; periodDays: number }) =>
      api.post<{ reportId: string; report: Report }>(
        `/reports/generate/client-review/${params.clientId}`,
        { periodDays: params.periodDays }
      ),
    onSuccess: (data) => {
      toast.success('Client review report generated');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setGenerateModalOpen(false);
      setSelectedReport(data.report);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate report');
    },
  });

  const generateLocationPerformance = useMutation({
    mutationFn: (params: { clientId: string; locationId: string; periodDays: number }) =>
      api.post<{ reportId: string; report: Report }>(
        `/reports/generate/location-performance/${params.clientId}/${params.locationId}`,
        { periodDays: params.periodDays }
      ),
    onSuccess: (data) => {
      toast.success('Location performance report generated');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setGenerateModalOpen(false);
      setSelectedReport(data.report);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate report');
    },
  });

  const generateExecutiveSummary = useMutation({
    mutationFn: (params: { periodDays: number }) =>
      api.post<{ reportId: string; report: Report }>('/reports/generate/executive-summary', {
        periodDays: params.periodDays,
      }),
    onSuccess: (data) => {
      toast.success('Executive summary report generated');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setGenerateModalOpen(false);
      setSelectedReport(data.report);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate report');
    },
  });

  const deleteReport = useMutation({
    mutationFn: (reportId: string) => api.delete(`/reports/${reportId}`),
    onSuccess: () => {
      toast.success('Report deleted');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      if (selectedReport) setSelectedReport(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete report');
    },
  });

  const handleGenerateReport = () => {
    if (!selectedReportType) return;

    if (selectedReportType.id === 'client_review') {
      if (!selectedClientId) {
        toast.error('Please select a client');
        return;
      }
      generateClientReview.mutate({ clientId: selectedClientId, periodDays });
    } else if (selectedReportType.id === 'location_performance') {
      if (!selectedClientId || !selectedLocationId) {
        toast.error('Please select a client and location');
        return;
      }
      generateLocationPerformance.mutate({
        clientId: selectedClientId,
        locationId: selectedLocationId,
        periodDays,
      });
    } else if (selectedReportType.id === 'executive_summary') {
      generateExecutiveSummary.mutate({ periodDays });
    }
  };

  const openGenerateModal = (reportType: typeof REPORT_TYPES[number]) => {
    setSelectedReportType(reportType);
    setSelectedClientId('');
    setSelectedLocationId('');
    setPeriodDays(30);
    setGenerateModalOpen(true);
  };

  const isGenerating =
    generateClientReview.isPending ||
    generateLocationPerformance.isPending ||
    generateExecutiveSummary.isPending;

  const reports = reportsData?.data || [];
  const clients = clientsData?.data || [];
  const locations = locationsData?.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Reports</h1>
          <p className="text-text-secondary mt-1">
            Generate and view detailed reports for clients and portfolio
          </p>
        </div>
      </div>

      {/* Report Types */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {REPORT_TYPES.map((reportType) => (
          <motion.div
            key={reportType.id}
            variants={staggerItem}
            className="card card-hover p-6"
          >
            <div className="flex items-start gap-4">
              <div
                className={clsx(
                  'p-3 rounded-lg',
                  reportType.color === 'primary' && 'bg-primary-50',
                  reportType.color === 'green' && 'bg-green-50',
                  reportType.color === 'purple' && 'bg-purple-50'
                )}
              >
                <reportType.icon
                  className={clsx(
                    'w-6 h-6',
                    reportType.color === 'primary' && 'text-primary-600',
                    reportType.color === 'green' && 'text-green-600',
                    reportType.color === 'purple' && 'text-purple-600'
                  )}
                />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-text-primary">{reportType.title}</h3>
                <p className="text-sm text-text-secondary mt-1">{reportType.description}</p>
                {reportType.adminOnly && (
                  <span className="inline-flex items-center text-xs text-amber-600 mt-2">
                    <Users className="w-3 h-3 mr-1" />
                    Admin Only
                  </span>
                )}
                <button
                  onClick={() => openGenerateModal(reportType)}
                  className="btn-primary btn-sm mt-4"
                >
                  Generate Report
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Report History */}
      <div className="card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Report History</h2>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input py-1.5 px-3 text-sm"
          >
            <option value="all">All Types</option>
            <option value="client_review">Client Review</option>
            <option value="location_performance">Location Performance</option>
            <option value="executive_summary">Executive Summary</option>
          </select>
        </div>

        {reportsLoading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-gray-300" />
            <p className="text-text-secondary mt-2">No reports generated yet</p>
            <p className="text-sm text-text-tertiary">
              Generate a report above to see it here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {reports.map((report) => (
              <motion.div
                key={report.id}
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                className={clsx(
                  'p-4 flex items-center gap-4 cursor-pointer hover:bg-surface-secondary transition-colors',
                  selectedReport?.id === report.id && 'bg-primary-50'
                )}
                onClick={() => setSelectedReport(report)}
              >
                <div
                  className={clsx(
                    'p-2 rounded-lg',
                    report.type === 'client_review' && 'bg-primary-100',
                    report.type === 'location_performance' && 'bg-green-100',
                    report.type === 'executive_summary' && 'bg-purple-100'
                  )}
                >
                  {report.type === 'client_review' && (
                    <FileBarChart className="w-5 h-5 text-primary-600" />
                  )}
                  {report.type === 'location_performance' && (
                    <MapPin className="w-5 h-5 text-green-600" />
                  )}
                  {report.type === 'executive_summary' && (
                    <BarChart3 className="w-5 h-5 text-purple-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary truncate">{report.title}</p>
                  <p className="text-sm text-text-secondary">
                    {report.client?.name || 'Portfolio-wide'}{' '}
                    {report.location && `• ${report.location.name}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-text-secondary">
                    {formatDistanceToNow(new Date(report.generatedAt), { addSuffix: true })}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {report.periodStart && report.periodEnd
                      ? `${format(new Date(report.periodStart), 'MMM d')} - ${format(
                          new Date(report.periodEnd),
                          'MMM d, yyyy'
                        )}`
                      : ''}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this report?')) {
                      deleteReport.mutate(report.id);
                    }
                  }}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Report Viewer */}
      <AnimatePresence>
        {selectedReport && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="card"
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-text-primary">{selectedReport.title}</h2>
                <p className="text-sm text-text-secondary">
                  Generated{' '}
                  {formatDistanceToNow(new Date(selectedReport.generatedAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <ReportContent report={selectedReport} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generate Modal */}
      <AnimatePresence>
        {generateModalOpen && selectedReportType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setGenerateModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-md relative z-10"
            >
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-text-primary">
                  Generate {selectedReportType.title}
                </h3>
              </div>
              <div className="p-4 space-y-4">
                {selectedReportType.requiresClient && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Client
                    </label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => {
                        setSelectedClientId(e.target.value);
                        setSelectedLocationId('');
                      }}
                      className="input w-full"
                    >
                      <option value="">Select a client...</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name} ({client.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedReportType.requiresLocation && selectedClientId && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Location
                    </label>
                    <select
                      value={selectedLocationId}
                      onChange={(e) => setSelectedLocationId(e.target.value)}
                      className="input w-full"
                    >
                      <option value="">Select a location...</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name} ({location.code})
                        </option>
                      ))}
                    </select>
                    {locations.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        No locations found for this client
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Time Period
                  </label>
                  <select
                    value={periodDays}
                    onChange={(e) => setPeriodDays(Number(e.target.value))}
                    className="input w-full"
                  >
                    {PERIOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-4 border-t border-border flex justify-end gap-2">
                <button
                  onClick={() => setGenerateModalOpen(false)}
                  className="btn-secondary"
                  disabled={isGenerating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateReport}
                  className="btn-primary"
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    'Generate Report'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Report Content Component
function ReportContent({ report }: { report: Report }) {
  const data = report.dataSnapshot;

  if (!data) {
    return (
      <p className="text-text-secondary text-center py-8">
        Report data not available
      </p>
    );
  }

  if (report.type === 'client_review') {
    return <ClientReviewContent data={data} />;
  }

  if (report.type === 'location_performance') {
    return <LocationPerformanceContent data={data} />;
  }

  if (report.type === 'executive_summary') {
    return <ExecutiveSummaryContent data={data} />;
  }

  return null;
}

// Client Review Report Content
function ClientReviewContent({ data }: { data: any }) {
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'health',
    'recommendations',
  ]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  const healthScore = data.inventoryHealth?.healthScore || 0;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">Health Score</p>
          <p
            className={clsx(
              'text-2xl font-bold',
              healthScore >= 80 ? 'text-green-600' : healthScore >= 60 ? 'text-amber-600' : 'text-red-600'
            )}
          >
            {healthScore}%
          </p>
        </div>
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">Total Products</p>
          <p className="text-2xl font-bold text-text-primary">
            {data.inventoryHealth?.totalProducts || 0}
          </p>
        </div>
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">Total Orders</p>
          <p className="text-2xl font-bold text-text-primary">
            {data.orderMetrics?.totalOrders || 0}
          </p>
        </div>
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">SLA Compliance</p>
          <p className="text-2xl font-bold text-text-primary">
            {(data.orderMetrics?.slaComplianceRate || 0).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Inventory Health Section */}
      <CollapsibleSection
        title="Inventory Health"
        icon={Package}
        expanded={expandedSections.includes('health')}
        onToggle={() => toggleSection('health')}
      >
        <div className="grid grid-cols-5 gap-2">
          <StatusBox label="Healthy" count={data.inventoryHealth?.healthyCount || 0} color="green" />
          <StatusBox label="Watch" count={data.inventoryHealth?.watchCount || 0} color="blue" />
          <StatusBox label="Low" count={data.inventoryHealth?.lowCount || 0} color="amber" />
          <StatusBox label="Critical" count={data.inventoryHealth?.criticalCount || 0} color="red" />
          <StatusBox label="Stockout" count={data.inventoryHealth?.stockoutCount || 0} color="rose" />
        </div>
      </CollapsibleSection>

      {/* Top Products Section */}
      <CollapsibleSection
        title="Top Products by Usage"
        icon={TrendingUp}
        expanded={expandedSections.includes('products')}
        onToggle={() => toggleSection('products')}
      >
        <div className="space-y-2">
          {(data.usageAnalytics?.topProducts || []).slice(0, 5).map((product: any, i: number) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="font-medium text-text-primary">{product.name}</span>
              <span className="text-text-secondary">
                {product.monthlyUsage?.toLocaleString()} units/mo
              </span>
            </div>
          ))}
          {(!data.usageAnalytics?.topProducts || data.usageAnalytics.topProducts.length === 0) && (
            <p className="text-text-secondary text-sm">No usage data available</p>
          )}
        </div>
      </CollapsibleSection>

      {/* Alert Summary Section */}
      <CollapsibleSection
        title="Alert Summary"
        icon={Bell}
        expanded={expandedSections.includes('alerts')}
        onToggle={() => toggleSection('alerts')}
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-surface-secondary rounded-lg">
            <p className="text-2xl font-bold text-text-primary">{data.alertSummary?.totalAlerts || 0}</p>
            <p className="text-sm text-text-secondary">Total Alerts</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{data.alertSummary?.resolvedAlerts || 0}</p>
            <p className="text-sm text-text-secondary">Resolved</p>
          </div>
          <div className="text-center p-3 bg-amber-50 rounded-lg">
            <p className="text-2xl font-bold text-amber-600">{data.alertSummary?.activeAlerts || 0}</p>
            <p className="text-sm text-text-secondary">Active</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Recommendations Section */}
      <CollapsibleSection
        title="Recommendations"
        icon={Target}
        expanded={expandedSections.includes('recommendations')}
        onToggle={() => toggleSection('recommendations')}
      >
        <ul className="space-y-2">
          {(data.recommendations || []).map((rec: string, i: number) => (
            <li key={i} className="flex items-start gap-2 text-text-secondary">
              <CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </CollapsibleSection>
    </div>
  );
}

// Location Performance Report Content
function LocationPerformanceContent({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">Total Orders</p>
          <p className="text-2xl font-bold text-text-primary">
            {data.orderMetrics?.totalOrders || 0}
          </p>
        </div>
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">Total Packs</p>
          <p className="text-2xl font-bold text-text-primary">
            {data.orderMetrics?.totalPacks?.toLocaleString() || 0}
          </p>
        </div>
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">Avg Order Size</p>
          <p className="text-2xl font-bold text-text-primary">
            {(data.orderMetrics?.avgOrderSize || 0).toFixed(1)} packs
          </p>
        </div>
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">Rank</p>
          <p className="text-2xl font-bold text-text-primary">
            #{data.comparisonToAverage?.rank || '-'} of {data.comparisonToAverage?.totalLocations || 0}
          </p>
        </div>
      </div>

      {/* Performance vs Average */}
      {data.comparisonToAverage && (
        <div className="p-4 bg-surface-secondary rounded-lg flex items-center gap-3">
          {data.comparisonToAverage.percentAboveAvg >= 0 ? (
            <TrendingUp className="w-5 h-5 text-green-500" />
          ) : (
            <TrendingDown className="w-5 h-5 text-red-500" />
          )}
          <span className="text-text-secondary">
            This location is{' '}
            <span
              className={clsx(
                'font-semibold',
                data.comparisonToAverage.percentAboveAvg >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              )}
            >
              {Math.abs(data.comparisonToAverage.percentAboveAvg).toFixed(0)}%{' '}
              {data.comparisonToAverage.percentAboveAvg >= 0 ? 'above' : 'below'}
            </span>{' '}
            average
          </span>
        </div>
      )}

      {/* Popular Products */}
      <div>
        <h4 className="font-medium text-text-primary mb-3">Popular Products</h4>
        <div className="space-y-2">
          {(data.productPopularity || []).slice(0, 5).map((product: any, i: number) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <span className="font-medium text-text-primary">{product.productName}</span>
              <span className="text-text-secondary">
                {product.orderCount} orders • {product.totalPacks} packs
              </span>
            </div>
          ))}
          {(!data.productPopularity || data.productPopularity.length === 0) && (
            <p className="text-text-secondary text-sm">No order data for this location</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Executive Summary Report Content
function ExecutiveSummaryContent({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* Portfolio Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">Total Clients</p>
          <p className="text-2xl font-bold text-text-primary">
            {data.portfolioOverview?.totalClients || 0}
          </p>
        </div>
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">Active Clients</p>
          <p className="text-2xl font-bold text-text-primary">
            {data.portfolioOverview?.activeClients || 0}
          </p>
        </div>
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">Total Products</p>
          <p className="text-2xl font-bold text-text-primary">
            {data.portfolioOverview?.totalProducts || 0}
          </p>
        </div>
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm text-text-secondary">Total Locations</p>
          <p className="text-2xl font-bold text-text-primary">
            {data.portfolioOverview?.totalLocations || 0}
          </p>
        </div>
      </div>

      {/* Health Metrics */}
      <div>
        <h4 className="font-medium text-text-primary mb-3">Health Metrics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-text-secondary">Overall Health</p>
            <p className="text-2xl font-bold text-green-600">
              {data.healthMetrics?.overallHealthScore || 0}%
            </p>
          </div>
          <div className="p-4 bg-amber-50 rounded-lg">
            <p className="text-sm text-text-secondary">Clients at Risk</p>
            <p className="text-2xl font-bold text-amber-600">
              {data.healthMetrics?.clientsAtRisk || 0}
            </p>
          </div>
          <div className="p-4 bg-red-50 rounded-lg">
            <p className="text-sm text-text-secondary">Products at Risk</p>
            <p className="text-2xl font-bold text-red-600">
              {data.healthMetrics?.productsAtRisk || 0}
            </p>
          </div>
          <div className="p-4 bg-rose-50 rounded-lg">
            <p className="text-sm text-text-secondary">Stockouts</p>
            <p className="text-2xl font-bold text-rose-600">
              {data.healthMetrics?.stockoutCount || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Order Metrics */}
      <div>
        <h4 className="font-medium text-text-primary mb-3">Order Metrics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-surface-secondary rounded-lg">
            <p className="text-sm text-text-secondary">Total Orders</p>
            <p className="text-2xl font-bold text-text-primary">
              {data.orderMetrics?.totalOrders || 0}
            </p>
          </div>
          <div className="p-4 bg-surface-secondary rounded-lg">
            <p className="text-sm text-text-secondary">Total Value</p>
            <p className="text-2xl font-bold text-text-primary">
              ${(data.orderMetrics?.totalValue || 0).toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-surface-secondary rounded-lg">
            <p className="text-sm text-text-secondary">Avg/Client</p>
            <p className="text-2xl font-bold text-text-primary">
              {(data.orderMetrics?.avgOrdersPerClient || 0).toFixed(1)}
            </p>
          </div>
          <div className="p-4 bg-surface-secondary rounded-lg">
            <p className="text-sm text-text-secondary">SLA Compliance</p>
            <p className="text-2xl font-bold text-text-primary">
              {(data.orderMetrics?.slaComplianceRate || 0).toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {/* Client Performance */}
      <div>
        <h4 className="font-medium text-text-primary mb-3">Clients Needing Attention</h4>
        <div className="space-y-2">
          {(data.clientPerformance || [])
            .filter((c: any) => c.healthScore < 80)
            .slice(0, 5)
            .map((client: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <span className="font-medium text-text-primary">{client.clientName}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span
                    className={clsx(
                      'font-medium',
                      client.healthScore >= 70
                        ? 'text-amber-600'
                        : 'text-red-600'
                    )}
                  >
                    {client.healthScore}% health
                  </span>
                  <span className="text-text-secondary">
                    {client.alertCount} alerts
                  </span>
                </div>
              </div>
            ))}
          {(!data.clientPerformance ||
            data.clientPerformance.filter((c: any) => c.healthScore < 80).length === 0) && (
            <p className="text-text-secondary text-sm">All clients are healthy</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper Components
function CollapsibleSection({
  title,
  icon: Icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: any;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between bg-surface-secondary hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-text-secondary" />
          <span className="font-medium text-text-primary">{title}</span>
        </div>
        {expanded ? (
          <ChevronDown className="w-5 h-5 text-text-secondary" />
        ) : (
          <ChevronRight className="w-5 h-5 text-text-secondary" />
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusBox({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: 'green' | 'blue' | 'amber' | 'red' | 'rose';
}) {
  const bgColors = {
    green: 'bg-green-50',
    blue: 'bg-blue-50',
    amber: 'bg-amber-50',
    red: 'bg-red-50',
    rose: 'bg-rose-50',
  };

  const textColors = {
    green: 'text-green-600',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    rose: 'text-rose-600',
  };

  return (
    <div className={clsx('p-3 rounded-lg text-center', bgColors[color])}>
      <p className={clsx('text-xl font-bold', textColors[color])}>{count}</p>
      <p className="text-xs text-text-secondary">{label}</p>
    </div>
  );
}
