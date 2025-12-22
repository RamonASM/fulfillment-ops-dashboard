/**
 * Pagination Hook
 *
 * Phase 3.1: Custom Hooks Library
 *
 * Manages pagination state and provides helper functions for navigating pages.
 */

import { useState, useMemo } from 'react';

export interface PaginationState {
  page: number;
  limit: number;
  offset: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginationActions {
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  setLimit: (limit: number) => void;
}

export interface UsePaginationResult extends PaginationState, PaginationActions {}

/**
 * Pagination hook for managing page state
 *
 * @param totalItems - Total number of items
 * @param initialLimit - Initial page size (default: 20)
 * @param initialPage - Initial page number (default: 1)
 * @returns Pagination state and actions
 *
 * @example
 * ```tsx
 * const { page, limit, offset, nextPage, prevPage } = usePagination(data.length);
 *
 * const paginatedData = data.slice(offset, offset + limit);
 * ```
 */
export function usePagination(
  totalItems: number,
  initialLimit: number = 20,
  initialPage: number = 1
): UsePaginationResult {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);

  // Calculate derived values
  const totalPages = useMemo(() => Math.ceil(totalItems / limit), [totalItems, limit]);
  const offset = useMemo(() => (page - 1) * limit, [page, limit]);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  // Ensure page is within bounds when total items change
  const validPage = Math.min(Math.max(page, 1), totalPages || 1);
  if (validPage !== page) {
    setPage(validPage);
  }

  // Navigation actions
  const nextPage = () => {
    if (hasNextPage) {
      setPage((p) => p + 1);
    }
  };

  const prevPage = () => {
    if (hasPrevPage) {
      setPage((p) => p - 1);
    }
  };

  const firstPage = () => setPage(1);

  const lastPage = () => {
    if (totalPages > 0) {
      setPage(totalPages);
    }
  };

  const handleSetPage = (newPage: number) => {
    const clampedPage = Math.min(Math.max(newPage, 1), totalPages || 1);
    setPage(clampedPage);
  };

  const handleSetLimit = (newLimit: number) => {
    setLimit(newLimit);
    // Reset to first page when changing page size
    setPage(1);
  };

  return {
    // State
    page: validPage,
    limit,
    offset,
    totalPages,
    hasNextPage,
    hasPrevPage,
    // Actions
    setPage: handleSetPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    setLimit: handleSetLimit,
  };
}
