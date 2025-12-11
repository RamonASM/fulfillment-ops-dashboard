import { useState, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileSpreadsheet, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/api/client';
import toast from 'react-hot-toast';

// =============================================================================
// TYPES
// =============================================================================

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

export interface ImportModalProps {
  clientId: string;
  clientName?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type ImportStep = 'upload' | 'preview' | 'processing' | 'complete';

// =============================================================================
// COMPONENT
// =============================================================================

export function ImportModal({ clientId, clientName, isOpen, onClose, onSuccess }: ImportModalProps) {
  const [importStep, setImportStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return api.upload<ImportPreview>('/imports/upload', file, { clientId });
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
      onSuccess?.();
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

  const resetAndClose = () => {
    setImportStep('upload');
    setSelectedFile(null);
    setImportPreview(null);
    setImportResult(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={resetAndClose}
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
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {importStep === 'upload' && 'Import Data'}
                  {importStep === 'preview' && 'Review Import'}
                  {importStep === 'processing' && 'Processing Import'}
                  {importStep === 'complete' && 'Import Complete'}
                </h2>
                {clientName && (
                  <p className="text-sm text-gray-500">for {clientName}</p>
                )}
              </div>
              <button
                onClick={resetAndClose}
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
                      'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
                      isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400',
                      selectedFile && 'border-green-500 bg-green-50'
                    )}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => !selectedFile && fileInputRef.current?.click()}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                          }}
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
                          <span className="text-primary-600 hover:text-primary-700">
                            browse
                          </span>
                        </p>
                        <p className="text-sm text-gray-500">
                          Supports CSV, XLSX, XLS, and TSV files up to 10MB
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3">
                    <button onClick={resetAndClose} className="btn-secondary">
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
                    <button onClick={resetAndClose} className="btn-secondary">
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
                    <button onClick={resetAndClose} className="btn-primary">
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
  );
}

export default ImportModal;
