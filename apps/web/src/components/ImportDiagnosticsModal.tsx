// =============================================================================
// IMPORT DIAGNOSTICS MODAL
// Full diagnostic display for import errors and reconciliation data
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Database,
  Lightbulb,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";
import { api } from "@/api/client";

// =============================================================================
// TYPES
// =============================================================================

interface ImportError {
  type?: string;
  message: string;
  severity?: string;
  details?: string;
  row_range?: string;
  chunk_number?: number;
  column?: string;
}

interface DiagnosticLog {
  level: string;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

interface Reconciliation {
  total_rows_seen?: number;
  rows_cleaned?: number;
  rows_inserted?: number;
  rows_updated?: number;
  rows_dropped?: number;
  chunk_count?: number;
  drop_reasons?: {
    invalid_dates?: number;
    missing_required?: number;
    data_validation?: number;
  };
}

interface DiagnosticsResponse {
  id: string;
  clientId: string;
  client: { name: string; code: string };
  status: string;
  importType: string;
  filename: string;
  filePath?: string;
  timing: {
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    duration?: number;
  };
  progress: {
    rowCount: number;
    processedCount: number;
    errorCount: number;
    progressPercent: number;
  };
  errors: ImportError[];
  diagnosticLogs: DiagnosticLog[];
  reconciliation?: Reconciliation;
  successRate: number;
  environment?: {
    pythonPath?: string;
    pythonError?: string;
    fileExists?: boolean;
    mappingFileExists?: boolean;
    fileStats?: { size: number; permissions: string };
    uploadsDir?: string;
    monorepoRoot?: string;
    cwd?: string;
    databaseUrlSet?: boolean;
  };
  recommendations: string[];
}

interface ImportDiagnosticsModalProps {
  isOpen: boolean;
  importId: string | null;
  onClose: () => void;
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: typeof CheckCircle }> = {
    completed: { color: "bg-green-100 text-green-800", icon: CheckCircle },
    completed_with_errors: { color: "bg-amber-100 text-amber-800", icon: AlertTriangle },
    failed: { color: "bg-red-100 text-red-800", icon: XCircle },
    processing: { color: "bg-blue-100 text-blue-800", icon: RefreshCw },
    pending: { color: "bg-gray-100 text-gray-800", icon: Info },
  };

  const { color, icon: Icon } = config[status] || config.pending;

  return (
    <span className={clsx("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium", color)}>
      <Icon className="w-4 h-4" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ErrorItem({ error }: { error: ImportError }) {
  const [expanded, setExpanded] = useState(false);

  const severityColor = {
    error: "border-red-200 bg-red-50",
    warning: "border-amber-200 bg-amber-50",
    info: "border-blue-200 bg-blue-50",
  }[error.severity || "error"] || "border-red-200 bg-red-50";

  const severityIcon = {
    error: <XCircle className="w-4 h-4 text-red-500" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    info: <Info className="w-4 h-4 text-blue-500" />,
  }[error.severity || "error"] || <XCircle className="w-4 h-4 text-red-500" />;

  return (
    <div className={clsx("border rounded-lg p-3", severityColor)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{severityIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">
              {error.type || "Error"}
            </span>
            {error.row_range && (
              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                rows {error.row_range}
              </span>
            )}
            {error.chunk_number !== undefined && (
              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                chunk #{error.chunk_number}
              </span>
            )}
            {error.column && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                column: {error.column}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 mt-1">{error.message}</p>

          {error.details && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mt-2"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Technical details
            </button>
          )}

          {expanded && error.details && (
            <pre className="mt-2 p-2 bg-gray-800 text-gray-200 text-xs rounded overflow-x-auto">
              {error.details}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function ReconciliationCard({ reconciliation }: { reconciliation: Reconciliation }) {
  const dropReasons = reconciliation.drop_reasons || {};
  const totalDropped = reconciliation.rows_dropped || 0;

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Database className="w-4 h-4 text-gray-500" />
        <h4 className="font-medium text-gray-900">Data Reconciliation</h4>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {reconciliation.total_rows_seen?.toLocaleString() || 0}
          </div>
          <div className="text-xs text-gray-500">Total Rows</div>
        </div>
        <div className="text-center p-3 bg-white rounded-lg border border-green-200">
          <div className="text-2xl font-bold text-green-600">
            {reconciliation.rows_inserted?.toLocaleString() || 0}
          </div>
          <div className="text-xs text-gray-500">Inserted</div>
        </div>
        <div className="text-center p-3 bg-white rounded-lg border border-blue-200">
          <div className="text-2xl font-bold text-blue-600">
            {reconciliation.rows_updated?.toLocaleString() || 0}
          </div>
          <div className="text-xs text-gray-500">Updated</div>
        </div>
        <div className="text-center p-3 bg-white rounded-lg border border-red-200">
          <div className="text-2xl font-bold text-red-600">
            {totalDropped.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">Dropped</div>
        </div>
      </div>

      {totalDropped > 0 && Object.keys(dropReasons).length > 0 && (
        <div className="border-t border-gray-200 pt-3">
          <div className="text-sm font-medium text-gray-700 mb-2">Drop Reasons:</div>
          <div className="space-y-1">
            {dropReasons.invalid_dates && dropReasons.invalid_dates > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Invalid dates</span>
                <span className="font-medium text-red-600">{dropReasons.invalid_dates}</span>
              </div>
            )}
            {dropReasons.missing_required && dropReasons.missing_required > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Missing required fields</span>
                <span className="font-medium text-red-600">{dropReasons.missing_required}</span>
              </div>
            )}
            {dropReasons.data_validation && dropReasons.data_validation > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Data validation errors</span>
                <span className="font-medium text-red-600">{dropReasons.data_validation}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ImportDiagnosticsModal({ isOpen, importId, onClose }: ImportDiagnosticsModalProps) {
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [showDiagnosticLogs, setShowDiagnosticLogs] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<DiagnosticsResponse>({
    queryKey: ["import-diagnostics", importId],
    queryFn: async () => {
      return api.get<DiagnosticsResponse>(`/imports/${importId}/diagnostics`);
    },
    enabled: isOpen && !!importId,
  });

  const handleExportLog = () => {
    if (!data) return;

    const exportData = {
      importId: data.id,
      filename: data.filename,
      status: data.status,
      timing: data.timing,
      progress: data.progress,
      errors: data.errors,
      diagnosticLogs: data.diagnosticLogs,
      reconciliation: data.reconciliation,
      recommendations: data.recommendations,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-diagnostics-${data.id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const errorsToShow = showAllErrors ? data?.errors : data?.errors?.slice(0, 5);
  const hasMoreErrors = (data?.errors?.length || 0) > 5;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Import Diagnostics</h2>
                  {data && (
                    <p className="text-sm text-gray-500 truncate max-w-md">
                      {data.filename}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refetch()}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Refresh diagnostics"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  <p className="font-medium">Failed to load diagnostics</p>
                  <p className="text-sm mt-1">{(error as Error).message}</p>
                </div>
              )}

              {data && (
                <>
                  {/* Status & Progress */}
                  <div className="flex flex-wrap items-center gap-4">
                    <StatusBadge status={data.status} />
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">{data.successRate?.toFixed(1) || 0}%</span> success rate
                    </div>
                    <div className="text-sm text-gray-500">
                      {data.progress.processedCount.toLocaleString()} / {data.progress.rowCount.toLocaleString()} rows
                    </div>
                    {data.timing.duration && (
                      <div className="text-sm text-gray-500">
                        Duration: {(data.timing.duration / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={clsx(
                        "h-2 rounded-full transition-all",
                        data.status === "failed" ? "bg-red-500" :
                        data.status === "completed_with_errors" ? "bg-amber-500" :
                        "bg-green-500"
                      )}
                      style={{ width: `${data.progress.progressPercent}%` }}
                    />
                  </div>

                  {/* Errors Section */}
                  {data.errors && data.errors.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-red-500" />
                          Errors ({data.errors.length})
                        </h3>
                      </div>

                      <div className="space-y-2">
                        {errorsToShow?.map((err, idx) => (
                          <ErrorItem key={idx} error={err} />
                        ))}
                      </div>

                      {hasMoreErrors && (
                        <button
                          onClick={() => setShowAllErrors(!showAllErrors)}
                          className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {showAllErrors ? "Show less" : `Show all ${data.errors.length} errors`}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Reconciliation */}
                  {data.reconciliation && (
                    <ReconciliationCard reconciliation={data.reconciliation} />
                  )}

                  {/* Recommendations */}
                  {data.recommendations && data.recommendations.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb className="w-5 h-5 text-blue-600" />
                        <h4 className="font-medium text-blue-900">Recommendations</h4>
                      </div>
                      <ul className="space-y-2">
                        {data.recommendations.map((rec, idx) => (
                          <li key={idx} className="text-sm text-blue-800 flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Diagnostic Logs (Collapsible) */}
                  {data.diagnosticLogs && data.diagnosticLogs.length > 0 && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setShowDiagnosticLogs(!showDiagnosticLogs)}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <span className="font-medium text-gray-700">
                          Diagnostic Logs ({data.diagnosticLogs.length})
                        </span>
                        {showDiagnosticLogs ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                      </button>

                      {showDiagnosticLogs && (
                        <div className="p-4 max-h-64 overflow-y-auto bg-gray-900">
                          <pre className="text-xs text-gray-300 font-mono">
                            {data.diagnosticLogs.map((log, idx) => (
                              <div key={idx} className="mb-1">
                                <span className={clsx(
                                  log.level === "error" && "text-red-400",
                                  log.level === "warning" && "text-amber-400",
                                  log.level === "info" && "text-blue-400",
                                  log.level === "debug" && "text-gray-500",
                                )}>
                                  [{log.level.toUpperCase()}]
                                </span>
                                <span className="text-gray-500 ml-2">
                                  {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                                <span className="text-gray-300 ml-2">{log.message}</span>
                              </div>
                            ))}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleExportLog}
                disabled={!data}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Export Log
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default ImportDiagnosticsModal;
