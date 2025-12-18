/**
 * =============================================================================
 * AI-POWERED COLUMN MAPPING SERVICE
 * =============================================================================
 *
 * Revolutionary semantic column mapping using Claude AI for intelligent,
 * context-aware field recognition. This service understands the meaning
 * behind column headers and sample data, not just string similarity.
 *
 * Features:
 * - Semantic understanding of business terminology
 * - Context-aware field recommendations
 * - Confidence scoring with explanations
 * - Caching for cost efficiency
 * - Fallback to Jaro-Winkler when AI is unavailable
 *
 * @author Claude Code
 * @version 1.0.0
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";
import { LRUCache } from "lru-cache";
import { decrypt, isEncryptionConfigured } from "../lib/encryption.js";

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface AIMappingRequest {
  headers: string[];
  sampleData: string[][];
  fileType: "inventory" | "order";
  clientId?: string;
}

export interface AIFieldMapping {
  sourceHeader: string;
  targetField: string | null;
  confidence: number;
  reasoning: string;
  alternatives?: Array<{
    field: string;
    confidence: number;
    reason: string;
  }>;
}

export interface AIMappingResponse {
  mappings: AIFieldMapping[];
  aiUsed: boolean;
  cached: boolean;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
}

// =============================================================================
// AVAILABLE FIELDS DEFINITION
// =============================================================================

/**
 * Complete list of database fields available for mapping with descriptions.
 * Claude uses these descriptions to understand the semantic meaning of each field.
 */
const INVENTORY_FIELDS = {
  // Core product identification
  productId: "Unique product identifier, SKU, item number, or part number",
  name: "Product name, item name, or description",
  itemType:
    "Product type or category (e.g., 'evergreen', 'seasonal', 'promotional')",

  // Stock quantities
  currentStockPacks: "Current inventory quantity in packs, cases, or cartons",
  currentStockUnits: "Current inventory quantity in individual units",
  packSize: "Units per pack, case quantity, or quantity multiplier",

  // Reorder management
  notificationPoint:
    "Reorder point, alert threshold, or notification level in packs",
  reorderPointPacks: "Minimum stock level that triggers reorder",

  // Usage metrics (critical for Everstory imports)
  monthlyUsageUnits:
    "Monthly consumption rate in units, burn rate, or usage rate",
  calculationBasis:
    "Time period for usage calculation (e.g., '12 months', '6 months')",

  // Reserved inventory (critical for Everstory imports)
  reservedQuantity:
    "Allocated or committed quantity not available for general use",
  reservedUnits: "Reserved quantity in individual units",
  availableQuantity: "Net available inventory (stock minus reserved)",

  // Financial
  unitCost: "Cost per unit, wholesale price, or purchase price",
  listPrice: "Retail price, selling price, or MSRP",
  totalValue: "Extended value, inventory value, or total cost",

  // Vendor/Supplier
  vendorName: "Supplier name, manufacturer, or brand",
  vendorCode: "Supplier ID, vendor number",
  vendorSku: "Manufacturer part number, supplier SKU",
  leadTimeDays: "Delivery time, replenishment time in days",
  minimumOrderQuantity: "MOQ, minimum order quantity from supplier",

  // Logistics
  warehouse: "Warehouse name, facility, or storage location",
  binLocation: "Bin, shelf, rack, aisle, or zone location",
  weight: "Item weight in pounds or kilograms",
  dimensions: "Physical dimensions (L x W x H)",
  countryOfOrigin: "Country where product was manufactured",

  // Classification
  productCategory: "Main category, product group",
  subcategory: "Secondary category, sub-category",
  brand: "Brand name",
  department: "Department, division, or business unit",

  // Status
  productStatus: "Active/inactive status, lifecycle status",
  isDiscontinued: "End of life, obsolete, or phased out flag",
  lastOrderedDate: "Last purchase or receipt date",
  lastSoldDate: "Last sale or transaction date",

  // Notes
  notes: "Comments, remarks, or special instructions",
};

const ORDER_FIELDS = {
  // Core order identification
  orderId: "Order number, PO number, sales order, reference number",
  productId: "Product ID, SKU, or item number",
  productName: "Product name, item description",
  dateSubmitted: "Order date, submission date, transaction date",

  // Quantities
  quantityUnits: "Ordered quantity in units",
  quantityPacks: "Ordered quantity in packs or cases",
  totalQuantity: "Total quantity (units × multiplier)",
  quantityMultiplier: "Pack size, conversion factor",

  // Shipping address
  shipToCompany: "Company name, organization, customer name",
  shipToFirstName: "Recipient first name",
  shipToLastName: "Recipient last name",
  shipToStreet1: "Street address line 1",
  shipToStreet2: "Street address line 2, suite, apt",
  shipToCity: "City or town",
  shipToState: "State, province, or region",
  shipToZip: "ZIP code, postal code",
  shipToCountry: "Country",
  shipToLocation: "Full address or location name",
  shipToIdentifier: "Location code, store number, site ID",

  // Contact
  shipToPhone: "Phone number, telephone",
  shipToEmail: "Email address",
  orderedBy: "Requester, submitted by, user",
  contactName: "Contact person name",
  customerId: "Customer ID, account number",

  // Financial
  unitPrice: "Price per unit",
  extendedPrice: "Line total, extended amount",
  discount: "Discount amount or percentage",
  taxAmount: "Tax, VAT, sales tax",
  totalPrice: "Order total, invoice total",

  // Order details
  orderStatus: "Status, fulfillment status",
  orderType: "Type of order, order category",
  lineNumber: "Line item number",
  lineItemId: "Line item identifier",

  // Shipping
  shipMethod: "Shipping method, carrier",
  trackingNumber: "Tracking ID",
  shipDate: "Actual ship date",
  expectedDeliveryDate: "Expected delivery, ETA",
  shipWeight: "Package weight",
};

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

/**
 * LRU cache for AI mapping results.
 * Caches based on hash of headers + sample data.
 * 24-hour TTL, max 1000 entries.
 */
const mappingCache = new LRUCache<string, AIMappingResponse>({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24, // 24 hours
});

// =============================================================================
// AI MAPPING SERVICE
// =============================================================================

export class AIMappingService {
  private anthropic: Anthropic | null = null;
  private enabled: boolean = false;

  constructor() {
    // Initialize Anthropic client if API key is available
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
      this.enabled = true;
      console.log("[AI Mapping] Service initialized with Claude API");
    } else {
      console.log("[AI Mapping] No API key found - service disabled");
    }
  }

  /**
   * Check if AI mapping is available.
   */
  isEnabled(): boolean {
    return this.enabled && this.anthropic !== null;
  }

  /**
   * Generate a cache key from headers and sample data.
   */
  private generateCacheKey(
    headers: string[],
    sampleData: string[][],
    fileType: string,
  ): string {
    const dataHash = JSON.stringify({
      headers: headers.map((h) => h.toLowerCase().trim()),
      samples: sampleData.slice(0, 3), // Use first 3 rows for cache key
      type: fileType,
    });
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < dataHash.length; i++) {
      const char = dataHash.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `ai_mapping_${hash.toString(36)}`;
  }

  /**
   * Main entry point: Get AI-powered column mappings.
   * Supports per-client API keys for white-label deployments.
   */
  async getMappings(request: AIMappingRequest): Promise<AIMappingResponse> {
    const { headers, sampleData, fileType, clientId } = request;

    // Check cache first
    const cacheKey = this.generateCacheKey(headers, sampleData, fileType);
    const cached = mappingCache.get(cacheKey);
    if (cached) {
      console.log(`[AI Mapping] Cache hit for ${cacheKey}`);
      return { ...cached, cached: true };
    }

    // ==========================================================================
    // DETERMINE WHICH API KEY TO USE (White-Label Support)
    // ==========================================================================
    // Priority:
    // 1. Client's own API key (if useOwnAiKey=true and key is set)
    // 2. Platform API key (from ANTHROPIC_API_KEY env var)
    // 3. No AI (fall back to Jaro-Winkler)
    // ==========================================================================

    let apiKey: string | null = null;
    let usedOwnKey = false;

    // Check if client wants to use their own key
    if (clientId) {
      try {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: {
            anthropicApiKey: true,
            useOwnAiKey: true,
          },
        });

        if (client?.useOwnAiKey && client?.anthropicApiKey) {
          // Client has their own key configured
          if (isEncryptionConfigured()) {
            try {
              apiKey = decrypt(client.anthropicApiKey);
              usedOwnKey = true;
              console.log(
                `[AI Mapping] Using client's own API key for ${clientId}`,
              );
            } catch (decryptError) {
              console.error(
                `[AI Mapping] Failed to decrypt client API key:`,
                decryptError,
              );
            }
          } else {
            console.warn(
              "[AI Mapping] Client has API key but ENCRYPTION_KEY not configured",
            );
          }
        }
      } catch (dbError) {
        console.error("[AI Mapping] Error fetching client settings:", dbError);
      }
    }

    // Fall back to platform key if no client key
    if (!apiKey && process.env.ANTHROPIC_API_KEY) {
      apiKey = process.env.ANTHROPIC_API_KEY;
      console.log("[AI Mapping] Using platform API key");
    }

    // If no API key available, return empty result (will use Jaro-Winkler)
    if (!apiKey) {
      console.log(
        "[AI Mapping] No API key available, returning empty mappings",
      );
      return {
        mappings: [],
        aiUsed: false,
        cached: false,
      };
    }

    try {
      // Create Anthropic client with the selected key
      const anthropicClient = new Anthropic({ apiKey });

      // Call Claude for intelligent mapping
      const response = await this.callClaudeForMappingWithClient(
        anthropicClient,
        headers,
        sampleData,
        fileType,
      );

      // Log usage if client provided
      if (clientId && response.inputTokens && response.outputTokens) {
        await this.logUsage(
          clientId,
          response.inputTokens,
          response.outputTokens,
          usedOwnKey,
        );
      }

      // Cache the result
      mappingCache.set(cacheKey, response);

      return response;
    } catch (error) {
      console.error("[AI Mapping] Error calling Claude:", error);
      return {
        mappings: [],
        aiUsed: false,
        cached: false,
      };
    }
  }

  /**
   * Call Claude API for semantic column mapping (uses per-request client).
   */
  private async callClaudeForMappingWithClient(
    anthropicClient: Anthropic,
    headers: string[],
    sampleData: string[][],
    fileType: "inventory" | "order",
  ): Promise<AIMappingResponse> {
    const availableFields =
      fileType === "inventory" ? INVENTORY_FIELDS : ORDER_FIELDS;

    // Build the prompt
    const prompt = this.buildMappingPrompt(
      headers,
      sampleData,
      availableFields,
    );

    console.log(`[AI Mapping] Calling Claude for ${headers.length} headers...`);

    const response = await anthropicClient.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Parse the response
    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    const mappings = this.parseClaudeResponse(textContent.text, headers);

    return {
      mappings,
      aiUsed: true,
      cached: false,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      estimatedCost: this.calculateCost(
        response.usage.input_tokens,
        response.usage.output_tokens,
      ),
    };
  }

  /**
   * Call Claude API for semantic column mapping (legacy - uses global client).
   * @deprecated Use getMappings() which supports per-client keys
   */
  private async callClaudeForMapping(
    headers: string[],
    sampleData: string[][],
    fileType: "inventory" | "order",
  ): Promise<AIMappingResponse> {
    if (!this.anthropic) {
      throw new Error("Anthropic client not initialized");
    }
    return this.callClaudeForMappingWithClient(
      this.anthropic,
      headers,
      sampleData,
      fileType,
    );
  }

  /**
   * Build the Claude prompt for column mapping.
   */
  private buildMappingPrompt(
    headers: string[],
    sampleData: string[][],
    availableFields: Record<string, string>,
  ): string {
    // Build sample data display
    let sampleDisplay = "SAMPLE DATA:\n";
    for (let i = 0; i < Math.min(sampleData.length, 5); i++) {
      sampleDisplay += `Row ${i + 1}: `;
      headers.forEach((h, j) => {
        const value = sampleData[i]?.[j] ?? "";
        sampleDisplay += `${h}="${value}" | `;
      });
      sampleDisplay += "\n";
    }

    // Build field descriptions
    let fieldDescriptions = "AVAILABLE DATABASE FIELDS:\n";
    for (const [field, desc] of Object.entries(availableFields)) {
      fieldDescriptions += `- ${field}: ${desc}\n`;
    }

    return `You are an expert data analyst specializing in inventory management and order processing systems.

TASK: Map CSV column headers to database fields based on semantic meaning.

CSV HEADERS:
${headers.map((h, i) => `${i + 1}. "${h}"`).join("\n")}

${sampleDisplay}

${fieldDescriptions}

INSTRUCTIONS:
1. For each CSV header, determine the best matching database field based on:
   - Semantic meaning (not just string similarity)
   - The sample data values
   - Business context (inventory/order management)

2. Be especially careful with these common mistakes:
   - "Monthly Usage" or "Monthly Useage" should map to monthlyUsageUnits (NOT minimumOrderQuantity)
   - "Reserved Quantity" should map to reservedQuantity (NOT notificationPoint)
   - "Based on" should map to calculationBasis (NOT binLocation)
   - "Available Quantity" should map to availableQuantity (NOT currentStockPacks)
   - "Order Type" should map to orderType (NOT totalPrice)

3. If no good match exists, return null as the target field.

4. Provide confidence (0.0-1.0) and brief reasoning.

OUTPUT FORMAT (JSON array):
[
  {
    "sourceHeader": "Column Name",
    "targetField": "fieldName" or null,
    "confidence": 0.95,
    "reasoning": "Brief explanation"
  }
]

Only output the JSON array, no other text.`;
  }

  /**
   * Parse Claude's response into structured mappings.
   */
  private parseClaudeResponse(
    response: string,
    headers: string[],
  ): AIFieldMapping[] {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.slice(0, -3);
      }

      const parsed = JSON.parse(jsonStr.trim());

      if (!Array.isArray(parsed)) {
        throw new Error("Response is not an array");
      }

      return parsed.map((item: any) => ({
        sourceHeader: String(item.sourceHeader || ""),
        targetField: item.targetField ?? null,
        confidence: Number(item.confidence) || 0,
        reasoning: String(item.reasoning || ""),
        alternatives: item.alternatives,
      }));
    } catch (error) {
      console.error("[AI Mapping] Failed to parse Claude response:", error);
      console.error("[AI Mapping] Raw response:", response.substring(0, 500));

      // Return empty mappings for all headers on parse failure
      return headers.map((h) => ({
        sourceHeader: h,
        targetField: null,
        confidence: 0,
        reasoning: "Failed to parse AI response",
      }));
    }
  }

  /**
   * Calculate estimated cost for Claude API usage.
   * Prices as of 2024 for claude-3-5-sonnet.
   */
  private calculateCost(inputTokens: number, outputTokens: number): number {
    const INPUT_PRICE_PER_1K = 0.003;
    const OUTPUT_PRICE_PER_1K = 0.015;
    return (
      (inputTokens / 1000) * INPUT_PRICE_PER_1K +
      (outputTokens / 1000) * OUTPUT_PRICE_PER_1K
    );
  }

  /**
   * Log AI usage for tracking.
   */
  private async logUsage(
    clientId: string,
    inputTokens: number,
    outputTokens: number,
    usedOwnKey: boolean,
  ): Promise<void> {
    try {
      const cost = this.calculateCost(inputTokens, outputTokens);
      const keySource = usedOwnKey ? "client key" : "platform key";
      console.log(
        `[AI Mapping] Usage - Client: ${clientId}, Input: ${inputTokens}, Output: ${outputTokens}, Cost: $${cost.toFixed(4)}, Source: ${keySource}`,
      );
    } catch (error) {
      console.error("[AI Mapping] Failed to log usage:", error);
    }
  }

  /**
   * Clear the mapping cache.
   */
  clearCache(): void {
    mappingCache.clear();
    console.log("[AI Mapping] Cache cleared");
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: mappingCache.size,
      maxSize: mappingCache.max,
    };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const aiMappingService = new AIMappingService();
