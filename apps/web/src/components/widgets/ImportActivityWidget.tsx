import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Upload,
  Clock,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/api/client';
import { formatDistanceToNow } from 'date-fns';

// =============================================================================
// TYPES
// =============================================================================

interface ImportBatch {
  id: string;
  clientId: string;
  filename: string;
  importType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  rowCount: number;
  processedCount?: number;
  errorCount?: number;
  createdAt: string;
  completedAt?: string;
  client?: {
    name: string;
    code: string;
  };
  user?: {
    name: string;
  };
}

interface ImportHistoryResponse {
  data: ImportBatch[];
}

interface ImportActivityWidgetProps {
  clientId?: string;
  className?: string;
  showClientName?: boolean;
  limit?: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function getStatusConfig(status: ImportBatch['status']) {
  const configs = {
    pending: { color: 'text-amber-500 bg-amber-50', icon: Clock, label: 'Pending' },
    processing: { color: 'text-blue-500 bg-blue-50', icon: RefreshCw, label: 'Processing' },
    completed: { color: 'text-green-500 bg-green-50', icon: CheckCircle, label: 'Completed' },
    failed: { color: 'text-red-500 bg-red-50', icon: AlertCircle, label: 'Failed' },
  };
  return configs[status] || configs.pending;
}

function formatTimeAgo(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ImportActivityWidget({
  clientId,
  className,
  showClientName = false,
  limit = 5,
}: ImportActivityWidgetProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['import-history', clientId],
    queryFn: () => api.get<ImportHistoryResponse>('/imports/history'),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  const filteredImports = useMemo(() => {
    if (!data?.data) return [];
    let imports = data.data;
    if (clientId) {
      imports = imports.filter(i => i.clientId === clientId);
    }
    return imports.slice(0, limit);
  }, [data?.data, clientId, limit]);

  const lastImport = filteredImports[0];

  // Calculate stats
  const stats = useMemo(() => {
    const completed = filteredImports.filter(i => i.status === 'completed');
    const totalRows = completed.reduce((sum, i) => sum + (i.processedCount || i.rowCount || 0), 0);
    const totalErrors = completed.reduce((sum, i) => sum + (i.errorCount || 0), 0);
    return { completed: completed.length, totalRows, totalErrors };
  }, [filteredImports]);

  if (error) {
    return (
      <div className={clsx('bg-white rounded-xl border border-gray-200 p-4', className)}>
        <div className="text-center text-red-500">
          <AlertCircle className="w-6 h-6 mx-auto mb-2" />
          <p className="text-sm">Failed to load import activity</p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('bg-white rounded-xl border border-gray-200 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold text-gray-900">Import Activity</h3>
        </div>
        <Link
          to="/imports"
          className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          View all
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-16 bg-gray-100 rounded-lg" />
            <div className="h-12 bg-gray-100 rounded-lg" />
            <div className="h-12 bg-gray-100 rounded-lg" />
          </div>
        ) : filteredImports.length === 0 ? (
          <div className="text-center py-8">
            <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No imports yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Upload inventory or order data to get started
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Last Import Summary */}
            {lastImport && (
              <div className={clsx(
                'p-3 rounded-lg border',
                lastImport.status === 'completed' ? 'bg-green-50 border-green-200' :
                lastImport.status === 'failed' ? 'bg-red-50 border-red-200' :
                'bg-gray-50 border-gray-200'
              )}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Last Import</p>
                    <p className="font-medium text-gray-900">
                      {formatTimeAgo(lastImport.completedAt || lastImport.createdAt)}
                    </p>
                    {showClientName && lastImport.client && (
                      <p className="text-xs text-gray-500">{lastImport.client.name}</p>
                    )}
                  </div>
                  <div className={clsx(
                    'px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1',
                    getStatusConfig(lastImport.status).color
                  )}>
                    {(() => {
                      const Icon = getStatusConfig(lastImport.status).icon;
                      return <Icon className="w-3 h-3" />;
                    })()}
                    {getStatusConfig(lastImport.status).label}
                  </div>
                </div>

                {lastImport.status === 'completed' && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 bg-white rounded border border-gray-100">
                      <p className="text-lg font-bold text-gray-900">{lastImport.processedCount || lastImport.rowCount}</p>
                      <p className="text-[10px] text-gray-500 uppercase">Rows Processed</p>
                    </div>
                    <div className="p-2 bg-white rounded border border-gray-100">
                      <p className={clsx(
                        'text-lg font-bold',
                        (lastImport.errorCount || 0) > 0 ? 'text-red-600' : 'text-green-600'
                      )}>
                        {lastImport.errorCount || 0}
                      </p>
                      <p className="text-[10px] text-gray-500 uppercase">Errors</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Recent Imports List */}
            {filteredImports.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase">Recent</p>
                <div className="divide-y divide-gray-100">
                  {filteredImports.slice(1).map((importBatch) => {
                    const statusConfig = getStatusConfig(importBatch.status);
                    const Icon = statusConfig.icon;

                    return (
                      <div key={importBatch.id} className="py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={clsx('p-1.5 rounded', statusConfig.color)}>
                            <Icon className="w-3 h-3" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {importBatch.filename}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatTimeAgo(importBatch.createdAt)}
                              {showClientName && importBatch.client && (
                                <span> • {importBatch.client.name}</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="text-xs font-medium text-gray-900">
                            {importBatch.processedCount || importBatch.rowCount} rows
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="pt-3 border-t border-gray-100">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-sm font-bold text-gray-900">{stats.completed}</p>
                  <p className="text-[10px] text-gray-500">Imports</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{stats.totalRows.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500">Rows</p>
                </div>
                <div>
                  <p className={clsx(
                    'text-sm font-bold',
                    stats.totalErrors > 0 ? 'text-red-600' : 'text-green-600'
                  )}>
                    {stats.totalErrors}
                  </p>
                  <p className="text-[10px] text-gray-500">Errors</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ImportActivityWidget;
