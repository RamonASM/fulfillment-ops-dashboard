/**
 * Data Science Analytics Service Integration
 * Connects Node.js backend with Python DS Analytics service
 * Includes retry logic with exponential backoff for transient failures
 */
import axios, { AxiosInstance, AxiosError } from "axios";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

const DS_ANALYTICS_URL =
  process.env.DS_ANALYTICS_URL || "http://localhost:8000";

// =============================================================================
// TYPES
// =============================================================================

interface UsageCalculationResult {
  product_id: string;
  product_name: string;
  monthly_usage_units: number;
  monthly_usage_packs: number;
  weeks_remaining: number | null;
  stock_status: string;
  calculation_method: string;
  confidence_score: number;
  confidence_level: string;
  data_months: number;
  calculation_tier: string;
  trend: string;
  seasonality_detected: boolean;
  outliers_detected: number;
  predicted_stockout: {
    predicted_date: string | null;
    days_until_stockout: number | null;
    confidence_score: number;
    confidence_interval: {
      earliest: string;
      latest: string;
    } | null;
  } | null;
  reorder_suggestion: {
    suggested_quantity_packs: number;
    suggested_quantity_units: number;
    reorder_point_packs: number;
    safety_stock_packs: number;
    lead_time_demand_packs: number;
  } | null;
  validation_messages: Array<{
    level: string;
    message: string;
  }>;
  calculated_at: string;
}

interface HealthCheckResponse {
  status: string;
  database_connected: boolean;
  version: string;
  timestamp: string;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// =============================================================================
// RETRY UTILITY
// =============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Calculate delay for exponential backoff with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  // Exponential backoff: baseDelay * (multiplier ^ attempt)
  const exponentialDelay =
    config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

  return Math.floor(cappedDelay + jitter);
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;

    // Network errors are retryable
    if (!axiosError.response) {
      return true;
    }

    // 5xx server errors are retryable
    const status = axiosError.response.status;
    if (status >= 500 && status < 600) {
      return true;
    }

    // 429 Too Many Requests is retryable
    if (status === 429) {
      return true;
    }

    // 408 Request Timeout is retryable
    if (status === 408) {
      return true;
    }
  }

  // Connection errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const retryableMessages = [
      'econnreset',
      'econnrefused',
      'etimedout',
      'socket hang up',
      'network error',
    ];
    return retryableMessages.some(msg => message.includes(msg));
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  operation: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's not a retryable error
      if (!isRetryableError(error)) {
        throw error;
      }

      // Don't retry if we've exhausted all attempts
      if (attempt >= config.maxRetries) {
        logger.error(`${operation} failed after ${config.maxRetries + 1} attempts`, error as Error);
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, config);
      logger.warn(`${operation} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms`, {
        error: (error as Error).message,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

// =============================================================================
// DS ANALYTICS SERVICE
// =============================================================================

class DSAnalyticsService {
  private client: AxiosInstance;
  private retryConfig: RetryConfig;

  constructor(retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.retryConfig = retryConfig;
    this.client = axios.create({
      baseURL: DS_ANALYTICS_URL,
      timeout: 120000, // 2 minutes timeout for batch calculations
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Check if DS Analytics service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await withRetry(
        () => this.client.get<HealthCheckResponse>("/health"),
        "DS Analytics health check",
        { ...this.retryConfig, maxRetries: 1 } // Fewer retries for health check
      );
      return response.data.status === "healthy";
    } catch (error) {
      logger.warn("DS Analytics health check failed", { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Calculate monthly usage for multiple products
   */
  async calculateUsage(
    productIds: string[],
    clientId: string,
    forceRecalculate = false,
  ): Promise<UsageCalculationResult[]> {
    return withRetry(
      async () => {
        const response = await this.client.post<UsageCalculationResult[]>(
          "/calculate-usage",
          {
            product_ids: productIds,
            client_id: clientId,
            force_recalculate: forceRecalculate,
          },
        );
        return response.data;
      },
      `Calculate usage for ${productIds.length} products`,
      this.retryConfig
    );
  }

  /**
   * Trigger background recalculation for entire client
   */
  async recalculateClient(clientId: string): Promise<void> {
    await withRetry(
      () => this.client.post(`/calculate-usage/client/${clientId}`),
      `Recalculate usage for client ${clientId}`,
      this.retryConfig
    );
  }

  /**
   * Get DS Analytics service statistics
   */
  async getStats(): Promise<Record<string, unknown> | null> {
    try {
      const response = await withRetry(
        () => this.client.get("/stats"),
        "Get DS analytics stats",
        { ...this.retryConfig, maxRetries: 1 }
      );
      return response.data;
    } catch (error) {
      logger.error("Failed to get DS analytics stats", error as Error);
      return null;
    }
  }
}

// Singleton instance
export const dsAnalyticsService = new DSAnalyticsService();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate usage for products after import
 * This should be called after every CSV import
 */
export async function calculateUsageAfterImport(
  productIds: string[],
  clientId: string,
): Promise<void> {
  try {
    logger.info("Calculating usage after import", { productCount: productIds.length, clientId });

    // Check if DS service is available
    const isHealthy = await dsAnalyticsService.healthCheck();

    if (!isHealthy) {
      logger.warn("DS Analytics service unavailable, skipping usage calculation");
      return;
    }

    // Calculate usage in batches of 100
    const batchSize = 100;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(productIds.length / batchSize);

      try {
        await dsAnalyticsService.calculateUsage(batch, clientId);
        successCount += batch.length;
        logger.info(`Calculated usage for batch ${batchNumber}/${totalBatches}`, {
          batchSize: batch.length,
          successCount,
        });
      } catch (error) {
        failureCount += batch.length;
        logger.error(`Failed to calculate batch ${batchNumber}/${totalBatches}`, error as Error);
        // Continue with next batch even if one fails
      }
    }

    logger.info("Usage calculation completed", {
      productCount: productIds.length,
      successCount,
      failureCount,
    });
  } catch (error) {
    logger.error("Error in calculateUsageAfterImport", error as Error);
  }
}

/**
 * Recalculate usage for all client products
 * Can be called manually or on a schedule
 */
export async function recalculateClientUsage(clientId: string): Promise<void> {
  const isHealthy = await dsAnalyticsService.healthCheck();

  if (!isHealthy) {
    throw new Error("DS Analytics service is not available");
  }

  await dsAnalyticsService.recalculateClient(clientId);
  logger.info("Started background usage recalculation", { clientId });
}

/**
 * Recalculate usage for all clients
 * Should be run daily via scheduler
 */
export async function recalculateAllClientsUsage(): Promise<void> {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  logger.info("Starting usage recalculation for all clients", { clientCount: clients.length });

  let successCount = 0;
  let failureCount = 0;

  for (const client of clients) {
    try {
      await recalculateClientUsage(client.id);
      successCount++;
      logger.info("Triggered recalculation for client", {
        clientId: client.id,
        clientName: client.name,
      });

      // Small delay between clients to avoid overloading
      await sleep(1000);
    } catch (error) {
      failureCount++;
      logger.error("Failed to recalculate client", error as Error, {
        clientName: client.name,
      });
      // Continue with other clients
    }
  }

  logger.info("All client recalculations completed", {
    total: clients.length,
    success: successCount,
    failed: failureCount,
  });
}
