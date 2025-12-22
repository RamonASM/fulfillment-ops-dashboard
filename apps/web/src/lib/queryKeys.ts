/**
 * Query Keys - Re-export from shared package
 *
 * This file re-exports the shared query keys for backward compatibility.
 * New code should import directly from '@inventory/shared/lib'.
 */

export {
  clientKeys,
  productKeys,
  orderKeys,
  alertKeys,
  analyticsKeys,
  userKeys,
  importKeys,
  STALE_TIMES,
  invalidateClientQueries,
  invalidateProductQueries,
  invalidateOrderQueries,
  invalidateAlertQueries,
  invalidateAnalyticsQueries,
  invalidateAfterImport,
} from '@inventory/shared/lib';
