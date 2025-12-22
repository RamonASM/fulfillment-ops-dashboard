// =============================================================================
// QUERY KEY FACTORIES
// Centralized query key management for TanStack Query
// Enables consistent cache invalidation patterns
// =============================================================================

/**
 * Query key factory for clients
 */
export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...clientKeys.lists(), filters] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
  analytics: (id: string) => [...clientKeys.detail(id), 'analytics'] as const,
  locations: (id: string) => [...clientKeys.detail(id), 'locations'] as const,
  products: (id: string, filters?: Record<string, unknown>) =>
    [...clientKeys.detail(id), 'products', filters] as const,
  health: (id: string) => [...clientKeys.detail(id), 'health'] as const,
};

/**
 * Query key factory for products
 */
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (clientId: string, filters?: Record<string, unknown>) =>
    [...productKeys.lists(), clientId, filters] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
  forecast: (id: string, horizonDays?: number) =>
    [...productKeys.detail(id), 'forecast', horizonDays] as const,
  stockout: (id: string) => [...productKeys.detail(id), 'stockout'] as const,
};

/**
 * Query key factory for orders
 */
export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...orderKeys.lists(), filters] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
  pending: () => [...orderKeys.all, 'pending'] as const,
  byClient: (clientId: string) => [...orderKeys.all, 'client', clientId] as const,
};

/**
 * Query key factory for alerts
 */
export const alertKeys = {
  all: ['alerts'] as const,
  lists: () => [...alertKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...alertKeys.lists(), filters] as const,
  byClient: (clientId: string) => [...alertKeys.all, 'client', clientId] as const,
  unread: () => [...alertKeys.all, 'unread'] as const,
  count: () => [...alertKeys.all, 'count'] as const,
};

/**
 * Query key factory for analytics
 */
export const analyticsKeys = {
  all: ['analytics'] as const,
  dashboard: () => [...analyticsKeys.all, 'dashboard'] as const,
  summary: (clientId: string) => [...analyticsKeys.all, 'summary', clientId] as const,
  trends: (clientId: string, period?: string) =>
    [...analyticsKeys.all, 'trends', clientId, period] as const,
  anomalies: (clientId: string) => [...analyticsKeys.all, 'anomalies', clientId] as const,
  locations: (clientId: string) => [...analyticsKeys.all, 'locations', clientId] as const,
};

/**
 * Query key factory for users
 */
export const userKeys = {
  all: ['users'] as const,
  current: () => [...userKeys.all, 'current'] as const,
  preferences: () => [...userKeys.all, 'preferences'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
};

/**
 * Query key factory for imports
 */
export const importKeys = {
  all: ['imports'] as const,
  lists: () => [...importKeys.all, 'list'] as const,
  list: (clientId?: string) => [...importKeys.lists(), clientId] as const,
  detail: (id: string) => [...importKeys.all, 'detail', id] as const,
};

// =============================================================================
// STALE TIME CONFIGURATIONS
// Different data types have different freshness requirements
// =============================================================================

export const STALE_TIMES = {
  /** Real-time data: 30 seconds */
  realtime: 1000 * 30,
  /** Frequently changing data: 1 minute */
  frequent: 1000 * 60,
  /** Standard data: 5 minutes (default) */
  standard: 1000 * 60 * 5,
  /** Stable data: 10 minutes */
  stable: 1000 * 60 * 10,
  /** Static data: 30 minutes */
  static: 1000 * 60 * 30,
  /** Configuration data: 1 hour */
  config: 1000 * 60 * 60,
} as const;

// =============================================================================
// INVALIDATION HELPERS
// Utilities for invalidating related queries after mutations
// =============================================================================

import { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate all client-related queries
 */
export function invalidateClientQueries(queryClient: QueryClient, clientId?: string) {
  if (clientId) {
    queryClient.invalidateQueries({ queryKey: clientKeys.detail(clientId) });
  } else {
    queryClient.invalidateQueries({ queryKey: clientKeys.all });
  }
}

/**
 * Invalidate all product-related queries for a client
 */
export function invalidateProductQueries(queryClient: QueryClient, clientId: string, productId?: string) {
  if (productId) {
    queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
  }
  queryClient.invalidateQueries({ queryKey: clientKeys.products(clientId) });
}

/**
 * Invalidate all order-related queries
 */
export function invalidateOrderQueries(queryClient: QueryClient, clientId?: string) {
  queryClient.invalidateQueries({ queryKey: orderKeys.all });
  if (clientId) {
    queryClient.invalidateQueries({ queryKey: orderKeys.byClient(clientId) });
  }
}

/**
 * Invalidate all alert-related queries
 */
export function invalidateAlertQueries(queryClient: QueryClient, clientId?: string) {
  queryClient.invalidateQueries({ queryKey: alertKeys.all });
  if (clientId) {
    queryClient.invalidateQueries({ queryKey: alertKeys.byClient(clientId) });
  }
}

/**
 * Invalidate analytics queries after data changes
 */
export function invalidateAnalyticsQueries(queryClient: QueryClient, clientId?: string) {
  if (clientId) {
    queryClient.invalidateQueries({ queryKey: analyticsKeys.summary(clientId) });
    queryClient.invalidateQueries({ queryKey: analyticsKeys.trends(clientId) });
    queryClient.invalidateQueries({ queryKey: analyticsKeys.anomalies(clientId) });
  } else {
    queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
  }
}

/**
 * Invalidate after import completion
 */
export function invalidateAfterImport(queryClient: QueryClient, clientId: string) {
  invalidateClientQueries(queryClient, clientId);
  invalidateProductQueries(queryClient, clientId);
  invalidateAnalyticsQueries(queryClient, clientId);
  queryClient.invalidateQueries({ queryKey: importKeys.list(clientId) });
}
