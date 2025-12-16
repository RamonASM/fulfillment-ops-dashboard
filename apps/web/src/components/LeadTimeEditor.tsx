// =============================================================================
// LEAD TIME EDITOR
// Configure product or client default lead times
// =============================================================================

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Save, RefreshCw, HelpCircle } from "lucide-react";
import { api } from "@/api/client";

// =============================================================================
// TYPES
// =============================================================================

interface LeadTimeConfig {
  supplierLeadDays: number | null;
  shippingLeadDays: number | null;
  processingLeadDays: number | null;
  safetyBufferDays: number | null;
  totalLeadDays: number;
  leadTimeSource: "default" | "override" | "imported" | null;
}

interface ClientDefaults {
  defaultSupplierLeadDays: number;
  defaultShippingDays: number;
  defaultProcessingDays: number;
  defaultSafetyBufferDays: number;
  alertDaysBeforeDeadline: number[];
}

interface LeadTimeEditorProps {
  mode: "product" | "client";
  productId?: string;
  clientId: string;
  currentConfig?: LeadTimeConfig;
  clientDefaults?: ClientDefaults;
  onSave?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function LeadTimeEditor({
  mode,
  productId,
  clientId,
  currentConfig,
  clientDefaults,
  onSave,
}: LeadTimeEditorProps) {
  const queryClient = useQueryClient();

  // Default values
  const defaults: ClientDefaults = clientDefaults || {
    defaultSupplierLeadDays: 7,
    defaultShippingDays: 5,
    defaultProcessingDays: 1,
    defaultSafetyBufferDays: 2,
    alertDaysBeforeDeadline: [14, 7, 3, 1],
  };

  // Form state for product mode
  const [productForm, setProductForm] = useState({
    supplierLeadDays: currentConfig?.supplierLeadDays?.toString() || "",
    shippingLeadDays: currentConfig?.shippingLeadDays?.toString() || "",
    processingLeadDays: currentConfig?.processingLeadDays?.toString() || "",
    safetyBufferDays: currentConfig?.safetyBufferDays?.toString() || "",
    useDefaults:
      !currentConfig?.leadTimeSource ||
      currentConfig.leadTimeSource === "default",
  });

  // Form state for client mode
  const [clientForm, setClientForm] = useState({
    defaultSupplierLeadDays: defaults.defaultSupplierLeadDays.toString(),
    defaultShippingDays: defaults.defaultShippingDays.toString(),
    defaultProcessingDays: defaults.defaultProcessingDays.toString(),
    defaultSafetyBufferDays: defaults.defaultSafetyBufferDays.toString(),
    alertDaysBeforeDeadline: defaults.alertDaysBeforeDeadline.join(", "),
  });

  // Calculate total lead time
  const calculateTotal = () => {
    if (mode === "product") {
      if (productForm.useDefaults) {
        return (
          defaults.defaultSupplierLeadDays +
          defaults.defaultShippingDays +
          defaults.defaultProcessingDays +
          defaults.defaultSafetyBufferDays
        );
      }
      const supplier =
        parseInt(productForm.supplierLeadDays) ||
        defaults.defaultSupplierLeadDays;
      const shipping =
        parseInt(productForm.shippingLeadDays) || defaults.defaultShippingDays;
      const processing =
        parseInt(productForm.processingLeadDays) ||
        defaults.defaultProcessingDays;
      const safety =
        parseInt(productForm.safetyBufferDays) ||
        defaults.defaultSafetyBufferDays;
      return supplier + shipping + processing + safety;
    } else {
      return (
        parseInt(clientForm.defaultSupplierLeadDays) +
        parseInt(clientForm.defaultShippingDays) +
        parseInt(clientForm.defaultProcessingDays) +
        parseInt(clientForm.defaultSafetyBufferDays)
      );
    }
  };

  // Save product lead time mutation
  const saveProductMutation = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Product ID required");
      return await api.patch(`/order-timing/product/${productId}/lead-time`, {
        supplierLeadDays: productForm.useDefaults
          ? undefined
          : parseInt(productForm.supplierLeadDays) || undefined,
        shippingLeadDays: productForm.useDefaults
          ? undefined
          : parseInt(productForm.shippingLeadDays) || undefined,
        processingLeadDays: productForm.useDefaults
          ? undefined
          : parseInt(productForm.processingLeadDays) || undefined,
        safetyBufferDays: productForm.useDefaults
          ? undefined
          : parseInt(productForm.safetyBufferDays) || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
      queryClient.invalidateQueries({ queryKey: ["order-timing"] });
      onSave?.();
    },
  });

  // Save client defaults mutation
  const saveClientMutation = useMutation({
    mutationFn: async () => {
      const alertDays = clientForm.alertDaysBeforeDeadline
        .split(",")
        .map((s) => parseInt(s.trim()))
        .filter((n) => !isNaN(n));

      return await api.put(`/order-timing/${clientId}/defaults`, {
        defaultSupplierLeadDays: parseInt(clientForm.defaultSupplierLeadDays),
        defaultShippingDays: parseInt(clientForm.defaultShippingDays),
        defaultProcessingDays: parseInt(clientForm.defaultProcessingDays),
        defaultSafetyBufferDays: parseInt(clientForm.defaultSafetyBufferDays),
        alertDaysBeforeDeadline: alertDays,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["order-timing"] });
      onSave?.();
    },
  });

  // Recalculate timing cache mutation
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/order-timing/${clientId}/recalculate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-timing"] });
    },
  });

  const handleSave = () => {
    if (mode === "product") {
      saveProductMutation.mutate();
    } else {
      saveClientMutation.mutate();
    }
  };

  const isPending =
    saveProductMutation.isPending || saveClientMutation.isPending;

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            {mode === "product" ? "Product Lead Time" : "Default Lead Times"}
          </h3>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {mode === "product"
            ? "Override default lead times for this specific product"
            : "Set default lead times for all products in this account"}
        </p>
      </div>

      <div className="p-4">
        {mode === "product" && (
          <div className="mb-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={productForm.useDefaults}
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    useDefaults: e.target.checked,
                  })
                }
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Use client defaults</span>
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Supplier Lead Days
              <span
                className="text-gray-400 ml-1"
                title="Time for supplier to fulfill order"
              >
                <HelpCircle className="w-3 h-3 inline" />
              </span>
            </label>
            <input
              type="number"
              min="0"
              max="365"
              value={
                mode === "product"
                  ? productForm.supplierLeadDays
                  : clientForm.defaultSupplierLeadDays
              }
              onChange={(e) => {
                if (mode === "product") {
                  setProductForm({
                    ...productForm,
                    supplierLeadDays: e.target.value,
                    useDefaults: false,
                  });
                } else {
                  setClientForm({
                    ...clientForm,
                    defaultSupplierLeadDays: e.target.value,
                  });
                }
              }}
              disabled={mode === "product" && productForm.useDefaults}
              placeholder={defaults.defaultSupplierLeadDays.toString()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Shipping Days
              <span
                className="text-gray-400 ml-1"
                title="Transit time to destination"
              >
                <HelpCircle className="w-3 h-3 inline" />
              </span>
            </label>
            <input
              type="number"
              min="0"
              max="365"
              value={
                mode === "product"
                  ? productForm.shippingLeadDays
                  : clientForm.defaultShippingDays
              }
              onChange={(e) => {
                if (mode === "product") {
                  setProductForm({
                    ...productForm,
                    shippingLeadDays: e.target.value,
                    useDefaults: false,
                  });
                } else {
                  setClientForm({
                    ...clientForm,
                    defaultShippingDays: e.target.value,
                  });
                }
              }}
              disabled={mode === "product" && productForm.useDefaults}
              placeholder={defaults.defaultShippingDays.toString()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Processing Days
              <span
                className="text-gray-400 ml-1"
                title="Internal processing/handling time"
              >
                <HelpCircle className="w-3 h-3 inline" />
              </span>
            </label>
            <input
              type="number"
              min="0"
              max="365"
              value={
                mode === "product"
                  ? productForm.processingLeadDays
                  : clientForm.defaultProcessingDays
              }
              onChange={(e) => {
                if (mode === "product") {
                  setProductForm({
                    ...productForm,
                    processingLeadDays: e.target.value,
                    useDefaults: false,
                  });
                } else {
                  setClientForm({
                    ...clientForm,
                    defaultProcessingDays: e.target.value,
                  });
                }
              }}
              disabled={mode === "product" && productForm.useDefaults}
              placeholder={defaults.defaultProcessingDays.toString()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Safety Buffer Days
              <span
                className="text-gray-400 ml-1"
                title="Extra cushion for unexpected delays"
              >
                <HelpCircle className="w-3 h-3 inline" />
              </span>
            </label>
            <input
              type="number"
              min="0"
              max="365"
              value={
                mode === "product"
                  ? productForm.safetyBufferDays
                  : clientForm.defaultSafetyBufferDays
              }
              onChange={(e) => {
                if (mode === "product") {
                  setProductForm({
                    ...productForm,
                    safetyBufferDays: e.target.value,
                    useDefaults: false,
                  });
                } else {
                  setClientForm({
                    ...clientForm,
                    defaultSafetyBufferDays: e.target.value,
                  });
                }
              }}
              disabled={mode === "product" && productForm.useDefaults}
              placeholder={defaults.defaultSafetyBufferDays.toString()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
        </div>

        {/* Alert Days (Client mode only) */}
        {mode === "client" && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Alert Days Before Deadline
              <span
                className="text-gray-400 ml-1"
                title="Comma-separated list of days to send alerts"
              >
                <HelpCircle className="w-3 h-3 inline" />
              </span>
            </label>
            <input
              type="text"
              value={clientForm.alertDaysBeforeDeadline}
              onChange={(e) =>
                setClientForm({
                  ...clientForm,
                  alertDaysBeforeDeadline: e.target.value,
                })
              }
              placeholder="14, 7, 3, 1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Total Calculation */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-700 font-medium">
              Total Lead Time
            </span>
            <span className="text-lg font-bold text-blue-700">
              {calculateTotal()} days
            </span>
          </div>
          {mode === "product" && productForm.useDefaults && (
            <p className="text-xs text-blue-600 mt-1">Using client defaults</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-200 flex items-center justify-between">
        {mode === "client" && (
          <button
            onClick={() => recalculateMutation.mutate()}
            disabled={recalculateMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${recalculateMutation.isPending ? "animate-spin" : ""}`}
            />
            Recalculate All
          </button>
        )}
        <div className={mode === "client" ? "" : "ml-auto"}>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LeadTimeEditor;
