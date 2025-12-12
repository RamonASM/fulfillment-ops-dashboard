/**
 * Custom Field Service
 * Manages the discovery, registration, and configuration of custom fields per client.
 * Custom fields are additional data columns found during imports that are stored in Product.metadata.
 */

import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';

// =============================================================================
// TYPES
// =============================================================================

export interface CustomFieldDefinition {
  id: string;
  normalizedName: string;
  displayName: string;
  dataType: string;
  category: string | null;
  isDisplayed: boolean;
  isPinned: boolean;
  displayOrder: number;
  aggregationType: string | null;
  formatPattern: string | null;
  knownAliases: string[];
}

export interface CustomFieldValue {
  value: string | number | null;
  originalHeader: string;
  dataType: string;
  lastUpdated: string;
}

export interface CustomFieldStats {
  fieldName: string;
  displayName: string;
  dataType: string;
  category: string | null;
  productCount: number;
  nonNullCount: number;
  uniqueValues?: number;
  numericStats?: {
    min: number;
    max: number;
    avg: number;
    sum: number;
  };
}

interface FieldCategoryMapping {
  patterns: string[];
  category: string;
}

// =============================================================================
// FIELD CATEGORY DETECTION
// =============================================================================

const FIELD_CATEGORIES: FieldCategoryMapping[] = [
  {
    patterns: ['cost', 'price', 'value', 'margin', 'msrp', 'retail', 'currency'],
    category: 'financial',
  },
  {
    patterns: ['vendor', 'supplier', 'manufacturer', 'mfg', 'brand', 'lead', 'moq', 'minimum'],
    category: 'vendor',
  },
  {
    patterns: ['warehouse', 'bin', 'location', 'shelf', 'rack', 'weight', 'dimension', 'country', 'origin'],
    category: 'logistics',
  },
  {
    patterns: ['category', 'subcategory', 'classification', 'department', 'type', 'class', 'group'],
    category: 'classification',
  },
  {
    patterns: ['status', 'discontinued', 'lifecycle', 'active', 'obsolete'],
    category: 'status',
  },
  {
    patterns: ['date', 'last', 'first', 'created', 'updated'],
    category: 'dates',
  },
  {
    patterns: ['note', 'comment', 'remark', 'memo', 'description'],
    category: 'notes',
  },
];

/**
 * Detect the category for a field based on its name
 */
function detectFieldCategory(fieldName: string): string | null {
  const normalized = fieldName.toLowerCase();

  for (const { patterns, category } of FIELD_CATEGORIES) {
    if (patterns.some(pattern => normalized.includes(pattern))) {
      return category;
    }
  }

  return null;
}

/**
 * Convert a camelCase or snake_case field name to a human-readable display name
 */
function generateDisplayName(fieldName: string): string {
  return fieldName
    // Insert space before capital letters
    .replace(/([A-Z])/g, ' $1')
    // Replace underscores with spaces
    .replace(/_/g, ' ')
    // Capitalize first letter of each word
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

/**
 * Determine format pattern based on field name and data type
 */
function detectFormatPattern(fieldName: string, dataType: string): string | null {
  const normalized = fieldName.toLowerCase();

  if (dataType.startsWith('numeric')) {
    if (normalized.includes('cost') || normalized.includes('price') ||
        normalized.includes('value') || normalized.includes('msrp')) {
      return '$#,##0.00';
    }
    if (normalized.includes('percent') || normalized.includes('rate')) {
      return '#,##0.0%';
    }
    if (normalized.includes('weight')) {
      return '#,##0.00 lbs';
    }
  }

  return null;
}

/**
 * Determine aggregation type based on field name and data type
 */
function detectAggregationType(fieldName: string, dataType: string): string | null {
  if (!dataType.startsWith('numeric')) {
    return null;
  }

  const normalized = fieldName.toLowerCase();

  if (normalized.includes('cost') || normalized.includes('price') || normalized.includes('value')) {
    return 'sum';
  }
  if (normalized.includes('lead') || normalized.includes('day') || normalized.includes('time')) {
    return 'avg';
  }
  if (normalized.includes('weight')) {
    return 'sum';
  }

  return 'sum'; // Default for numeric fields
}

// =============================================================================
// CUSTOM FIELD DISCOVERY
// =============================================================================

/**
 * Discover and register custom fields from an import's column mapping
 */
export async function discoverCustomFields(
  clientId: string,
  customHeaders: Array<{ source: string; mapsTo: string; dataType: string }>
): Promise<CustomFieldDefinition[]> {
  const discovered: CustomFieldDefinition[] = [];

  for (const header of customHeaders) {
    const existing = await prisma.clientCustomFieldDefinition.findUnique({
      where: {
        clientId_normalizedName: {
          clientId,
          normalizedName: header.mapsTo,
        },
      },
    });

    if (existing) {
      // Update known aliases if this header name is new
      const existingAliases = (existing.knownAliases as string[]) || [];
      if (!existingAliases.includes(header.source)) {
        await prisma.clientCustomFieldDefinition.update({
          where: { id: existing.id },
          data: {
            knownAliases: [...existingAliases, header.source] as unknown as Prisma.InputJsonValue,
          },
        });
      }

      discovered.push({
        id: existing.id,
        normalizedName: existing.normalizedName,
        displayName: existing.displayName,
        dataType: existing.dataType,
        category: existing.category,
        isDisplayed: existing.isDisplayed,
        isPinned: existing.isPinned,
        displayOrder: existing.displayOrder,
        aggregationType: existing.aggregationType,
        formatPattern: existing.formatPattern,
        knownAliases: [...existingAliases, header.source],
      });
    } else {
      // Create new custom field definition
      const category = detectFieldCategory(header.mapsTo);
      const displayName = generateDisplayName(header.mapsTo);
      const formatPattern = detectFormatPattern(header.mapsTo, header.dataType);
      const aggregationType = detectAggregationType(header.mapsTo, header.dataType);

      // Get highest display order for this client
      const maxOrder = await prisma.clientCustomFieldDefinition.aggregate({
        where: { clientId },
        _max: { displayOrder: true },
      });

      const newField = await prisma.clientCustomFieldDefinition.create({
        data: {
          clientId,
          normalizedName: header.mapsTo,
          displayName,
          dataType: header.dataType,
          category,
          knownAliases: [header.source] as unknown as Prisma.InputJsonValue,
          isDisplayed: true,
          isPinned: false,
          displayOrder: (maxOrder._max.displayOrder || 0) + 1,
          aggregationType,
          formatPattern,
        },
      });

      discovered.push({
        id: newField.id,
        normalizedName: newField.normalizedName,
        displayName: newField.displayName,
        dataType: newField.dataType,
        category: newField.category,
        isDisplayed: newField.isDisplayed,
        isPinned: newField.isPinned,
        displayOrder: newField.displayOrder,
        aggregationType: newField.aggregationType,
        formatPattern: newField.formatPattern,
        knownAliases: [header.source],
      });
    }
  }

  return discovered;
}

// =============================================================================
// CUSTOM FIELD MANAGEMENT
// =============================================================================

/**
 * Get all custom field definitions for a client
 */
export async function getClientCustomFields(clientId: string): Promise<CustomFieldDefinition[]> {
  const fields = await prisma.clientCustomFieldDefinition.findMany({
    where: { clientId },
    orderBy: [
      { isPinned: 'desc' },
      { displayOrder: 'asc' },
    ],
  });

  return fields.map(f => ({
    id: f.id,
    normalizedName: f.normalizedName,
    displayName: f.displayName,
    dataType: f.dataType,
    category: f.category,
    isDisplayed: f.isDisplayed,
    isPinned: f.isPinned,
    displayOrder: f.displayOrder,
    aggregationType: f.aggregationType,
    formatPattern: f.formatPattern,
    knownAliases: (f.knownAliases as string[]) || [],
  }));
}

/**
 * Update a custom field definition
 */
export async function updateCustomFieldDefinition(
  fieldId: string,
  updates: Partial<Pick<CustomFieldDefinition,
    'displayName' | 'isDisplayed' | 'isPinned' | 'displayOrder' | 'aggregationType' | 'formatPattern'
  >>
): Promise<CustomFieldDefinition> {
  const updated = await prisma.clientCustomFieldDefinition.update({
    where: { id: fieldId },
    data: updates,
  });

  return {
    id: updated.id,
    normalizedName: updated.normalizedName,
    displayName: updated.displayName,
    dataType: updated.dataType,
    category: updated.category,
    isDisplayed: updated.isDisplayed,
    isPinned: updated.isPinned,
    displayOrder: updated.displayOrder,
    aggregationType: updated.aggregationType,
    formatPattern: updated.formatPattern,
    knownAliases: (updated.knownAliases as string[]) || [],
  };
}

/**
 * Delete a custom field definition (does not delete data from products)
 */
export async function deleteCustomFieldDefinition(fieldId: string): Promise<void> {
  await prisma.clientCustomFieldDefinition.delete({
    where: { id: fieldId },
  });
}

// =============================================================================
// CUSTOM FIELD STATISTICS
// =============================================================================

/**
 * Calculate aggregate statistics for custom fields across all products of a client
 */
export async function getCustomFieldStats(clientId: string): Promise<CustomFieldStats[]> {
  // Get all products with their metadata
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  });

  // Get field definitions
  const fieldDefs = await getClientCustomFields(clientId);
  const fieldDefMap = new Map(fieldDefs.map(f => [f.normalizedName, f]));

  // Aggregate stats for each field
  const statsMap = new Map<string, {
    productCount: number;
    nonNullCount: number;
    values: Set<string | number>;
    numericValues: number[];
  }>();

  for (const product of products) {
    const metadata = product.metadata as any;
    const customFields = metadata?.customFields as Record<string, CustomFieldValue> | undefined;

    if (!customFields) continue;

    for (const [fieldName, fieldValue] of Object.entries(customFields)) {
      if (!statsMap.has(fieldName)) {
        statsMap.set(fieldName, {
          productCount: 0,
          nonNullCount: 0,
          values: new Set(),
          numericValues: [],
        });
      }

      const stats = statsMap.get(fieldName)!;
      stats.productCount++;

      if (fieldValue.value !== null && fieldValue.value !== '') {
        stats.nonNullCount++;
        stats.values.add(String(fieldValue.value));

        if (typeof fieldValue.value === 'number') {
          stats.numericValues.push(fieldValue.value);
        }
      }
    }
  }

  // Convert to result array
  const results: CustomFieldStats[] = [];

  for (const [fieldName, stats] of Array.from(statsMap.entries())) {
    const fieldDef = fieldDefMap.get(fieldName);

    const result: CustomFieldStats = {
      fieldName,
      displayName: fieldDef?.displayName || generateDisplayName(fieldName),
      dataType: fieldDef?.dataType || 'text',
      category: fieldDef?.category || null,
      productCount: stats.productCount,
      nonNullCount: stats.nonNullCount,
      uniqueValues: stats.values.size,
    };

    // Add numeric stats if applicable
    if (stats.numericValues.length > 0) {
      const sorted = stats.numericValues.sort((a, b) => a - b);
      result.numericStats = {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        sum: sorted.reduce((a, b) => a + b, 0),
      };
    }

    results.push(result);
  }

  // Sort by product count (most common first)
  return results.sort((a, b) => b.productCount - a.productCount);
}

/**
 * Get aggregate values for a specific custom field (for dashboard widgets)
 */
export async function getCustomFieldAggregates(
  clientId: string,
  fieldName: string
): Promise<{
  fieldName: string;
  aggregations: {
    sum?: number;
    avg?: number;
    min?: number;
    max?: number;
    count: number;
    nonNullCount: number;
  };
  topValues?: Array<{ value: string; count: number }>;
}> {
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  });

  const numericValues: number[] = [];
  const valueCountMap = new Map<string, number>();
  let nonNullCount = 0;

  for (const product of products) {
    const metadata = product.metadata as any;
    const customFields = metadata?.customFields as Record<string, CustomFieldValue> | undefined;
    const fieldValue = customFields?.[fieldName];

    if (!fieldValue || fieldValue.value === null || fieldValue.value === '') continue;

    nonNullCount++;

    // Track value for top values
    const strValue = String(fieldValue.value);
    valueCountMap.set(strValue, (valueCountMap.get(strValue) || 0) + 1);

    // Track numeric value
    if (typeof fieldValue.value === 'number') {
      numericValues.push(fieldValue.value);
    }
  }

  const result: ReturnType<typeof getCustomFieldAggregates> extends Promise<infer T> ? T : never = {
    fieldName,
    aggregations: {
      count: products.length,
      nonNullCount,
    },
  };

  // Add numeric aggregations
  if (numericValues.length > 0) {
    const sorted = numericValues.sort((a, b) => a - b);
    result.aggregations.sum = sorted.reduce((a, b) => a + b, 0);
    result.aggregations.avg = result.aggregations.sum / sorted.length;
    result.aggregations.min = sorted[0];
    result.aggregations.max = sorted[sorted.length - 1];
  }

  // Add top values (for categorical fields)
  if (valueCountMap.size <= 50) {
    result.topValues = Array.from(valueCountMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  return result;
}

/**
 * Get distribution of a categorical custom field
 */
export async function getCustomFieldDistribution(
  clientId: string,
  fieldName: string
): Promise<Array<{ value: string; count: number; percentage: number }>> {
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  });

  const valueCountMap = new Map<string, number>();
  let total = 0;

  for (const product of products) {
    const metadata = product.metadata as any;
    const customFields = metadata?.customFields as Record<string, CustomFieldValue> | undefined;
    const fieldValue = customFields?.[fieldName];

    if (!fieldValue || fieldValue.value === null || fieldValue.value === '') continue;

    const strValue = String(fieldValue.value);
    valueCountMap.set(strValue, (valueCountMap.get(strValue) || 0) + 1);
    total++;
  }

  return Array.from(valueCountMap.entries())
    .map(([value, count]) => ({
      value,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
