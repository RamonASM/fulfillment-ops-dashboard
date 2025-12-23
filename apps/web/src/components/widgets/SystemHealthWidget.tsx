import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  PlayCircle,
  ChevronRight,
  GitCommit,
  Server,
} from 'lucide-react';
import { api } from '@/api/client';
import { formatDistanceToNow } from 'date-fns';

// =============================================================================
// TYPES
// =============================================================================

interface DiagnosticSummary {
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  isStale: boolean;
  lastRun: {
    id: string;
    createdAt: string;
    trigger: string;
    passed: number;
    failed: number;
    warnings: number;
    duration: number | null;
    gitCommit: string | null;
  } | null;
  recentFailures: Array<{
    id: string;
    category: string;
    check: string;
    message: string;
  }>;
  recommendations: string[] | null;
}

interface SystemHealthWidgetProps {
  className?: string;
  compact?: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

function getStatusConfig(status: DiagnosticSummary['status']) {
  const configs = {
    healthy: {
      color: 'text-green-600 bg-green-50 border-green-200',
      icon: CheckCircle,
      label: 'Healthy',
      description: 'All systems operational',
    },
    warning: {
      color: 'text-amber-600 bg-amber-50 border-amber-200',
      icon: AlertTriangle,
      label: 'Warning',
      description: 'Some issues detected',
    },
    critical: {
      color: 'text-red-600 bg-red-50 border-red-200',
      icon: XCircle,
      label: 'Critical',
      description: 'Critical issues found',
    },
    unknown: {
      color: 'text-gray-600 bg-gray-50 border-gray-200',
      icon: Clock,
      label: 'Unknown',
      description: 'No diagnostic data',
    },
  };
  return configs[status];
}

function formatTimeAgo(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

function formatDuration(ms: number | null) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SystemHealthWidget({ className, compact = false }: SystemHealthWidgetProps) {
  const queryClient = useQueryClient();

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['diagnostic-summary'],
    queryFn: () => api.get<DiagnosticSummary>('/diagnostics/summary'),
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  const runDiagnostic = useMutation({
    mutationFn: () => api.post('/diagnostics/run'),
    onSuccess: () => {
      // Invalidate after a delay to allow the diagnostic to start
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['diagnostic-summary'] });
      }, 5000);
    },
  });

  const statusConfig = useMemo(() => {
    return getStatusConfig(summary?.status || 'unknown');
  }, [summary?.status]);

  if (isLoading) {
    return (
      <div className={clsx('bg-white rounded-lg shadow-sm border p-4', className)}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-20 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={clsx('bg-white rounded-lg shadow-sm border p-4', className)}>
        <div className="flex items-center gap-2 text-red-600">
          <XCircle size={20} />
          <span className="text-sm">Failed to load system health</span>
        </div>
      </div>
    );
  }

  const StatusIcon = statusConfig.icon;

  return (
    <div className={clsx('bg-white rounded-lg shadow-sm border', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={18} className="text-gray-500" />
          <h3 className="font-medium text-gray-900">System Health</h3>
        </div>
        <button
          onClick={() => runDiagnostic.mutate()}
          disabled={runDiagnostic.isPending}
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
            runDiagnostic.isPending
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
          )}
        >
          {runDiagnostic.isPending ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <PlayCircle size={14} />
          )}
          {runDiagnostic.isPending ? 'Running...' : 'Run Diagnostic'}
        </button>
      </div>

      {/* Status Banner */}
      <div className={clsx('px-4 py-3 border-b', statusConfig.color)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusIcon size={24} />
            <div>
              <div className="font-semibold">{statusConfig.label}</div>
              <div className="text-sm opacity-80">{statusConfig.description}</div>
            </div>
          </div>
          {summary?.isStale && (
            <div className="flex items-center gap-1 text-xs bg-white/50 px-2 py-1 rounded">
              <Clock size={12} />
              Stale
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      {summary?.lastRun && (
        <div className="px-4 py-3 border-b">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">{summary.lastRun.passed}</div>
              <div className="text-xs text-gray-500">Passed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600">{summary.lastRun.warnings}</div>
              <div className="text-xs text-gray-500">Warnings</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{summary.lastRun.failed}</div>
              <div className="text-xs text-gray-500">Failed</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Failures */}
      {!compact && summary?.recentFailures && summary.recentFailures.length > 0 && (
        <div className="px-4 py-3 border-b">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Issues</h4>
          <div className="space-y-2">
            {summary.recentFailures.slice(0, 3).map((failure) => (
              <div
                key={failure.id}
                className="flex items-start gap-2 text-sm bg-red-50 rounded p-2"
              >
                <XCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-gray-900">{failure.check}</div>
                  <div className="text-gray-600 text-xs">{failure.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      {summary?.lastRun && (
        <div className="px-4 py-3 text-xs text-gray-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Clock size={12} />
                <span>{formatTimeAgo(summary.lastRun.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity size={12} />
                <span>{formatDuration(summary.lastRun.duration)}</span>
              </div>
              {summary.lastRun.gitCommit && (
                <div className="flex items-center gap-1">
                  <GitCommit size={12} />
                  <span className="font-mono">{summary.lastRun.gitCommit.slice(0, 7)}</span>
                </div>
              )}
            </div>
            <div className="text-gray-400 capitalize">{summary.lastRun.trigger}</div>
          </div>
        </div>
      )}

      {/* View Details Link */}
      {!compact && (
        <div className="px-4 py-2 bg-gray-50 border-t">
          <a
            href={`/diagnostics/${summary?.lastRun?.id || ''}`}
            className="flex items-center justify-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          >
            View Full Report
            <ChevronRight size={14} />
          </a>
        </div>
      )}
    </div>
  );
}

export default SystemHealthWidget;
