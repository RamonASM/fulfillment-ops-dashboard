import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  Check,
  Loader2,
  Trash2,
  RefreshCw,
  Lock,
  Unlock,
  Clock,
  ExternalLink,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import toast from "react-hot-toast";
import { MappingComboBox, TargetField } from "@/components/ui/MappingComboBox";
import { ImportTypeSelector } from "@/components/ui/ImportTypeSelector";

// =============================================================================
// TYPES
// =============================================================================

interface ColumnMapping {
  source: string;
  mapsTo: string; // Backend uses mapsTo
  target?: string; // Alias for compatibility
  confidence: number;
  confidenceLevel?: "high" | "medium" | "low" | "none";
  warnings?: string[];
  detectedDataType?:
    | "numeric"
    | "numeric_positive"
    | "numeric_integer"
    | "date"
    | "alphanumeric"
    | "text"
    | "boolean"
    | "empty";
  isCustomField?: boolean;
  isLearned?: boolean; // Whether this mapping was boosted by learned user corrections
}

interface ValidationSummary {
  isValid: boolean;
  totalErrors: number;
  totalWarnings: number;
  summary: {
    errorsByField: Record<string, number>;
    warningsByField: Record<string, number>;
  };
  sampleIssues?: string[];
}

interface ImportDetectionResult {
  confidence: "high" | "medium" | "low";
  inventoryMatches: number;
  orderMatches: number;
  ambiguousMatches: number;
  matchedInventoryHeaders: string[];
  matchedOrderHeaders: string[];
}

interface ImportPreview {
  importId: string;
  filename?: string;
  detectedType: "inventory" | "orders" | "both";
  selectedType?: "inventory" | "orders" | "both" | null;
  userOverride?: boolean;
  requiresTypeSelection?: boolean;
  message?: string;
  detection?: ImportDetectionResult;
  rowCount: number;
  columns: ColumnMapping[];
  sampleRows: Record<string, unknown>[];
  warnings: { type: string; message: string; affectedRows: number }[];
  validation?: ValidationSummary;
}

// Available target fields for mapping - CORE fields (stored in database columns)
const INVENTORY_TARGET_FIELDS = [
  { value: "", label: "Skip this column", category: "skip" },
  { value: "productId", label: "Product ID / SKU", category: "core" },
  { value: "name", label: "Product Name", category: "core" },
  {
    value: "currentStockPacks",
    label: "Current Stock (Packs)",
    category: "core",
  },
  { value: "packSize", label: "Pack Size / Units per Pack", category: "core" },
  { value: "notificationPoint", label: "Reorder Point", category: "core" },
  { value: "itemType", label: "Item Type (evergreen/event)", category: "core" },
];

// Extended fields (stored in metadata.customFields)
const EXTENDED_INVENTORY_FIELDS = [
  { value: "unitCost", label: "Unit Cost", category: "financial" },
  { value: "listPrice", label: "List/Retail Price", category: "financial" },
  { value: "totalValue", label: "Total Value", category: "financial" },
  { value: "currency", label: "Currency", category: "financial" },
  { value: "vendorName", label: "Vendor/Supplier Name", category: "vendor" },
  { value: "vendorCode", label: "Vendor Code", category: "vendor" },
  { value: "vendorSku", label: "Vendor SKU", category: "vendor" },
  { value: "leadTimeDays", label: "Lead Time (Days)", category: "vendor" },
  {
    value: "minimumOrderQuantity",
    label: "Minimum Order Qty",
    category: "vendor",
  },
  { value: "warehouse", label: "Warehouse", category: "logistics" },
  { value: "binLocation", label: "Bin Location", category: "logistics" },
  { value: "weight", label: "Weight", category: "logistics" },
  { value: "dimensions", label: "Dimensions", category: "logistics" },
  {
    value: "countryOfOrigin",
    label: "Country of Origin",
    category: "logistics",
  },
  { value: "productCategory", label: "Category", category: "classification" },
  { value: "subcategory", label: "Subcategory", category: "classification" },
  { value: "brand", label: "Brand", category: "classification" },
  { value: "department", label: "Department", category: "classification" },
  { value: "productStatus", label: "Product Status", category: "status" },
  { value: "notes", label: "Notes/Comments", category: "other" },
];

// All inventory fields combined
const ALL_INVENTORY_FIELDS = [
  ...INVENTORY_TARGET_FIELDS,
  {
    value: "_separator_",
    label: "── Extended Fields (saved to metadata) ──",
    category: "separator",
    disabled: true,
  },
  ...EXTENDED_INVENTORY_FIELDS,
];

// =============================================================================
// REQUIRED FIELDS PER IMPORT TYPE
// These fields MUST be mapped for analytics to work correctly.
// Blocking imports without these prevents broken analytics with zero values.
// =============================================================================
const REQUIRED_FIELDS_BY_TYPE = {
  inventory: [
    { field: "productId", label: "Product ID / SKU", reason: "Products cannot be created without an identifier" },
    { field: "currentStockPacks", label: "Current Stock", reason: "Stock levels required for inventory tracking" },
  ],
  orders: [
    { field: "productId", label: "Product ID / SKU", reason: "Orders cannot be matched to products without identifier" },
    // At least one of quantityUnits or quantityPacks must be mapped
    { field: "quantityUnits", altField: "quantityPacks", label: "Quantity", reason: "Usage analytics require quantity data" },
  ],
} as const;

const ORDER_TARGET_FIELDS = [
  { value: "", label: "Skip this column", category: "skip" },
  // Core order fields
  { value: "productId", label: "Product ID / SKU", category: "Product" },
  { value: "productName", label: "Product Name", category: "Product" },
  {
    value: "customizedProductId",
    label: "Customized Product ID",
    category: "Product",
  },
  { value: "orderId", label: "Order ID / PO Number", category: "Order" },
  { value: "orderType", label: "Order Type", category: "Order" },
  { value: "dateSubmitted", label: "Order Date", category: "Order" },
  { value: "orderStatus", label: "Order Status", category: "Order" },
  // Quantity fields
  { value: "quantityUnits", label: "Quantity (Units)", category: "Quantity" },
  { value: "quantityPacks", label: "Quantity (Packs)", category: "Quantity" },
  { value: "totalQuantity", label: "Total Quantity", category: "Quantity" },
  {
    value: "quantityMultiplier",
    label: "Quantity Multiplier",
    category: "Quantity",
  },
  // Shipping address fields
  { value: "shipToCompany", label: "Ship To Company", category: "Address" },
  { value: "shipToStreet1", label: "Ship To Street", category: "Address" },
  { value: "shipToStreet2", label: "Ship To Street 2", category: "Address" },
  { value: "shipToCity", label: "Ship To City", category: "Address" },
  { value: "shipToState", label: "Ship To State", category: "Address" },
  { value: "shipToZip", label: "Ship To Zip", category: "Address" },
  { value: "shipToCountry", label: "Ship To Country", category: "Address" },
  { value: "shipToLocation", label: "Ship To Location", category: "Address" },
  { value: "shipToIdentifier", label: "Location ID/Code", category: "Address" },
  // Person name fields (separate from address!)
  {
    value: "shipToFirstName",
    label: "Ship To First Name",
    category: "Contact",
  },
  { value: "shipToLastName", label: "Ship To Last Name", category: "Contact" },
  { value: "fullName", label: "Full Name", category: "Contact" },
  // Contact fields
  { value: "orderedBy", label: "Ordered By / User", category: "Contact" },
  { value: "contactName", label: "Contact Name", category: "Contact" },
  {
    value: "contactFirstName",
    label: "Contact First Name",
    category: "Contact",
  },
  { value: "contactLastName", label: "Contact Last Name", category: "Contact" },
  { value: "shipToPhone", label: "Phone", category: "Contact" },
  { value: "contactPhone", label: "Contact Phone", category: "Contact" },
  { value: "shipToEmail", label: "Email", category: "Contact" },
  { value: "contactEmail", label: "Contact Email", category: "Contact" },
  { value: "customerId", label: "Customer ID", category: "Contact" },
  // Financial fields
  { value: "unitPrice", label: "Unit Price", category: "Financial" },
  { value: "extendedPrice", label: "Extended Price", category: "Financial" },
  { value: "discount", label: "Discount", category: "Financial" },
  { value: "taxAmount", label: "Tax Amount", category: "Financial" },
  { value: "totalPrice", label: "Total Price", category: "Financial" },
  // Order detail fields
  { value: "lineNumber", label: "Line Number", category: "Shipping" },
  { value: "lineItemId", label: "Line Item ID", category: "Shipping" },
  { value: "shipMethod", label: "Ship Method", category: "Shipping" },
  { value: "trackingNumber", label: "Tracking Number", category: "Shipping" },
  { value: "shipDate", label: "Ship Date", category: "Shipping" },
  {
    value: "expectedDeliveryDate",
    label: "Expected Delivery",
    category: "Shipping",
  },
  { value: "shipWeight", label: "Weight", category: "Shipping" },
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
  errors?: Array<{
    type?: string;
    message?: string;
    severity?: string;
    row_range?: string;
  }>;
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

type ImportStep = "upload" | "preview" | "processing" | "complete";

/**
 * Validate that required fields are mapped for the import type.
 * Returns { valid: true } or { valid: false, missing: [...], message: string }
 */
function validateRequiredFields(
  mappings: ColumnMapping[],
  importType: "inventory" | "orders" | "both"
): { valid: true } | { valid: false; missing: string[]; message: string } {
  // Cannot validate "both" type - should be blocked before this
  if (importType === "both") {
    return { valid: true };
  }

  const requiredFields = REQUIRED_FIELDS_BY_TYPE[importType];
  const mappedFields = new Set(
    mappings
      .map((m) => m.mapsTo || m.target || "")
      .filter((f) => f && f !== "")
      .map((f) => f.toLowerCase())
  );

  const missing: string[] = [];

  for (const req of requiredFields) {
    const fieldLower = req.field.toLowerCase();
    const altFieldLower = "altField" in req && req.altField ? req.altField.toLowerCase() : null;

    // Check if main field OR alt field is mapped
    const isMapped = mappedFields.has(fieldLower) || (altFieldLower && mappedFields.has(altFieldLower));

    if (!isMapped) {
      missing.push(req.label);
    }
  }

  if (missing.length > 0) {
    const message = `Required fields not mapped: ${missing.join(", ")}. ` +
      `These fields are essential for ${importType === "inventory" ? "stock tracking" : "usage analytics"}. ` +
      `Please map them before confirming the import.`;
    return { valid: false, missing, message };
  }

  return { valid: true };
}

/**
 * Check if a field is required for the given import type
 */
function isRequiredField(fieldValue: string, importType: "inventory" | "orders" | "both"): boolean {
  if (importType === "both") return false;
  const requiredFields = REQUIRED_FIELDS_BY_TYPE[importType];
  const fieldLower = fieldValue.toLowerCase();
  return requiredFields.some(
    (req) => req.field.toLowerCase() === fieldLower ||
      ("altField" in req && req.altField?.toLowerCase() === fieldLower)
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ImportModal({
  clientId,
  clientName,
  isOpen,
  onClose,
  onSuccess,
}: ImportModalProps) {
  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [importPreviews, setImportPreviews] = useState<ImportPreview[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [editedMappings, setEditedMappings] = useState<
    Record<string, ColumnMapping[]>
  >({});
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);
  const [isWaitingForCompletion, setIsWaitingForCompletion] = useState(false);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    isDuplicate: boolean;
    filename: string;
    pendingFiles: File[];
    previousImport?: {
      id: string;
      createdAt: string;
      status: string;
      rowCount?: number;
    };
  } | null>(null);
  const [importLockError, setImportLockError] = useState<{
    isLocked: boolean;
    message: string;
    clientId: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Check if user is admin (for force-unlock button)
  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api.get<{ role: string; email: string }>("/auth/me"),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "operations_manager";

  // Timeout for import processing (2 minutes)
  const IMPORT_TIMEOUT_MS = 120000;

  // Fetch recent imports to check for duplicates
  const { data: recentImports } = useQuery({
    queryKey: ["recent-imports", clientId],
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          filename: string;
          createdAt: string;
          status: string;
          rowCount?: number;
        }>;
      }>(`/imports/history?clientId=${clientId}&limit=20`),
    enabled: isOpen && !!clientId,
  });

  // Check if a filename was previously imported
  const checkForDuplicateImport = useCallback(
    (filename: string) => {
      if (!recentImports?.data) return null;

      const duplicate = recentImports.data.find(
        (imp) => imp.filename === filename
      );

      if (duplicate) {
        return {
          isDuplicate: true,
          filename,
          previousImport: {
            id: duplicate.id,
            createdAt: duplicate.createdAt,
            status: duplicate.status,
            rowCount: duplicate.rowCount,
          },
        };
      }
      return null;
    },
    [recentImports]
  );

  // Poll import progress during processing
  // NOTE: Backend returns ImportBatch directly (not wrapped in { data: ... })
  const { data: importProgress } = useQuery({
    queryKey: ["import-progress", currentImportId],
    queryFn: () =>
      api.get<{
        id: string;
        status: string;
        processedCount: number;
        rowCount: number;
        errorCount?: number;
        errors?: Array<{
          message?: string;
          type?: string;
          row_range?: string;
          details?: string;
        }>;
      }>(`/imports/${currentImportId}`),
    enabled:
      (importStep === "processing" || isWaitingForCompletion) &&
      !!currentImportId,
    // Faster polling (1s) during active processing for responsive feel
    // Slower (3s) for less active states to reduce server load
    refetchInterval: isWaitingForCompletion ? 1000 : 3000,
  });

  // CRITICAL: Monitor polling status and handle completion
  // This useEffect ensures we wait for the actual import to finish (Python runs async)
  // Without this, the UI would show "complete" before data is actually imported
  useEffect(() => {
    const status = importProgress?.status;

    if (status && isWaitingForCompletion) {
      const isTerminal = [
        "completed",
        "completed_with_errors",
        "failed",
      ].includes(status);

      if (isTerminal) {
        // Import actually finished - now safe to proceed
        setIsWaitingForCompletion(false);
        setCurrentImportId(null);
        setProcessingStartTime(null);

        // Invalidate all relevant queries with exact: false to match partial keys
        queryClient.invalidateQueries({ queryKey: ["products"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["imports"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["orders"], exact: false });
        queryClient.invalidateQueries({
          queryKey: ["import-history"],
          exact: false,
        });

        // Check if there are more previews to process
        if (currentPreviewIndex < importPreviews.length - 1) {
          setCurrentPreviewIndex((prev) => prev + 1);
          // The next import will be triggered by handleConfirmImport
        } else {
          setImportStep("complete");
          onSuccess?.();

          // Dispatch custom event for widgets to auto-refresh
          window.dispatchEvent(new CustomEvent('import-complete', {
            detail: { status, clientId }
          }));

          if (status === "completed") {
            toast.success("All imports completed successfully");
          } else if (status === "completed_with_errors") {
            toast.success("Imports completed with some warnings");
          } else {
            toast.error("Import failed - check error details");
          }
        }
      }
    }
  }, [
    importProgress?.status,
    isWaitingForCompletion,
    currentPreviewIndex,
    importPreviews.length,
    onSuccess,
    queryClient,
  ]);

  // Timeout check - stop polling if import takes too long
  useEffect(() => {
    if (!processingStartTime || !isWaitingForCompletion) return;

    const checkTimeout = () => {
      const elapsed = Date.now() - processingStartTime;
      if (elapsed > IMPORT_TIMEOUT_MS) {
        setHasTimedOut(true);
        setIsWaitingForCompletion(false);
        toast.error("Import timed out - please check server logs");
      }
    };

    // Check immediately and set up interval
    checkTimeout();
    const interval = setInterval(checkTimeout, 5000);

    return () => clearInterval(interval);
  }, [processingStartTime, isWaitingForCompletion, IMPORT_TIMEOUT_MS]);

  // Upload mutation (single file)
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return api.upload<ImportPreview>("/imports/upload", file, { clientId });
    },
    onSuccess: (data) => {
      setImportPreviews([data]);
      setCurrentPreviewIndex(0);
      setImportStep("preview");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload file");
    },
  });

  // Upload mutation (multiple files)
  const uploadMultipleMutation = useMutation({
    mutationFn: async (files: File[]) => {
      return api.uploadMultiple<MultiImportResponse>(
        "/imports/upload-multiple",
        files,
        { clientId },
      );
    },
    onSuccess: (data) => {
      setImportPreviews(data.previews);
      setCurrentPreviewIndex(0);
      setImportStep("preview");
      toast.success(`${data.count} file(s) uploaded successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload files");
    },
  });

  // Get the current mappings for a preview (edited or original)
  const getMappingsForPreview = (preview: ImportPreview): ColumnMapping[] => {
    return editedMappings[preview.importId] || preview.columns;
  };

  // Update a single column mapping
  const updateColumnMapping = (
    importId: string,
    sourceColumn: string,
    newTarget: string,
    isCustom: boolean = false,
  ) => {
    setEditedMappings((prev) => {
      const preview = importPreviews.find((p) => p.importId === importId);
      if (!preview) return prev;

      const currentMappings = prev[importId] || preview.columns;

      // Check if this is an extended field or custom field
      const isExtendedField = EXTENDED_INVENTORY_FIELDS.some(
        (f) => f.value === newTarget,
      );
      const isKnownOrderField = ORDER_TARGET_FIELDS.some(
        (f) => f.value === newTarget,
      );
      const isKnownInventoryField = ALL_INVENTORY_FIELDS.some(
        (f) => f.value === newTarget,
      );

      const updatedMappings = currentMappings.map((col) =>
        col.source === sourceColumn
          ? {
              ...col,
              mapsTo: newTarget,
              target: newTarget, // Keep for compatibility
              confidence: newTarget ? 1 : 0,
              isCustomField:
                isCustom ||
                isExtendedField ||
                (!isKnownOrderField &&
                  !isKnownInventoryField &&
                  newTarget !== ""),
            }
          : col,
      );

      return { ...prev, [importId]: updatedMappings };
    });
  };

  // Convert target fields to MappingComboBox format
  const getComboBoxOptions = (detectedType: string): TargetField[] => {
    const fields =
      detectedType === "orders" ? ORDER_TARGET_FIELDS : ALL_INVENTORY_FIELDS;
    return fields
      .filter((f) => f.value !== "" && !(f as any).disabled)
      .map((f) => ({
        value: f.value,
        label: f.label,
        category: f.category === "skip" ? undefined : f.category,
      }));
  };

  // Get the mapping target (handles both mapsTo and target)
  const getMappingTarget = (col: ColumnMapping): string => {
    return col.mapsTo || col.target || "";
  };

  // Confirm import mutation
  const confirmMutation = useMutation({
    mutationFn: async (importId: string) => {
      const preview = importPreviews.find((p) => p.importId === importId);
      if (!preview) throw new Error("Preview not found");

      const mappings = getMappingsForPreview(preview);
      // Send both original and edited mappings so backend can learn from corrections
      return api.post<ImportResult>(`/imports/${importId}/confirm`, {
        columnMapping: mappings,
        originalMapping: preview.columns, // Original auto-detected mappings
      });
    },
    onSuccess: (data) => {
      setImportResults((prev) => [...prev, data]);
      // DON'T clear currentImportId here - let polling continue!
      // The Python import runs async in the background after API returns.
      // We need to keep polling until status is terminal (completed/failed).
      setIsWaitingForCompletion(true);
      setProcessingStartTime(Date.now());
      setHasTimedOut(false);
      // The useEffect above will handle completion when polling shows terminal status
    },
    onError: (error: Error) => {
      setCurrentImportId(null);
      setIsWaitingForCompletion(false);
      setProcessingStartTime(null);

      // Detect import lock error
      const isLockError =
        error.message?.toLowerCase().includes("another import") ||
        error.message?.toLowerCase().includes("currently processing");

      if (isLockError) {
        setImportLockError({
          isLocked: true,
          message: error.message,
          clientId,
        });
        // Go back to preview step to show recovery UI
        setImportStep("preview");
      } else {
        toast.error(error.message || "Failed to process import");
      }
    },
  });

  // Mutation for changing import type
  const changeTypeMutation = useMutation({
    mutationFn: async ({
      importId,
      importType,
    }: {
      importId: string;
      importType: "inventory" | "orders" | "both";
    }) => {
      return api.patch<ImportPreview>(`/imports/${importId}`, { importType });
    },
    onSuccess: (data) => {
      // Update the preview with new type and column mappings
      setImportPreviews((prev) =>
        prev.map((p, i) =>
          i === currentPreviewIndex
            ? {
                ...p,
                detectedType: data.detectedType,
                selectedType: data.selectedType ?? data.detectedType,
                columns: data.columns,
                sampleRows: data.sampleRows,
                validation: data.validation,
              }
            : p,
        ),
      );
      // Clear any edited mappings for this file since columns were regenerated
      setEditedMappings((prev) => {
        const newMappings = { ...prev };
        delete newMappings[currentPreviewIndex];
        return newMappings;
      });
      toast.success("Import type updated. Column mappings regenerated.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to change import type");
    },
  });

  const handleTypeChange = (newType: "inventory" | "orders" | "both") => {
    const currentPreview = importPreviews[currentPreviewIndex];
    if (
      currentPreview &&
      newType !== (currentPreview.selectedType ?? currentPreview.detectedType)
    ) {
      changeTypeMutation.mutate({
        importId: currentPreview.importId,
        importType: newType,
      });
    }
  };

  // Force-unlock mutation for admins
  const forceUnlockMutation = useMutation({
    mutationFn: async (targetClientId: string) => {
      return api.post<{
        success: boolean;
        message: string;
        importsAffected: number;
      }>(`/imports/admin/force-unlock/${targetClientId}`);
    },
    onSuccess: (data) => {
      setImportLockError(null);
      toast.success(data.message || "Import locks cleared successfully");
      // Invalidate import queries
      queryClient.invalidateQueries({ queryKey: ["imports"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["recent-imports"], exact: false });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to clear import locks");
    },
  });

  // File handling
  const handleFileSelect = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const allowedTypes = [".csv", ".xlsx", ".xls", ".tsv"];

      const validFiles = fileArray.filter((file) => {
        const ext = file.name
          .toLowerCase()
          .substring(file.name.lastIndexOf("."));
        if (!allowedTypes.includes(ext)) {
          toast.error(
            `Invalid file type: ${file.name}. Only CSV, XLSX, XLS, and TSV files are allowed.`
          );
          return false;
        }
        return true;
      });

      if (validFiles.length > 0) {
        // Check for duplicates
        for (const file of validFiles) {
          const duplicate = checkForDuplicateImport(file.name);
          if (duplicate) {
            // Store the pending files so we can add them if user confirms
            setDuplicateWarning({
              ...duplicate,
              pendingFiles: validFiles,
            });
            // Don't add files yet - wait for user confirmation
            return;
          }
        }

        setSelectedFiles((prev) => [...prev, ...validFiles]);
      }
    },
    [checkForDuplicateImport]
  );

  // Handle duplicate confirmation - user chose to continue with re-upload
  const handleDuplicateConfirm = useCallback(() => {
    if (duplicateWarning?.pendingFiles) {
      setSelectedFiles((prev) => [...prev, ...duplicateWarning.pendingFiles]);
      setDuplicateWarning(null);
    }
  }, [duplicateWarning]);

  // Handle duplicate cancel - user chose not to re-upload
  const handleDuplicateCancel = useCallback(() => {
    setDuplicateWarning(null);
    // Clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files);
      }
    },
    [handleFileSelect],
  );

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
    if (!currentPreview) return;

    // Block if type selection is required but not set
    if (!currentPreview.selectedType && currentPreview.requiresTypeSelection) {
      toast.error("Please select Inventory or Orders before confirming this import.");
      return;
    }

    // Validate required fields are mapped (prevents broken analytics)
    const importType = currentPreview.selectedType ?? currentPreview.detectedType;
    const mappings = getMappingsForPreview(currentPreview);
    const validation = validateRequiredFields(mappings, importType);
    if (!validation.valid) {
      toast.error(validation.message, { duration: 8000 });
      return;
    }

    setImportStep("processing");
    setCurrentImportId(currentPreview.importId); // Track the import being processed
    confirmMutation.mutate(currentPreview.importId);
  };

  // Helper function to poll and wait for terminal status
  const waitForTerminalStatus = async (importId: string): Promise<ImportResult & { status: string }> => {
    const POLL_INTERVAL = 2000; // 2 seconds
    const TIMEOUT = 300000; // 5 minutes

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const pollStatus = async () => {
        try {
          const result = await api.get<{
            id: string;
            status: string;
            processedCount?: number;
            rowCount?: number;
            errorCount?: number;
            errors?: Array<{ message?: string; type?: string; row_range?: string }>;
            result?: { created: number; updated: number; skipped: number; errors: string[] };
          }>(`/imports/${importId}`);

          const terminalStatuses = ["completed", "completed_with_errors", "failed"];
          if (terminalStatuses.includes(result.status)) {
            resolve(result as ImportResult & { status: string });
            return;
          }

          // Check timeout
          if (Date.now() - startTime > TIMEOUT) {
            reject(new Error("Import timed out"));
            return;
          }

          // Continue polling
          setTimeout(pollStatus, POLL_INTERVAL);
        } catch (err) {
          reject(err);
        }
      };

      pollStatus();
    });
  };

  // Fixed confirm-all: waits for each import to actually complete, retries failed imports
  const handleConfirmAll = async () => {
    // Pre-validate ALL imports before starting (fail fast)
    for (let i = 0; i < importPreviews.length; i++) {
      const preview = importPreviews[i];
      if (!preview.selectedType && preview.requiresTypeSelection) {
        toast.error(
          `Type selection required for ${preview.filename || `file ${i + 1}`} - please choose Inventory or Orders before confirming.`,
        );
        setCurrentPreviewIndex(i);
        return;
      }

      // Validate required fields are mapped
      const importType = preview.selectedType ?? preview.detectedType;
      const mappings = getMappingsForPreview(preview);
      const validation = validateRequiredFields(mappings, importType);
      if (!validation.valid) {
        toast.error(
          `Missing required fields in ${preview.filename || `file ${i + 1}`}: ${validation.missing.join(", ")}`,
          { duration: 8000 }
        );
        setCurrentPreviewIndex(i);
        return;
      }
    }

    setImportStep("processing");
    const results: ImportResult[] = [];
    const failedPreviews: typeof importPreviews = [];

    // Process all imports sequentially, waiting for each to complete
    for (let i = 0; i < importPreviews.length; i++) {
      const preview = importPreviews[i];
      setCurrentImportId(preview.importId);
      setCurrentPreviewIndex(i);

      try {
        // 1. Start the import (API returns quickly with "processing" status)
        await confirmMutation.mutateAsync(preview.importId);

        // 2. Wait for the import to ACTUALLY complete (Python runs async)
        const finalResult = await waitForTerminalStatus(preview.importId);
        results.push(finalResult);

        if (finalResult.status === "failed") {
          toast.error(`Import failed: ${preview.filename || `File ${i + 1}`}, will retry`);
          failedPreviews.push(preview);
        } else if (finalResult.status === "completed_with_errors") {
          toast.success(`Import completed with warnings: ${preview.filename || `File ${i + 1}`}`);
        } else {
          toast.success(`Import completed: ${preview.filename || `File ${i + 1}`}`);
        }
      } catch (err) {
        toast.error(`Import error: ${preview.filename || `File ${i + 1}`}, will retry`);
        failedPreviews.push(preview);
      }
    }

    // Retry failed imports once
    if (failedPreviews.length > 0) {
      toast(`Retrying ${failedPreviews.length} failed import(s)...`);

      for (const preview of failedPreviews) {
        setCurrentImportId(preview.importId);

        try {
          // Reset status to pending before retry
          await api.patch(`/imports/${preview.importId}`, { status: "pending" });

          // Retry the import
          await confirmMutation.mutateAsync(preview.importId);
          const retryResult = await waitForTerminalStatus(preview.importId);
          results.push(retryResult);

          if (retryResult.status === "failed") {
            toast.error(`Retry failed: ${preview.filename || preview.importId}`);
          } else {
            toast.success(`Retry succeeded: ${preview.filename || preview.importId}`);
          }
        } catch (err) {
          toast.error(`Retry error: ${preview.filename || preview.importId}`);
        }
      }
    }

    // Done with all imports
    setImportResults(results);
    setCurrentImportId(null);
    setIsWaitingForCompletion(false);

    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["products"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["imports"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["orders"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["import-history"], exact: false });

    setImportStep("complete");
    onSuccess?.();

    // Dispatch custom event for widgets to auto-refresh
    window.dispatchEvent(new CustomEvent('import-complete', {
      detail: { status: 'batch_complete', clientId }
    }));

    const successCount = results.filter((r) => r.status === "completed" || r.status === "completed_with_errors").length;
    const failCount = results.filter((r) => r.status === "failed").length;

    if (failCount === 0) {
      toast.success(`All ${successCount} imports completed successfully`);
    } else if (successCount > 0) {
      toast.success(`${successCount} imports succeeded, ${failCount} failed`);
    } else {
      toast.error(`All ${failCount} imports failed`);
    }
  };

  const resetAndClose = () => {
    setImportStep("upload");
    setSelectedFiles([]);
    setImportPreviews([]);
    setCurrentPreviewIndex(0);
    setImportResults([]);
    setEditedMappings({});
    setCurrentImportId(null);
    setIsWaitingForCompletion(false);
    setDuplicateWarning(null);
    setImportLockError(null);
    onClose();
  };

  const isUploading =
    uploadMutation.isPending || uploadMultipleMutation.isPending;
  const currentPreview = importPreviews[currentPreviewIndex];

  // Calculate totals for complete step
  const totals = importResults.reduce(
    (acc, result) => ({
      created: acc.created + (result.result?.created || 0),
      updated: acc.updated + (result.result?.updated || 0),
      skipped: acc.skipped + (result.result?.skipped || 0),
      errors: [...acc.errors, ...(result.result?.errors || [])],
      structuredErrors: [...acc.structuredErrors, ...(result.errors || [])],
      hasWarnings: acc.hasWarnings || result.status === "completed_with_errors",
    }),
    {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      structuredErrors: [] as Array<{
        type?: string;
        message?: string;
        severity?: string;
        row_range?: string;
        details?: string;
      }>,
      hasWarnings: false,
    },
  );

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
                  {importStep === "upload" && "Import Data"}
                  {importStep === "preview" &&
                    `Review Import${importPreviews.length > 1 ? ` (${currentPreviewIndex + 1}/${importPreviews.length})` : ""}`}
                  {importStep === "processing" && "Processing Import"}
                  {importStep === "complete" && "Import Complete"}
                </h2>
                {clientName && (
                  <p className="text-sm text-gray-500">for {clientName}</p>
                )}
              </div>
              <button
                onClick={resetAndClose}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close import dialog"
              >
                <X className="w-5 h-5 text-gray-500" aria-hidden="true" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Upload Step */}
              {importStep === "upload" && (
                <div className="space-y-4">
                  <div
                    className={clsx(
                      "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                      isDragging
                        ? "border-primary-500 bg-primary-50"
                        : "border-gray-300 hover:border-gray-400",
                      selectedFiles.length > 0 &&
                        "border-green-500 bg-green-50",
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
                      onChange={(e) =>
                        e.target.files && handleFileSelect(e.target.files)
                      }
                    />

                    {selectedFiles.length > 0 ? (
                      <div className="space-y-2">
                        <FileSpreadsheet className="w-12 h-12 mx-auto text-green-600" />
                        <p className="text-lg font-medium text-gray-900">
                          {selectedFiles.length} file
                          {selectedFiles.length > 1 ? "s" : ""} selected
                        </p>
                        <p className="text-sm text-gray-500">
                          Click to add more files
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-12 h-12 mx-auto text-gray-400" />
                        <p className="text-lg font-medium text-gray-900">
                          Drop your files here, or{" "}
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

                  {/* Duplicate Import Warning Dialog */}
                  {duplicateWarning && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-amber-50 border border-amber-200 rounded-lg"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-amber-100 rounded-full">
                          <RefreshCw className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-amber-800">
                            File Previously Imported
                          </h4>
                          <p className="text-sm text-amber-700 mt-1">
                            <span className="font-medium">
                              "{duplicateWarning.filename}"
                            </span>{" "}
                            was already imported
                            {duplicateWarning.previousImport?.createdAt && (
                              <> on {new Date(duplicateWarning.previousImport.createdAt).toLocaleDateString()}</>
                            )}
                            {duplicateWarning.previousImport?.rowCount && (
                              <> ({duplicateWarning.previousImport.rowCount} rows)</>
                            )}
                            .
                          </p>

                          <div className="mt-3 p-3 bg-white/60 rounded border border-amber-200">
                            <p className="text-sm font-medium text-amber-800 mb-2">
                              What happens if you continue:
                            </p>
                            <ul className="text-sm text-amber-700 space-y-1">
                              <li className="flex items-center gap-2">
                                <Check className="w-4 h-4 text-amber-600" />
                                Products with matching SKUs will be <strong>updated</strong>
                              </li>
                              <li className="flex items-center gap-2">
                                <Check className="w-4 h-4 text-amber-600" />
                                New products will be <strong>added</strong>
                              </li>
                              <li className="flex items-center gap-2">
                                <Check className="w-4 h-4 text-green-600" />
                                No products will be duplicated
                              </li>
                            </ul>
                          </div>

                          <div className="flex gap-3 mt-4">
                            <button
                              onClick={handleDuplicateCancel}
                              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleDuplicateConfirm}
                              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 flex items-center gap-2"
                            >
                              <RefreshCw className="w-4 h-4" />
                              Continue & Update
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Import Lock Error Recovery UI */}
                  {importLockError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-red-50 border border-red-200 rounded-lg"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-red-100 rounded-full">
                          <Lock className="w-5 h-5 text-red-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-red-800">
                            Import Currently Blocked
                          </h4>
                          <p className="text-sm text-red-700 mt-1">
                            {importLockError.message}
                          </p>

                          <div className="mt-3 p-3 bg-white/60 rounded border border-red-200">
                            <p className="text-sm font-medium text-red-800 mb-2">
                              This may be caused by:
                            </p>
                            <ul className="text-sm text-red-700 space-y-1">
                              <li className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-red-500" />
                                An import that's still running
                              </li>
                              <li className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                A stuck import that didn't complete properly
                              </li>
                            </ul>
                          </div>

                          <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                            <p className="text-sm text-blue-800">
                              <strong>Tip:</strong> The system auto-recovers stuck imports every 5 minutes.
                              Wait a few minutes and try again.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-3 mt-4">
                            <button
                              onClick={() => setImportLockError(null)}
                              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                              Dismiss
                            </button>
                            <a
                              href="/imports"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-2"
                            >
                              <ExternalLink className="w-4 h-4" />
                              View Import History
                            </a>
                            {isAdmin && (
                              <button
                                onClick={() => forceUnlockMutation.mutate(importLockError.clientId)}
                                disabled={forceUnlockMutation.isPending}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 flex items-center gap-2 disabled:opacity-50"
                              >
                                {forceUnlockMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Unlock className="w-4 h-4" />
                                )}
                                Force Clear Locks
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Selected Files List */}
                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-gray-900">
                        Selected Files
                      </h3>
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-40 overflow-y-auto">
                        {selectedFiles.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3"
                          >
                            <div className="flex items-center gap-3">
                              <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {file.name}
                                </p>
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
                        `Upload${selectedFiles.length > 1 ? ` ${selectedFiles.length} Files` : ""} & Preview`
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Preview Step */}
              {importStep === "preview" && currentPreview && (
                <div className="space-y-4">
                  {/* File indicator for multiple files */}
                  {importPreviews.length > 1 && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                      <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-blue-900">
                        {currentPreview.filename ||
                          `File ${currentPreviewIndex + 1}`}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">
                        {currentPreview.rowCount}
                      </p>
                      <p className="text-sm text-gray-500">Rows detected</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">
                        {currentPreview.columns.length}
                      </p>
                      <p className="text-sm text-gray-500">Columns mapped</p>
                    </div>
                  </div>

                  {/* Type Selection Required Warning */}
                  {currentPreview.requiresTypeSelection &&
                    (currentPreview.selectedType === "both" ||
                      currentPreview.selectedType === null) && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-amber-800">
                              Type Selection Required
                            </p>
                            <p className="text-sm text-amber-600 mt-1">
                              This file contains both inventory and order data.
                              Please select which type to import below.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Import Type Selection */}
                  {currentPreview.detection && (
                    <ImportTypeSelector
                      detectedType={currentPreview.detectedType}
                      detection={currentPreview.detection}
                      selectedType={
                        currentPreview.selectedType ??
                        currentPreview.detectedType
                      }
                      onTypeChange={handleTypeChange}
                      disabled={changeTypeMutation.isPending}
                    />
                  )}

                  {/* Fallback for older previews without detection info */}
                  {!currentPreview.detection && (
                    <div className="p-4 bg-gray-50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-gray-900 capitalize">
                        {currentPreview.selectedType ??
                          currentPreview.detectedType}
                      </p>
                      <p className="text-sm text-gray-500">
                        Data type (auto-detected)
                      </p>
                    </div>
                  )}

                  {/* Warnings */}
                  {currentPreview.warnings.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-gray-900">Warnings</h3>
                      {currentPreview.warnings.map((warning, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg"
                        >
                          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-amber-800">
                              {warning.message}
                            </p>
                            <p className="text-xs text-amber-600">
                              Affects {warning.affectedRows} rows
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Column Mapping */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900">
                        Column Mapping
                      </h3>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-primary-500"></span>
                          Core field
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          Custom field
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium">
                            AI
                          </span>
                          Learned
                        </span>
                      </div>
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-600">
                              Source Column
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600">
                              Maps To
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600 w-20">
                              Type
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600 w-20">
                              Match
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {getMappingsForPreview(currentPreview).map(
                            (col, i) => {
                              const mappingTarget = getMappingTarget(col);
                              const isCustomField =
                                col.isCustomField ||
                                EXTENDED_INVENTORY_FIELDS.some(
                                  (f) => f.value === mappingTarget,
                                );

                              // Check if this mapping was dropped due to conflict
                              const isDropped =
                                !mappingTarget ||
                                mappingTarget === "" ||
                                col.warnings?.some(w => w.includes("dropped") || w.includes("conflict"));

                              const dropWarning = col.warnings?.find(w =>
                                w.includes("dropped") || w.includes("conflict")
                              );

                              return (
                                <tr
                                  key={i}
                                  className={clsx(
                                    isDropped && "bg-red-50 border-l-4 border-l-red-500",
                                    !isDropped && col.confidence < 0.5 &&
                                      !isCustomField &&
                                      "bg-amber-50",
                                    !isDropped && isCustomField && "bg-blue-50/50",
                                  )}
                                >
                                  <td className="px-4 py-2 text-gray-900">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={clsx(
                                            "w-2 h-2 rounded-full flex-shrink-0",
                                            isDropped
                                              ? "bg-red-500"
                                              : isCustomField
                                                ? "bg-blue-500"
                                                : "bg-primary-500",
                                          )}
                                        ></span>
                                        <span className="font-medium">
                                          {col.source}
                                        </span>
                                        {isDropped && (
                                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
                                            CONFLICT
                                          </span>
                                        )}
                                      </div>
                                      {isDropped && dropWarning && (
                                        <div className="text-xs text-red-600 flex items-start gap-1 ml-4">
                                          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                          <span>{dropWarning}</span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-2">
                                      <MappingComboBox
                                        value={mappingTarget}
                                        onChange={(value, isCustom) =>
                                          updateColumnMapping(
                                            currentPreview.importId,
                                            col.source,
                                            value,
                                            isCustom,
                                          )
                                        }
                                        options={getComboBoxOptions(
                                          currentPreview.selectedType ??
                                            currentPreview.detectedType,
                                        )}
                                        sourceColumnName={col.source}
                                        confidence={col.confidence}
                                        placeholder="Select or type field name..."
                                      />
                                      {/* Show REQUIRED badge if this field maps to a required field */}
                                      {mappingTarget && isRequiredField(
                                        mappingTarget,
                                        currentPreview.selectedType ?? currentPreview.detectedType
                                      ) && (
                                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded flex-shrink-0">
                                          REQUIRED
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2">
                                    {col.detectedDataType && (
                                      <span className="text-xs text-gray-500 capitalize">
                                        {col.detectedDataType.replace("_", " ")}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-1">
                                      <span
                                        className={clsx(
                                          "px-2 py-0.5 rounded text-xs font-medium",
                                          col.confidence > 0.8
                                            ? "bg-green-100 text-green-700"
                                            : col.confidence > 0.5
                                              ? "bg-amber-100 text-amber-700"
                                              : col.confidence > 0
                                                ? "bg-red-100 text-red-700"
                                                : "bg-gray-100 text-gray-500",
                                        )}
                                      >
                                        {col.confidence > 0
                                          ? `${Math.round(col.confidence * 100)}%`
                                          : "New"}
                                      </span>
                                      {col.isLearned && (
                                        <span
                                          className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium"
                                          title="Mapping improved from past corrections"
                                        >
                                          AI
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            },
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Custom fields info */}
                    {getMappingsForPreview(currentPreview).some(
                      (col) =>
                        col.isCustomField ||
                        EXTENDED_INVENTORY_FIELDS.some(
                          (f) => f.value === getMappingTarget(col),
                        ),
                    ) && (
                      <p className="text-xs text-blue-600 flex items-center gap-1 bg-blue-50 p-2 rounded">
                        <Check className="w-3 h-3" />
                        Custom fields will be preserved in product metadata and
                        shown in the dashboard.
                      </p>
                    )}

                    {getMappingsForPreview(currentPreview).some(
                      (col) => col.confidence < 0.5 && !col.isCustomField,
                    ) && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Low confidence mappings are highlighted. Please review
                        and adjust as needed.
                      </p>
                    )}
                  </div>

                  <div className="flex justify-between gap-3">
                    <button
                      onClick={resetAndClose}
                      className="btn-secondary"
                      disabled={isWaitingForCompletion || confirmMutation.isPending}
                    >
                      Cancel
                    </button>
                    <div className="flex gap-2">
                      {importPreviews.length > 1 && (
                        <button
                          onClick={handleConfirmAll}
                          disabled={isWaitingForCompletion || confirmMutation.isPending}
                          className={clsx(
                            "btn-secondary",
                            (isWaitingForCompletion || confirmMutation.isPending) &&
                              "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {isWaitingForCompletion || confirmMutation.isPending
                            ? "Processing..."
                            : `Import All (${importPreviews.length})`}
                        </button>
                      )}
                      <button
                        onClick={handleConfirmImport}
                        disabled={
                          isWaitingForCompletion ||
                          confirmMutation.isPending ||
                          (currentPreview?.requiresTypeSelection &&
                            (currentPreview?.selectedType === "both" ||
                              currentPreview?.selectedType === null))
                        }
                        className={clsx(
                          "btn-primary",
                          (isWaitingForCompletion ||
                            confirmMutation.isPending ||
                            (currentPreview?.requiresTypeSelection &&
                              (currentPreview?.selectedType === "both" ||
                                currentPreview?.selectedType === null))) &&
                            "opacity-50 cursor-not-allowed"
                        )}
                        title={
                          isWaitingForCompletion || confirmMutation.isPending
                            ? "Import in progress..."
                            : currentPreview?.requiresTypeSelection &&
                              (currentPreview?.selectedType === "both" ||
                                currentPreview?.selectedType === null)
                              ? "Please select Inventory or Orders before confirming"
                              : undefined
                        }
                      >
                        {isWaitingForCompletion || confirmMutation.isPending
                          ? "Processing..."
                          : importPreviews.length > 1
                            ? "Import This File"
                            : "Confirm Import"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Processing Step */}
              {importStep === "processing" && (
                <div className="text-center py-12">
                  {/* Show timeout error */}
                  {hasTimedOut ? (
                    <div className="space-y-4">
                      <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                        <AlertTriangle className="w-8 h-8 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-lg font-medium text-gray-900">Import Timed Out</p>
                        <p className="text-sm text-gray-500 mt-1">
                          The import is taking longer than expected. It may still be processing in the background.
                        </p>
                      </div>
                      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-left max-w-md mx-auto">
                        <p className="text-sm text-amber-700">
                          Check the import history page to see if your import completed. If it's still processing, please wait a few more minutes.
                        </p>
                      </div>
                      <div className="flex justify-center gap-3 mt-4">
                        <button
                          onClick={onClose}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Close
                        </button>
                        <button
                          onClick={() => {
                            setImportStep("upload");
                            setImportPreviews([]);
                            setImportResults([]);
                            setCurrentImportId(null);
                            setHasTimedOut(false);
                            setProcessingStartTime(null);
                          }}
                          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                        >
                          Start New Import
                        </button>
                      </div>
                    </div>
                  ) : importProgress?.status === "failed" ? (
                    <div className="space-y-4">
                      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                        <AlertTriangle className="w-8 h-8 text-red-600" />
                      </div>
                      <div>
                        <p className="text-lg font-medium text-gray-900">Import Failed</p>
                        <p className="text-sm text-gray-500 mt-1">
                          An error occurred while processing your import
                        </p>
                      </div>

                      {/* Error details */}
                      {importProgress?.errors && importProgress.errors.length > 0 && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-left max-w-md mx-auto">
                          <h4 className="font-medium text-red-800 mb-2">
                            Error Details ({importProgress.errors.length})
                          </h4>
                          <ul className="text-sm text-red-600 space-y-2 max-h-48 overflow-y-auto">
                            {importProgress.errors.slice(0, 5).map((err, i) => (
                              <li key={i} className="border-b border-red-100 pb-2 last:border-0 last:pb-0">
                                <div className="font-medium">
                                  {err.type || "Error"}: {err.message}
                                </div>
                                {err.row_range && (
                                  <div className="text-red-400 text-xs mt-0.5">
                                    Rows {err.row_range}
                                  </div>
                                )}
                                {err.details && (
                                  <details className="mt-1">
                                    <summary className="text-xs text-red-400 cursor-pointer hover:text-red-500">
                                      Technical details
                                    </summary>
                                    <pre className="mt-1 text-xs bg-red-100 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                      {err.details}
                                    </pre>
                                  </details>
                                )}
                              </li>
                            ))}
                            {importProgress.errors.length > 5 && (
                              <li className="text-red-400 text-xs pt-2">
                                +{importProgress.errors.length - 5} more errors
                              </li>
                            )}
                          </ul>
                        </div>
                      )}

                      <div className="flex justify-center gap-3 mt-4">
                        <button
                          onClick={onClose}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Close
                        </button>
                        <button
                          onClick={() => {
                            setImportStep("upload");
                            setImportPreviews([]);
                            setImportResults([]);
                            setCurrentImportId(null);
                          }}
                          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto" />
                      <p className="mt-4 text-lg font-medium text-gray-900">
                        Processing import...
                      </p>
                      <p className="text-sm text-gray-500">
                        {importPreviews.length > 1
                          ? `Processing file ${importResults.length + 1} of ${importPreviews.length}`
                          : importProgress?.status === "post_processing"
                            ? "Calculating usage metrics..."
                            : "This may take a few moments"}
                      </p>
                      {importProgress?.processedCount !== undefined &&
                        importProgress?.rowCount && (
                          <div className="mt-6 max-w-xs mx-auto">
                            <div className="flex justify-between text-sm text-gray-600 mb-1">
                              <span>
                                {importProgress.processedCount.toLocaleString()}{" "}
                                rows
                              </span>
                              <span>
                                {importProgress.rowCount.toLocaleString()} total
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, (importProgress.processedCount / importProgress.rowCount) * 100)}%`,
                                }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {Math.round(
                                (importProgress.processedCount /
                                  importProgress.rowCount) *
                                  100,
                              )}
                              % complete
                            </p>
                          </div>
                        )}

                      {/* Show warnings/errors during processing */}
                      {importProgress?.errors && importProgress.errors.length > 0 && (
                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left max-w-md mx-auto">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <h4 className="font-medium text-amber-800 text-sm">
                              Data Quality Warnings ({importProgress.errors.length})
                            </h4>
                          </div>
                          <ul className="text-xs text-amber-700 space-y-1 max-h-24 overflow-y-auto">
                            {importProgress.errors.slice(0, 3).map((err, i) => (
                              <li key={i} className="truncate">
                                {err.type && <span className="font-medium">{err.type}:</span>} {err.message}
                              </li>
                            ))}
                            {importProgress.errors.length > 3 && (
                              <li className="text-amber-500 italic">
                                +{importProgress.errors.length - 3} more...
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Complete Step */}
              {importStep === "complete" && (
                <div className="space-y-4">
                  <div className="text-center py-6">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
                      totals.hasWarnings || totals.structuredErrors.length > 0
                        ? "bg-amber-100"
                        : "bg-green-100"
                    }`}>
                      {totals.hasWarnings || totals.structuredErrors.length > 0 ? (
                        <AlertTriangle className="w-8 h-8 text-amber-600" />
                      ) : (
                        <Check className="w-8 h-8 text-green-600" />
                      )}
                    </div>
                    <h3 className="mt-4 text-xl font-semibold text-gray-900">
                      {totals.hasWarnings || totals.structuredErrors.length > 0
                        ? importResults.length > 1
                          ? `${importResults.length} Imports Completed with Warnings`
                          : "Import Completed with Warnings"
                        : importResults.length > 1
                          ? `${importResults.length} Imports Successful`
                          : "Import Successful"}
                    </h3>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        {totals.created}
                      </p>
                      <p className="text-sm text-gray-500">Created</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">
                        {totals.updated}
                      </p>
                      <p className="text-sm text-gray-500">Updated</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-600">
                        {totals.skipped}
                      </p>
                      <p className="text-sm text-gray-500">Skipped</p>
                    </div>
                  </div>

                  {/* Data quality warnings (dropped rows, etc.) */}
                  {totals.structuredErrors.length > 0 && (
                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <h4 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Data Quality Warnings ({totals.structuredErrors.length})
                      </h4>
                      <ul className="text-sm text-amber-700 space-y-2 max-h-32 overflow-y-auto">
                        {totals.structuredErrors.slice(0, 5).map((err, i) => (
                          <li key={i} className="border-b border-amber-100 pb-1 last:border-0">
                            <span className="font-medium">{err.type || "Warning"}:</span>{" "}
                            {err.message}
                            {err.row_range && (
                              <span className="text-amber-500 text-xs ml-1">({err.row_range})</span>
                            )}
                          </li>
                        ))}
                        {totals.structuredErrors.length > 5 && (
                          <li className="text-amber-500 text-xs pt-1">
                            +{totals.structuredErrors.length - 5} more warnings
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* String errors from import result */}
                  {totals.errors.length > 0 && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <h4 className="font-medium text-red-800 mb-2">
                        Errors ({totals.errors.length})
                      </h4>
                      <ul className="text-sm text-red-600 space-y-1 max-h-32 overflow-y-auto">
                        {totals.errors.slice(0, 10).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {totals.errors.length > 10 && (
                          <li className="text-red-500">
                            +{totals.errors.length - 10} more errors
                          </li>
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
