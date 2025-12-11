import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Upload, Download, Settings, Package, MapPin, MessageSquare, Activity, CheckSquare, ShoppingCart, X, FileSpreadsheet, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/api/client';
import type { ClientWithStats, ProductWithMetrics } from '@inventory/shared';
import { STATUS_COLORS, STATUS_ICONS } from '@inventory/shared';
import { useState, useRef, useCallback } from 'react';
import { clsx } from 'clsx';
import { UsageTierBadge } from '@/components/ui';
import { fadeInUp } from '@/lib/animations';
import { CommentThread } from '@/components/CommentThread';
import { ActivityFeed } from '@/components/ActivityFeed';
import { TodoList } from '@/components/TodoList';
import toast from 'react-hot-toast';

interface ImportPreview {
  importId: string;
  detectedType: string;
  rowCount: number;
  columns: { source: string; target: string; confidence: number }[];
  sampleRows: Record<string, unknown>[];
  warnings: { type: string; message: string; affectedRows: number }[];
}

interface ImportResult {
  id: string;
  status: string;
  processedCount?: number;
  errorCount?: number;
  result?: {
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  };
}

type ItemTypeTab = 'evergreen' | 'event' | 'completed';
type SectionTab = 'products' | 'comments' | 'activity' | 'tasks';

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const [activeTab, setActiveTab] = useState<ItemTypeTab>('evergreen');
  const [sectionTab, setSectionTab] = useState<SectionTab>('products');
  const [search, setSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'processing' | 'complete'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch client
  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => api.get<ClientWithStats>(`/clients/${clientId}`),
    enabled: !!clientId,
  });

  // Fetch products
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', clientId, activeTab, search],
    queryFn: () =>
      api.get<{
        data: ProductWithMetrics[];
        meta: { statusCounts: Record<string, number> };
      }>(`/clients/${clientId}/products`, {
        params: {
          type: activeTab,
          search: search || undefined,
        },
      }),
    enabled: !!clientId,
  });

  const products = productsData?.data || [];
  const statusCounts = productsData?.meta?.statusCounts || {};

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return api.upload<ImportPreview>('/imports/upload', file, { clientId: clientId! });
    },
    onSuccess: (data) => {
      setImportPreview(data);
      setImportStep('preview');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload file');
    },
  });

  // Confirm import mutation
  const confirmMutation = useMutation({
    mutationFn: async (importId: string) => {
      return api.post<ImportResult>(`/imports/${importId}/confirm`, {
        columnMapping: importPreview?.columns,
      });
    },
    onSuccess: (data) => {
      setImportResult(data);
      setImportStep('complete');
      queryClient.invalidateQueries({ queryKey: ['products', clientId] });
      toast.success('Import completed successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process import');
      setImportStep('preview');
    },
  });

  // File handling
  const handleFileSelect = useCallback((file: File) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.tsv'];
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!allowedTypes.includes(ext)) {
      toast.error('Invalid file type. Only CSV, XLSX, XLS, and TSV files are allowed.');
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const handleConfirmImport = () => {
    if (importPreview) {
      setImportStep('processing');
      confirmMutation.mutate(importPreview.importId);
    }
  };

  const resetImportModal = () => {
    setShowImportModal(false);
    setImportStep('upload');
    setSelectedFile(null);
    setImportPreview(null);
    setImportResult(null);
  };

  const handleExport = async () => {
    try {
      // Use the products data we already have
      if (!products || products.length === 0) {
        toast.error('No data to export');
        return;
      }

      // Create CSV content
      const headers = ['Product ID', 'Name', 'Status', 'Stock (Packs)', 'Stock (Units)', 'Reorder Point', 'Weeks Remaining'];
      const rows = products.map(p => [
        p.productId,
        p.name,
        p.status.level,
        p.currentStockPacks,
        p.currentStockUnits,
        p.reorderPointPacks,
        p.status.weeksRemaining === 999 ? '' : p.status.weeksRemaining
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${client?.code || 'export'}-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Export downloaded');
    } catch {
      toast.error('Failed to export data');
    }
  };

  if (clientLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-96 w-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium text-gray-900">Client not found</h2>
        <Link to="/clients" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
          Back to clients
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/clients"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <p className="text-gray-500">{client.code}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/clients/${clientId}/locations`}
            className="btn-secondary btn-sm"
          >
            <MapPin className="w-4 h-4 mr-2" />
            Locations
          </Link>
          <button className="btn-secondary btn-sm" onClick={() => setShowImportModal(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </button>
          <button className="btn-secondary btn-sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
          <button className="btn-ghost btn-sm">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stock Health Overview */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Stock Health</h2>
        <div className="flex items-center gap-4">
          <StatusPill
            label="Critical"
            count={statusCounts.critical || 0}
            color={STATUS_COLORS.critical}
          />
          <StatusPill
            label="Low"
            count={statusCounts.low || 0}
            color={STATUS_COLORS.low}
          />
          <StatusPill
            label="Watch"
            count={statusCounts.watch || 0}
            color={STATUS_COLORS.watch}
          />
          <StatusPill
            label="Healthy"
            count={statusCounts.healthy || 0}
            color={STATUS_COLORS.healthy}
          />
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setSectionTab('products')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
            sectionTab === 'products'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <Package className="w-4 h-4" />
          Products
        </button>
        <button
          onClick={() => setSectionTab('comments')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
            sectionTab === 'comments'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <MessageSquare className="w-4 h-4" />
          Comments
        </button>
        <button
          onClick={() => setSectionTab('activity')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
            sectionTab === 'activity'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <Activity className="w-4 h-4" />
          Activity
        </button>
        <button
          onClick={() => setSectionTab('tasks')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
            sectionTab === 'tasks'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <CheckSquare className="w-4 h-4" />
          Tasks
        </button>
      </div>

      {/* Section Content */}
      {sectionTab === 'products' && (
        <>
          {/* Tabs and Search */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {(['evergreen', 'event', 'completed'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={clsx(
                    'px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize',
                    activeTab === tab
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="input w-64"
            />
          </div>

          {/* Products Table */}
          <div className="card overflow-hidden">
            {productsLoading ? (
              <div className="p-8 text-center text-gray-500">Loading products...</div>
            ) : products.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-12 h-12 mx-auto text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  No products found
                </h3>
                <p className="mt-2 text-gray-500">
                  {search
                    ? 'Try adjusting your search terms'
                    : `No ${activeTab} products for this client`}
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Product ID</th>
                      <th>Name</th>
                      <th>Stock</th>
                      <th>Usage</th>
                      <th>On Order</th>
                      <th>Weeks Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <ProductRow key={product.id} product={product} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {sectionTab === 'comments' && clientId && (
        <CommentThread
          entityType="client"
          entityId={clientId}
          title="Client Notes & Comments"
        />
      )}

      {sectionTab === 'activity' && clientId && (
        <ActivityFeed
          clientId={clientId}
          title="Client Activity"
          showFilters={true}
          limit={50}
        />
      )}

      {sectionTab === 'tasks' && clientId && (
        <TodoList
          clientId={clientId}
          title="Client Tasks"
          showCreateButton={true}
        />
      )}

      {/* Import Modal */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={resetImportModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  {importStep === 'upload' && 'Import Data'}
                  {importStep === 'preview' && 'Review Import'}
                  {importStep === 'processing' && 'Processing Import'}
                  {importStep === 'complete' && 'Import Complete'}
                </h2>
                <button
                  onClick={resetImportModal}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                {/* Upload Step */}
                {importStep === 'upload' && (
                  <div className="space-y-4">
                    <div
                      className={clsx(
                        'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
                        isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400',
                        selectedFile && 'border-green-500 bg-green-50'
                      )}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls,.tsv"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                      />

                      {selectedFile ? (
                        <div className="space-y-2">
                          <FileSpreadsheet className="w-12 h-12 mx-auto text-green-600" />
                          <p className="text-lg font-medium text-gray-900">{selectedFile.name}</p>
                          <p className="text-sm text-gray-500">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </p>
                          <button
                            onClick={() => setSelectedFile(null)}
                            className="text-sm text-red-600 hover:text-red-700"
                          >
                            Remove file
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="w-12 h-12 mx-auto text-gray-400" />
                          <p className="text-lg font-medium text-gray-900">
                            Drop your file here, or{' '}
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="text-primary-600 hover:text-primary-700"
                            >
                              browse
                            </button>
                          </p>
                          <p className="text-sm text-gray-500">
                            Supports CSV, XLSX, XLS, and TSV files up to 10MB
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3">
                      <button onClick={resetImportModal} className="btn-secondary">
                        Cancel
                      </button>
                      <button
                        onClick={handleUpload}
                        disabled={!selectedFile || uploadMutation.isPending}
                        className="btn-primary"
                      >
                        {uploadMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Uploading...
                          </>
                        ) : (
                          'Upload & Preview'
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Preview Step */}
                {importStep === 'preview' && importPreview && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-gray-900">{importPreview.rowCount}</p>
                        <p className="text-sm text-gray-500">Rows detected</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-gray-900">{importPreview.columns.length}</p>
                        <p className="text-sm text-gray-500">Columns mapped</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-gray-900 capitalize">{importPreview.detectedType}</p>
                        <p className="text-sm text-gray-500">Data type</p>
                      </div>
                    </div>

                    {/* Warnings */}
                    {importPreview.warnings.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="font-medium text-gray-900">Warnings</h3>
                        {importPreview.warnings.map((warning, i) => (
                          <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-amber-800">{warning.message}</p>
                              <p className="text-xs text-amber-600">Affects {warning.affectedRows} rows</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Column Mapping */}
                    <div className="space-y-2">
                      <h3 className="font-medium text-gray-900">Column Mapping</h3>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium text-gray-600">Source Column</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-600">Maps To</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-600">Confidence</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {importPreview.columns.slice(0, 10).map((col, i) => (
                              <tr key={i}>
                                <td className="px-4 py-2 text-gray-900">{col.source}</td>
                                <td className="px-4 py-2 text-gray-600">{col.target || '—'}</td>
                                <td className="px-4 py-2">
                                  <span className={clsx(
                                    'px-2 py-0.5 rounded text-xs font-medium',
                                    col.confidence > 0.8 ? 'bg-green-100 text-green-700' :
                                    col.confidence > 0.5 ? 'bg-amber-100 text-amber-700' :
                                    'bg-gray-100 text-gray-600'
                                  )}>
                                    {Math.round(col.confidence * 100)}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {importPreview.columns.length > 10 && (
                          <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500">
                            +{importPreview.columns.length - 10} more columns
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-3">
                      <button onClick={resetImportModal} className="btn-secondary">
                        Cancel
                      </button>
                      <button onClick={handleConfirmImport} className="btn-primary">
                        Confirm Import
                      </button>
                    </div>
                  </div>
                )}

                {/* Processing Step */}
                {importStep === 'processing' && (
                  <div className="text-center py-12">
                    <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto" />
                    <p className="mt-4 text-lg font-medium text-gray-900">Processing import...</p>
                    <p className="text-sm text-gray-500">This may take a few moments</p>
                  </div>
                )}

                {/* Complete Step */}
                {importStep === 'complete' && importResult && (
                  <div className="space-y-4">
                    <div className="text-center py-6">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                        <Check className="w-8 h-8 text-green-600" />
                      </div>
                      <h3 className="mt-4 text-xl font-semibold text-gray-900">Import Successful</h3>
                    </div>

                    {importResult.result && (
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-4 bg-green-50 rounded-lg">
                          <p className="text-2xl font-bold text-green-600">{importResult.result.created}</p>
                          <p className="text-sm text-gray-500">Created</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-lg">
                          <p className="text-2xl font-bold text-blue-600">{importResult.result.updated}</p>
                          <p className="text-sm text-gray-500">Updated</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-2xl font-bold text-gray-600">{importResult.result.skipped}</p>
                          <p className="text-sm text-gray-500">Skipped</p>
                        </div>
                      </div>
                    )}

                    {importResult.result?.errors && importResult.result.errors.length > 0 && (
                      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <h4 className="font-medium text-red-800 mb-2">Errors ({importResult.result.errors.length})</h4>
                        <ul className="text-sm text-red-600 space-y-1 max-h-32 overflow-y-auto">
                          {importResult.result.errors.slice(0, 10).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                          {importResult.result.errors.length > 10 && (
                            <li className="text-red-500">+{importResult.result.errors.length - 10} more errors</li>
                          )}
                        </ul>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button onClick={resetImportModal} className="btn-primary">
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatusPill({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 rounded-lg"
      style={{ backgroundColor: `${color}15` }}
    >
      <div
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="font-medium" style={{ color }}>
        {count}
      </span>
      <span className="text-gray-600">{label}</span>
    </div>
  );
}

function ProductRow({ product }: { product: ProductWithMetrics }) {
  const status = product.status;
  const stockPercent = status.percentOfReorderPoint;

  return (
    <tr className="cursor-pointer">
      <td>
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: status.color }}
          />
          <span className="text-xs font-medium uppercase text-gray-500">
            {STATUS_ICONS[status.level]} {status.level}
          </span>
        </div>
      </td>
      <td>
        <span className="font-mono text-sm">{product.productId}</span>
      </td>
      <td>
        <span className="font-medium">{product.name}</span>
      </td>
      <td>
        <div>
          <div className="text-sm">
            {product.currentStockPacks} pks ({product.currentStockUnits} units)
          </div>
          <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, stockPercent)}%`,
                backgroundColor: status.color,
              }}
            />
          </div>
        </div>
      </td>
      <td>
        <UsageTierBadge
          tier={(product as any).usageCalculationTier}
          confidence={(product as any).usageConfidence}
          monthlyUsage={(product as any).monthlyUsagePacks}
          showValue={true}
          compact={false}
        />
      </td>
      <td>
        {(product as any).hasOnOrder ? (
          <div className="group relative">
            <div className="flex items-center gap-1.5 text-blue-600">
              <ShoppingCart className="w-4 h-4" />
              <span className="font-medium text-sm">{(product as any).onOrderPacks} pks</span>
            </div>
            {/* Tooltip on hover showing order details */}
            {(product as any).pendingOrders && (product as any).pendingOrders.length > 0 && (
              <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded-lg py-2 px-3 -top-2 left-1/2 -translate-x-1/2 -translate-y-full w-48 shadow-lg">
                <p className="font-semibold mb-1">
                  {(product as any).pendingOrders.length} pending order{(product as any).pendingOrders.length > 1 ? 's' : ''}
                </p>
                {(product as any).pendingOrders.slice(0, 3).map((order: any) => (
                  <div key={order.orderId} className="flex justify-between text-gray-300">
                    <span className="capitalize">{order.status}</span>
                    <span>{order.quantityPacks} pks</span>
                  </div>
                ))}
                {(product as any).pendingOrders.length > 3 && (
                  <p className="text-gray-400 mt-1">+{(product as any).pendingOrders.length - 3} more...</p>
                )}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-4 border-transparent border-t-gray-900" />
              </div>
            )}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td>
        <span
          className={clsx(
            'font-medium',
            status.weeksRemaining < 2 && 'text-red-600',
            status.weeksRemaining >= 2 && status.weeksRemaining < 4 && 'text-amber-600',
            status.weeksRemaining >= 4 && 'text-gray-900'
          )}
        >
          {status.weeksRemaining === 999 ? '—' : `${status.weeksRemaining}w`}
        </span>
      </td>
    </tr>
  );
}
