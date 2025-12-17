/**
 * Data Science Analytics Service Integration
 * Connects Node.js backend with Python DS Analytics service
 */
import axios, { AxiosInstance } from "axios";
import { prisma } from "../lib/prisma";

const DS_ANALYTICS_URL =
  process.env.DS_ANALYTICS_URL || "http://localhost:8000";

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

interface BatchCalculationRequest {
  product_ids: string[];
  client_id: string;
  force_recalculate?: boolean;
}

interface HealthCheckResponse {
  status: string;
  database_connected: boolean;
  version: string;
  timestamp: string;
}

class DSAnalyticsService {
  private client: AxiosInstance;

  constructor() {
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
      const response = await this.client.get<HealthCheckResponse>("/health");
      return response.data.status === "healthy";
    } catch (error) {
      console.error("DS Analytics health check failed:", error);
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
    try {
      const response = await this.client.post<UsageCalculationResult[]>(
        "/calculate-usage",
        {
          product_ids: productIds,
          client_id: clientId,
          force_recalculate: forceRecalculate,
        },
      );

      return response.data;
    } catch (error) {
      console.error("Failed to calculate usage via DS service:", error);
      throw new Error("Usage calculation failed");
    }
  }

  /**
   * Trigger background recalculation for entire client
   */
  async recalculateClient(clientId: string): Promise<void> {
    try {
      await this.client.post(`/calculate-usage/client/${clientId}`);
    } catch (error) {
      console.error("Failed to trigger client recalculation:", error);
      throw error;
    }
  }

  /**
   * Get DS Analytics service statistics
   */
  async getStats(): Promise<any> {
    try {
      const response = await this.client.get("/stats");
      return response.data;
    } catch (error) {
      console.error("Failed to get DS analytics stats:", error);
      return null;
    }
  }
}

// Singleton instance
export const dsAnalyticsService = new DSAnalyticsService();

/**
 * Calculate usage for products after import
 * This should be called after every CSV import
 */
export async function calculateUsageAfterImport(
  productIds: string[],
  clientId: string,
): Promise<void> {
  try {
    console.log(
      `Calculating usage for ${productIds.length} products after import...`,
    );

    // Check if DS service is available
    const isHealthy = await dsAnalyticsService.healthCheck();

    if (!isHealthy) {
      console.warn(
        "DS Analytics service unavailable, skipping usage calculation",
      );
      return;
    }

    // Calculate usage in batches of 100
    const batchSize = 100;
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);

      try {
        await dsAnalyticsService.calculateUsage(batch, clientId);
        console.log(`Calculated usage for batch ${i / batchSize + 1}`);
      } catch (error) {
        console.error(`Failed to calculate batch ${i / batchSize + 1}:`, error);
        // Continue with next batch even if one fails
      }
    }

    console.log("Usage calculation completed");
  } catch (error) {
    console.error("Error in calculateUsageAfterImport:", error);
  }
}

/**
 * Recalculate usage for all client products
 * Can be called manually or on a schedule
 */
export async function recalculateClientUsage(clientId: string): Promise<void> {
  try {
    const isHealthy = await dsAnalyticsService.healthCheck();

    if (!isHealthy) {
      throw new Error("DS Analytics service is not available");
    }

    await dsAnalyticsService.recalculateClient(clientId);

    console.log(
      `Started background usage recalculation for client ${clientId}`,
    );
  } catch (error) {
    console.error("Failed to recalculate client usage:", error);
    throw error;
  }
}

/**
 * Recalculate usage for all clients
 * Should be run daily via scheduler
 */
export async function recalculateAllClientsUsage(): Promise<void> {
  try {
    const clients = await prisma.client.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    console.log(
      `Starting usage recalculation for ${clients.length} clients...`,
    );

    for (const client of clients) {
      try {
        await recalculateClientUsage(client.id);
        console.log(`Triggered recalculation for ${client.name}`);

        // Small delay between clients to avoid overloading
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to recalculate ${client.name}:`, error);
        // Continue with other clients
      }
    }

    console.log("All client recalculations triggered");
  } catch (error) {
    console.error("Error in recalculateAllClientsUsage:", error);
    throw error;
  }
}
