// =============================================================================
// IMPORT TYPE SELECTOR
// Component for selecting/confirming import file type with confidence display
// =============================================================================

import { useState } from "react";
import {
  Package,
  ShoppingCart,
  Layers,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import type { ImportDetectionResult, ImportType } from "@inventory/shared";

interface ImportTypeSelectorProps {
  detectedType: ImportType;
  detection: ImportDetectionResult;
  selectedType: ImportType;
  onTypeChange: (type: ImportType) => void;
  disabled?: boolean;
}

const typeConfig: Record<
  ImportType,
  {
    icon: typeof Package;
    label: string;
    description: string;
    color: string;
    bgColor: string;
  }
> = {
  inventory: {
    icon: Package,
    label: "Inventory / Stock",
    description: "Current stock levels, warehouse quantities, reorder points",
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
  },
  orders: {
    icon: ShoppingCart,
    label: "Orders / Transactions",
    description: "Order history, shipments, transaction records",
    color: "text-green-600",
    bgColor: "bg-green-50 border-green-200",
  },
  both: {
    icon: Layers,
    label: "Combined Data",
    description: "File contains both inventory and order data",
    color: "text-purple-600",
    bgColor: "bg-purple-50 border-purple-200",
  },
};

const confidenceConfig = {
  high: {
    icon: CheckCircle,
    label: "High Confidence",
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  medium: {
    icon: AlertCircle,
    label: "Medium Confidence",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
  },
  low: {
    icon: AlertTriangle,
    label: "Low Confidence",
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
};

export function ImportTypeSelector({
  detectedType,
  detection,
  selectedType,
  onTypeChange,
  disabled = false,
}: ImportTypeSelectorProps) {
  const [showDetails, setShowDetails] = useState(false);
  const confidenceInfo = confidenceConfig[detection.confidence];
  const ConfidenceIcon = confidenceInfo.icon;

  return (
    <div className="space-y-4">
      {/* Confidence Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            Auto-detected as:
          </span>
          <span className="font-semibold text-gray-900">
            {typeConfig[detectedType].label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${confidenceInfo.bgColor} ${confidenceInfo.color}`}
        >
          <ConfidenceIcon className="h-3 w-3" />
          {confidenceInfo.label}
        </button>
      </div>

      {/* Confidence Details */}
      {showDetails && (
        <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-gray-500 text-xs">Inventory Matches</div>
              <div className="font-semibold text-blue-600">
                {detection.inventoryMatches}
              </div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">Order Matches</div>
              <div className="font-semibold text-green-600">
                {detection.orderMatches}
              </div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">Ambiguous</div>
              <div className="font-semibold text-yellow-600">
                {detection.ambiguousMatches}
              </div>
            </div>
          </div>
          {detection.matchedInventoryHeaders.length > 0 && (
            <div>
              <span className="text-gray-500 text-xs">
                Inventory headers found:{" "}
              </span>
              <span className="text-gray-700">
                {detection.matchedInventoryHeaders.slice(0, 3).join(", ")}
                {detection.matchedInventoryHeaders.length > 3 && "..."}
              </span>
            </div>
          )}
          {detection.matchedOrderHeaders.length > 0 && (
            <div>
              <span className="text-gray-500 text-xs">
                Order headers found:{" "}
              </span>
              <span className="text-gray-700">
                {detection.matchedOrderHeaders.slice(0, 3).join(", ")}
                {detection.matchedOrderHeaders.length > 3 && "..."}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Low Confidence Warning */}
      {detection.confidence === "low" && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-800">
              Could not confidently detect file type
            </p>
            <p className="text-amber-700 mt-1">
              Please verify the selection below matches your data.
            </p>
          </div>
        </div>
      )}

      {/* Type Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(Object.keys(typeConfig) as ImportType[]).map((type) => {
          const config = typeConfig[type];
          const Icon = config.icon;
          const isSelected = selectedType === type;
          const isDetected = detectedType === type;

          return (
            <button
              key={type}
              type="button"
              onClick={() => onTypeChange(type)}
              disabled={disabled}
              className={`relative p-4 rounded-lg border-2 text-left transition-all ${
                isSelected
                  ? `${config.bgColor} border-current ${config.color}`
                  : "bg-white border-gray-200 hover:border-gray-300"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {isDetected && !isSelected && (
                <span className="absolute top-2 right-2 text-xs text-gray-400">
                  Detected
                </span>
              )}
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${isSelected ? config.bgColor : "bg-gray-100"}`}
                >
                  <Icon
                    className={`h-5 w-5 ${isSelected ? config.color : "text-gray-500"}`}
                  />
                </div>
                <div>
                  <div
                    className={`font-medium ${isSelected ? config.color : "text-gray-900"}`}
                  >
                    {config.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {config.description}
                  </div>
                </div>
              </div>
              {isSelected && (
                <CheckCircle
                  className={`absolute top-2 right-2 h-5 w-5 ${config.color}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Override Notice */}
      {selectedType !== detectedType && (
        <p className="text-sm text-gray-600 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" />
          You've changed the type from the auto-detected value. Column mappings
          will be regenerated.
        </p>
      )}
    </div>
  );
}
