import { useState } from 'react';
import { ChevronDown, ChevronUp, Database, DollarSign, Calendar, Tag, Truck, Building2 } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * Custom field value structure stored in Product.metadata.customFields
 */
interface CustomFieldValue {
  value: string | number | null;
  originalHeader: string;
  dataType: 'numeric' | 'numeric_positive' | 'numeric_integer' | 'date' | 'alphanumeric' | 'text' | 'boolean' | 'empty';
  lastUpdated: string;
}

interface ProductMetadata {
  customFields?: Record<string, CustomFieldValue>;
  _import?: {
    lastImportBatchId: string;
    originalHeaders: string[];
    mappedFields: string[];
    customFieldCount: number;
    importedAt: string;
  };
}

interface CustomFieldsDisplayProps {
  metadata: ProductMetadata | null | undefined;
  /** Show in compact mode (single row) */
  compact?: boolean;
  /** Maximum fields to show before "show more" */
  maxVisible?: number;
  /** Show the import info section */
  showImportInfo?: boolean;
  className?: string;
}

/**
 * Field category definitions for organizing custom fields
 */
const FIELD_CATEGORIES: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; fields: string[] }> = {
  financial: {
    label: 'Financial',
    icon: DollarSign,
    fields: ['unitCost', 'listPrice', 'totalValue', 'currency', 'pricePerPack', 'margin'],
  },
  vendor: {
    label: 'Vendor/Supplier',
    icon: Building2,
    fields: ['vendorName', 'vendorCode', 'vendorSku', 'minimumOrderQuantity', 'leadTimeDays'],
  },
  logistics: {
    label: 'Logistics',
    icon: Truck,
    fields: ['warehouse', 'binLocation', 'weight', 'dimensions', 'countryOfOrigin'],
  },
  category: {
    label: 'Classification',
    icon: Tag,
    fields: ['productCategory', 'subcategory', 'brand', 'department', 'productStatus', 'isDiscontinued'],
  },
  dates: {
    label: 'Dates',
    icon: Calendar,
    fields: ['lastOrderedDate', 'lastSoldDate'],
  },
  other: {
    label: 'Other',
    icon: Database,
    fields: [], // Catch-all for unmapped fields
  },
};

/**
 * Format a field name for display
 * Converts camelCase to Title Case
 */
function formatFieldName(fieldName: string): string {
  return fieldName
    // Insert space before capital letters
    .replace(/([A-Z])/g, ' $1')
    // Capitalize first letter
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Format a field value for display based on data type
 */
function formatFieldValue(field: CustomFieldValue): string {
  if (field.value === null || field.value === undefined || field.value === '') {
    return '—';
  }

  const value = field.value;

  switch (field.dataType) {
    case 'numeric':
    case 'numeric_positive':
      // Check if it looks like currency
      if (typeof value === 'number') {
        // Format with thousands separator
        return value.toLocaleString(undefined, {
          minimumFractionDigits: value % 1 !== 0 ? 2 : 0,
          maximumFractionDigits: 2,
        });
      }
      return String(value);

    case 'numeric_integer':
      return typeof value === 'number' ? value.toLocaleString() : String(value);

    case 'date':
      try {
        const date = new Date(String(value));
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString();
        }
      } catch {
        // Fall through to default
      }
      return String(value);

    case 'boolean':
      const boolValue = String(value).toLowerCase();
      if (['true', 'yes', '1', 'y'].includes(boolValue)) return 'Yes';
      if (['false', 'no', '0', 'n'].includes(boolValue)) return 'No';
      return String(value);

    default:
      return String(value);
  }
}

/**
 * Get the category for a field
 */
function getFieldCategory(fieldName: string): string {
  for (const [category, config] of Object.entries(FIELD_CATEGORIES)) {
    if (config.fields.includes(fieldName)) {
      return category;
    }
  }
  return 'other';
}

/**
 * Get icon for a field based on its name/category
 */
function getFieldIcon(fieldName: string): React.ComponentType<{ className?: string }> {
  const category = getFieldCategory(fieldName);
  return FIELD_CATEGORIES[category]?.icon || Database;
}

/**
 * Check if a value looks like currency
 */
function isCurrencyField(fieldName: string): boolean {
  const currencyPatterns = ['cost', 'price', 'value', 'margin', 'msrp', 'retail'];
  return currencyPatterns.some(pattern => fieldName.toLowerCase().includes(pattern));
}

export function CustomFieldsDisplay({
  metadata,
  compact = false,
  maxVisible = 6,
  showImportInfo = false,
  className,
}: CustomFieldsDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const customFields = metadata?.customFields;
  const importInfo = metadata?._import;

  if (!customFields || Object.keys(customFields).length === 0) {
    return null;
  }

  const fieldEntries = Object.entries(customFields).filter(
    ([_, field]) => field.value !== null && field.value !== ''
  );

  if (fieldEntries.length === 0) {
    return null;
  }

  // Group fields by category
  const groupedFields: Record<string, [string, CustomFieldValue][]> = {};
  for (const entry of fieldEntries) {
    const category = getFieldCategory(entry[0]);
    if (!groupedFields[category]) {
      groupedFields[category] = [];
    }
    groupedFields[category].push(entry);
  }

  const visibleFields = isExpanded ? fieldEntries : fieldEntries.slice(0, maxVisible);
  const hasMore = fieldEntries.length > maxVisible;

  if (compact) {
    // Compact mode: single row of badges
    return (
      <div className={clsx('flex flex-wrap gap-1.5', className)}>
        {visibleFields.map(([name, field]) => {
          const Icon = getFieldIcon(name);
          const isCurrency = isCurrencyField(name);
          const displayValue = formatFieldValue(field);

          return (
            <span
              key={name}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-md"
              title={`${formatFieldName(name)}: ${displayValue} (from "${field.originalHeader}")`}
            >
              <Icon className="w-3 h-3 text-gray-400" />
              {isCurrency && '$'}
              {displayValue}
            </span>
          );
        })}
        {hasMore && !isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 text-xs rounded-md hover:bg-gray-100"
          >
            +{fieldEntries.length - maxVisible} more
          </button>
        )}
      </div>
    );
  }

  // Full mode: grouped by category
  return (
    <div className={clsx('space-y-4', className)}>
      {showImportInfo && importInfo && (
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <Database className="w-3.5 h-3.5" />
          <span>
            {importInfo.customFieldCount} custom fields from import on{' '}
            {new Date(importInfo.importedAt).toLocaleDateString()}
          </span>
        </div>
      )}

      <div className="grid gap-4">
        {Object.entries(groupedFields).map(([category, fields]) => {
          const config = FIELD_CATEGORIES[category];
          const Icon = config?.icon || Database;

          return (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Icon className="w-4 h-4 text-gray-400" />
                {config?.label || 'Other'}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {fields.map(([name, field]) => {
                  const isCurrency = isCurrencyField(name);
                  const displayValue = formatFieldValue(field);

                  return (
                    <div
                      key={name}
                      className="bg-gray-50 rounded-lg px-3 py-2"
                      title={`Original column: "${field.originalHeader}"`}
                    >
                      <div className="text-xs text-gray-500 truncate">
                        {formatFieldName(name)}
                      </div>
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {isCurrency && field.value !== null && '$'}
                        {displayValue}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show {fieldEntries.length - maxVisible} more fields
            </>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * Simple inline display of key custom fields (for table rows)
 */
export function CustomFieldsBadges({
  metadata,
  fields = ['unitCost', 'vendorName', 'leadTimeDays'],
  className,
}: {
  metadata: ProductMetadata | null | undefined;
  fields?: string[];
  className?: string;
}) {
  const customFields = metadata?.customFields;

  if (!customFields) {
    return null;
  }

  const availableFields = fields.filter(f => customFields[f]?.value != null);

  if (availableFields.length === 0) {
    return null;
  }

  return (
    <div className={clsx('flex flex-wrap gap-1', className)}>
      {availableFields.map(fieldName => {
        const field = customFields[fieldName];
        const Icon = getFieldIcon(fieldName);
        const isCurrency = isCurrencyField(fieldName);
        const displayValue = formatFieldValue(field);

        return (
          <span
            key={fieldName}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded"
            title={formatFieldName(fieldName)}
          >
            <Icon className="w-3 h-3" />
            {isCurrency && '$'}
            {displayValue}
          </span>
        );
      })}
    </div>
  );
}

export default CustomFieldsDisplay;
