/**
 * Shared Validation Schemas
 *
 * Phase 3.2: Backend Pattern Standardization
 *
 * Reusable Zod schemas for common API validation patterns.
 * Reduces duplication across 33+ route files.
 */

import { z } from "zod";

// =============================================================================
// PAGINATION SCHEMAS
// =============================================================================

/**
 * Standard pagination query parameters
 * Used in 20+ routes for list endpoints
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Max 100 to prevent performance issues and DoS - use pagination for larger datasets
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).optional(),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Pagination metadata for responses
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// =============================================================================
// ID VALIDATION SCHEMAS
// =============================================================================

/**
 * UUID validation for IDs
 */
export const uuidSchema = z.string().uuid();

/**
 * Client ID parameter validation
 */
export const clientIdSchema = z.object({
  clientId: z.string().uuid(),
});

export type ClientIdParam = z.infer<typeof clientIdSchema>;

/**
 * Product ID parameter validation
 */
export const productIdSchema = z.object({
  productId: z.string().uuid(),
});

export type ProductIdParam = z.infer<typeof productIdSchema>;

/**
 * Import ID parameter validation
 */
export const importIdSchema = z.object({
  importId: z.string().uuid(),
});

export type ImportIdParam = z.infer<typeof importIdSchema>;

// =============================================================================
// DATE RANGE SCHEMAS
// =============================================================================

/**
 * Date range query parameters
 * Used in analytics, reports, and filtering
 */
export const dateRangeSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be after or equal to start date",
    path: ["endDate"],
  });

export type DateRangeParams = z.infer<typeof dateRangeSchema>;

/**
 * Optional date range (for filtering)
 */
export const optionalDateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type OptionalDateRangeParams = z.infer<typeof optionalDateRangeSchema>;

// =============================================================================
// STATUS FILTER SCHEMAS
// =============================================================================

/**
 * Generic status filter
 */
export const statusFilterSchema = z.object({
  status: z
    .enum([
      "pending",
      "processing",
      "completed",
      "failed",
      "active",
      "inactive",
    ])
    .optional(),
});

export type StatusFilterParams = z.infer<typeof statusFilterSchema>;

/**
 * Import status filter
 */
export const importStatusSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
});

export type ImportStatusParams = z.infer<typeof importStatusSchema>;

/**
 * Order status filter
 */
export const orderStatusSchema = z.object({
  orderStatus: z
    .enum(["pending", "processing", "completed", "cancelled"])
    .optional(),
});

export type OrderStatusParams = z.infer<typeof orderStatusSchema>;

/**
 * Alert status filter
 */
export const alertStatusSchema = z.object({
  status: z.enum(["active", "dismissed", "snoozed"]).optional(),
  severity: z.enum(["info", "warning", "error", "critical"]).optional(),
});

export type AlertStatusParams = z.infer<typeof alertStatusSchema>;

// =============================================================================
// SORTING SCHEMAS
// =============================================================================

/**
 * Sort direction
 */
export const sortDirectionSchema = z.enum(["asc", "desc"]).default("desc");

export type SortDirection = z.infer<typeof sortDirectionSchema>;

/**
 * Generic sort parameters
 */
export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortDirection: sortDirectionSchema.optional(),
});

export type SortParams = z.infer<typeof sortSchema>;

// =============================================================================
// SEARCH SCHEMAS
// =============================================================================

/**
 * Search query parameter
 */
export const searchSchema = z.object({
  q: z.string().min(1).max(255).optional(),
  search: z.string().min(1).max(255).optional(),
});

export type SearchParams = z.infer<typeof searchSchema>;

// =============================================================================
// COMBINED SCHEMAS (Common Combinations)
// =============================================================================

/**
 * Pagination + Search
 */
export const paginatedSearchSchema = paginationSchema.merge(searchSchema);

export type PaginatedSearchParams = z.infer<typeof paginatedSearchSchema>;

/**
 * Pagination + Sorting
 */
export const paginatedSortSchema = paginationSchema.merge(sortSchema);

export type PaginatedSortParams = z.infer<typeof paginatedSortSchema>;

/**
 * Pagination + Date Range
 */
export const paginatedDateRangeSchema = paginationSchema.merge(
  optionalDateRangeSchema,
);

export type PaginatedDateRangeParams = z.infer<typeof paginatedDateRangeSchema>;

/**
 * Full query schema (pagination + search + sort + filters)
 */
export const fullQuerySchema = paginationSchema
  .merge(searchSchema)
  .merge(sortSchema)
  .merge(statusFilterSchema);

export type FullQueryParams = z.infer<typeof fullQuerySchema>;

// =============================================================================
// IMPORT COLUMN MAPPING SCHEMAS
// =============================================================================

/**
 * Single column mapping entry
 * Maps a source CSV column to a database field
 */
export const columnMappingEntrySchema = z.object({
  source: z.string().min(1, "Source column name is required").max(255),
  mapsTo: z.string().min(1, "Target field name is required").max(255),
  isCustomField: z.boolean().optional().default(false),
});

export type ColumnMappingEntry = z.infer<typeof columnMappingEntrySchema>;

/**
 * Array of column mappings for import processing
 */
export const columnMappingsSchema = z
  .array(columnMappingEntrySchema)
  .min(1, "At least one column mapping is required");

export type ColumnMappings = z.infer<typeof columnMappingsSchema>;

/**
 * Process import request body (including column mappings)
 */
export const processImportSchema = z.object({
  columnMapping: columnMappingsSchema,
});

export type ProcessImportBody = z.infer<typeof processImportSchema>;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate pagination metadata
 *
 * @param total - Total number of items
 * @param page - Current page
 * @param limit - Items per page
 * @returns Pagination metadata
 */
export function calculatePagination(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
  };
}

/**
 * Calculate offset from page and limit
 *
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 * @returns Offset for database query (0-indexed)
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}
