import { useState, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileSpreadsheet, AlertTriangle, Check, Loader2, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/api/client';
import toast from 'react-hot-toast';

// =============================================================================
// TYPES
// =============================================================================

interface ColumnMapping {
  source: string;
  target: string;
  confidence: number;
}

interface ImportPreview {
  importId: string;
  filename?: string;
  detectedType: string;
  rowCount: number;
  columns: ColumnMapping[];
  sampleRows: Record<string, unknown>[];
  warnings: { type: string; message: string; affectedRows: number }[];
}

// Available target fields for mapping
const INVENTORY_TARGET_FIELDS = [
  { value: '', label: 'Skip this column' },
  { value: 'productId', label: 'Product ID / SKU' },
  { value: 'name', label: 'Product Name' },
  { value: 'currentStockPacks', label: 'Current Stock (Packs)' },
  { value: 'packSize', label: 'Pack Size / Units per Pack' },
  { value: 'notificationPoint', label: 'Reorder Point' },
  { value: 'itemType', label: 'Item Type (evergreen/event)' },
];

const ORDER_TARGET_FIELDS = [
  { value: '', label: 'Skip this column' },
  { value: 'productId', label: 'Product ID / SKU' },
  { value: 'productName', label: 'Product Name' },
  { value: 'orderId', label: 'Order ID / PO Number' },
  { value: 'dateSubmitted', label: 'Order Date' },
  { value: 'quantityUnits', label: 'Quantity (Units)' },
  { value: 'shipToCompany', label: 'Ship To Company' },
  { value: 'shipToLocation', label: 'Ship To Location' },
  { value: 'orderStatus', label: 'Order Status' },
];

interface MultiImportResponse {
  count: number;
  previews: ImportPreview[];
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [importPreviews, setImportPreviews] = useState<ImportPreview[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [editedMappings, setEditedMappings] = useState<Record<string, ColumnMapping[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload mutation (single file)
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return api.upload<ImportPreview>('/imports/upload', file, { clientId });
    },
    onSuccess: (data) => {
      setImportPreviews([data]);
      setCurrentPreviewIndex(0);
      setImportStep('preview');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload file');
    },
  });

  // Upload mutation (multiple files)
  const uploadMultipleMutation = useMutation({
    mutationFn: async (files: File[]) => {
      return api.uploadMultiple<MultiImportResponse>('/imports/upload-multiple', files, { clientId });
    },
    onSuccess: (data) => {
      setImportPreviews(data.previews);
      setCurrentPreviewIndex(0);
      setImportStep('preview');
      toast.success(`${data.count} file(s) uploaded successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload files');
    },
  });

  // Get the current mappings for a preview (edited or original)
  const getMappingsForPreview = (preview: ImportPreview): ColumnMapping[] => {
    return editedMappings[preview.importId] || preview.columns;
  };

  // Update a single column mapping
  const updateColumnMapping = (importId: string, sourceColumn: string, newTarget: string) => {
    setEditedMappings(prev => {
      const preview = importPreviews.find(p => p.importId === importId);
      if (!preview) return prev;

      const currentMappings = prev[importId] || preview.columns;
      const updatedMappings = currentMappings.map(col =>
        col.source === sourceColumn
          ? { ...col, target: newTarget, confidence: newTarget ? 1 : 0 }
          : col
      );

      return { ...prev, [importId]: updatedMappings };
    });
  };

  // Confirm import mutation
  const confirmMutation = useMutation({
    mutationFn: async (importId: string) => {
      const preview = importPreviews.find(p => p.importId === importId);
      if (!preview) throw new Error('Preview not found');

      const mappings = getMappingsForPreview(preview);
      return api.post<ImportResult>(`/imports/${importId}/confirm`, {
        columnMapping: mappings,
      });
    },
    onSuccess: (data) => {
      setImportResults(prev => [...prev, data]);

      // Check if there are more previews to process
      if (currentPreviewIndex < importPreviews.length - 1) {
        setCurrentPreviewIndex(prev => prev + 1);
      } else {
        setImportStep('complete');
        onSuccess?.();
        toast.success('All imports completed successfully');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process import');
    },
  });

  // File handling
  const handleFileSelect = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.tsv'];

    const validFiles = fileArray.filter(file => {
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (!allowedTypes.includes(ext)) {
        toast.error(`Invalid file type: ${file.name}. Only CSV, XLSX, XLS, and TSV files are allowed.`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
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
    if (selectedFiles.length === 1) {
      uploadMutation.mutate(selectedFiles[0]);
    } else if (selectedFiles.length > 1) {
      uploadMultipleMutation.mutate(selectedFiles);
    }
  };

  const handleConfirmImport = () => {
    const currentPreview = importPreviews[currentPreviewIndex];
    if (currentPreview) {
      setImportStep('processing');
      confirmMutation.mutate(currentPreview.importId);
    }
  };

  const handleConfirmAll = async () => {
    setImportStep('processing');
    for (const preview of importPreviews) {
      await confirmMutation.mutateAsync(preview.importId);
    }
  };

  const resetAndClose = () => {
    setImportStep('upload');
    setSelectedFiles([]);
    setImportPreviews([]);
    setCurrentPreviewIndex(0);
    setImportResults([]);
    setEditedMappings({});
    onClose();
  };

  const isUploading = uploadMutation.isPending || uploadMultipleMutation.isPending;
  const currentPreview = importPreviews[currentPreviewIndex];

  // Calculate totals for complete step
  const totals = importResults.reduce((acc, result) => ({
    created: acc.created + (result.result?.created || 0),
    updated: acc.updated + (result.result?.updated || 0),
    skipped: acc.skipped + (result.result?.skipped || 0),
    errors: [...acc.errors, ...(result.result?.errors || [])],
  }), { created: 0, updated: 0, skipped: 0, errors: [] as string[] });

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
                  {importStep === 'preview' && `Review Import${importPreviews.length > 1 ? ` (${currentPreviewIndex + 1}/${importPreviews.length})` : ''}`}
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
                      selectedFiles.length > 0 && 'border-green-500 bg-green-50'
                    )}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls,.tsv"
                      multiple
                      className="hidden"
                      onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                    />

                    {selectedFiles.length > 0 ? (
                      <div className="space-y-2">
                        <FileSpreadsheet className="w-12 h-12 mx-auto text-green-600" />
                        <p className="text-lg font-medium text-gray-900">
                          {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                        </p>
                        <p className="text-sm text-gray-500">
                          Click to add more files
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-12 h-12 mx-auto text-gray-400" />
                        <p className="text-lg font-medium text-gray-900">
                          Drop your files here, or{' '}
                          <span className="text-primary-600 hover:text-primary-700">
                            browse
                          </span>
                        </p>
                        <p className="text-sm text-gray-500">
                          Supports CSV, XLSX, XLS, and TSV files up to 50MB each
                        </p>
                        <p className="text-xs text-gray-400">
                          You can select multiple files
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Selected Files List */}
                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-gray-900">Selected Files</h3>
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-40 overflow-y-auto">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-3">
                              <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                              <div>
                                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                                <p className="text-xs text-gray-500">
                                  {(file.size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(index);
                              }}
                              className="p-1 hover:bg-red-50 rounded text-red-500 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button onClick={resetAndClose} className="btn-secondary">
                      Cancel
                    </button>
                    <button
                      onClick={handleUpload}
                      disabled={selectedFiles.length === 0 || isUploading}
                      className="btn-primary"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Uploading...
                        </>
                      ) : (
                        `Upload${selectedFiles.length > 1 ? ` ${selectedFiles.length} Files` : ''} & Preview`
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Preview Step */}
              {importStep === 'preview' && currentPreview && (
                <div className="space-y-4">
                  {/* File indicator for multiple files */}
                  {importPreviews.length > 1 && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                      <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-blue-900">
                        {currentPreview.filename || `File ${currentPreviewIndex + 1}`}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">{currentPreview.rowCount}</p>
                      <p className="text-sm text-gray-500">Rows detected</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">{currentPreview.columns.length}</p>
                      <p className="text-sm text-gray-500">Columns mapped</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900 capitalize">{currentPreview.detectedType}</p>
                      <p className="text-sm text-gray-500">Data type</p>
                    </div>
                  </div>

                  {/* Warnings */}
                  {currentPreview.warnings.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-gray-900">Warnings</h3>
                      {currentPreview.warnings.map((warning, i) => (
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
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900">Column Mapping</h3>
                      <p className="text-xs text-gray-500">Click on a mapping to change it</p>
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-600">Source Column</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600">Maps To</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600 w-24">Confidence</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {getMappingsForPreview(currentPreview).map((col, i) => {
                            const targetFields = currentPreview.detectedType === 'order'
                              ? ORDER_TARGET_FIELDS
                              : INVENTORY_TARGET_FIELDS;

                            return (
                              <tr key={i} className={clsx(col.confidence < 0.5 && 'bg-amber-50')}>
                                <td className="px-4 py-2 text-gray-900">
                                  <span className="font-medium">{col.source}</span>
                                </td>
                                <td className="px-4 py-2">
                                  <select
                                    value={col.target || ''}
                                    onChange={(e) => updateColumnMapping(
                                      currentPreview.importId,
                                      col.source,
                                      e.target.value
                                    )}
                                    className={clsx(
                                      'w-full px-2 py-1 text-sm border rounded-md',
                                      col.confidence < 0.5
                                        ? 'border-amber-300 bg-amber-50 focus:border-amber-500 focus:ring-amber-500'
                                        : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500'
                                    )}
                                  >
                                    {targetFields.map((field) => (
                                      <option key={field.value} value={field.value}>
                                        {field.label}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-4 py-2">
                                  <span className={clsx(
                                    'px-2 py-0.5 rounded text-xs font-medium',
                                    col.confidence > 0.8 ? 'bg-green-100 text-green-700' :
                                    col.confidence > 0.5 ? 'bg-amber-100 text-amber-700' :
                                    'bg-red-100 text-red-700'
                                  )}>
                                    {Math.round(col.confidence * 100)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {getMappingsForPreview(currentPreview).some(col => col.confidence < 0.5) && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Low confidence mappings are highlighted. Please review and adjust as needed.
                      </p>
                    )}
                  </div>

                  <div className="flex justify-between gap-3">
                    <button onClick={resetAndClose} className="btn-secondary">
                      Cancel
                    </button>
                    <div className="flex gap-2">
                      {importPreviews.length > 1 && (
                        <button onClick={handleConfirmAll} className="btn-secondary">
                          Import All ({importPreviews.length})
                        </button>
                      )}
                      <button onClick={handleConfirmImport} className="btn-primary">
                        {importPreviews.length > 1 ? 'Import This File' : 'Confirm Import'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Processing Step */}
              {importStep === 'processing' && (
                <div className="text-center py-12">
                  <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto" />
                  <p className="mt-4 text-lg font-medium text-gray-900">Processing import...</p>
                  <p className="text-sm text-gray-500">
                    {importPreviews.length > 1
                      ? `Processing file ${importResults.length + 1} of ${importPreviews.length}`
                      : 'This may take a few moments'}
                  </p>
                </div>
              )}

              {/* Complete Step */}
              {importStep === 'complete' && (
                <div className="space-y-4">
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                      <Check className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="mt-4 text-xl font-semibold text-gray-900">
                      {importResults.length > 1 ? `${importResults.length} Imports Successful` : 'Import Successful'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{totals.created}</p>
                      <p className="text-sm text-gray-500">Created</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">{totals.updated}</p>
                      <p className="text-sm text-gray-500">Updated</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-600">{totals.skipped}</p>
                      <p className="text-sm text-gray-500">Skipped</p>
                    </div>
                  </div>

                  {totals.errors.length > 0 && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <h4 className="font-medium text-red-800 mb-2">Errors ({totals.errors.length})</h4>
                      <ul className="text-sm text-red-600 space-y-1 max-h-32 overflow-y-auto">
                        {totals.errors.slice(0, 10).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {totals.errors.length > 10 && (
                          <li className="text-red-500">+{totals.errors.length - 10} more errors</li>
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
