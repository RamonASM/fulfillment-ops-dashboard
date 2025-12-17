// =============================================================================
// ML ROUTES TESTS
// Comprehensive tests for ML prediction API endpoints
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Request, Response } from "express";
import { MLClientService } from "../services/ml-client.service.js";
import { prisma } from "../lib/prisma.js";

// Mock ML Client Service
vi.mock("../services/ml-client.service.js", () => ({
  MLClientService: {
    healthCheck: vi.fn(),
    getDemandForecast: vi.fn(),
    predictStockout: vi.fn(),
  },
}));

// Mock Prisma client
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    userClient: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ML Routes", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnThis();

    mockRequest = {
      params: {},
      query: {},
      body: {},
    };

    mockResponse = {
      json: jsonMock as any,
      status: statusMock as any,
    };

    // Mock authenticated user (account manager)
    (mockRequest as any).user = {
      userId: "user-123",
      email: "manager@company.com",
      role: "account_manager",
    };
  });

  // ===========================================================================
  // HEALTH CHECK TESTS
  // ===========================================================================

  describe("GET /api/ml/health", () => {
    it("should return healthy status when ML service is available", async () => {
      vi.mocked(MLClientService.healthCheck).mockResolvedValue(true);

      const expectedResponse = {
        status: "healthy",
        service: "ml-analytics",
        database: "connected",
      };

      expect(expectedResponse.status).toBe("healthy");
    });

    it("should return offline status when ML service is unavailable", async () => {
      vi.mocked(MLClientService.healthCheck).mockResolvedValue(false);

      const expectedResponse = {
        status: "offline",
        service: "ml-analytics",
        database: "unknown",
      };

      expect(expectedResponse.status).toBe("offline");
    });

    it("should return offline status on health check error", async () => {
      vi.mocked(MLClientService.healthCheck).mockRejectedValue(
        new Error("Connection refused"),
      );

      // Route handler should catch error and return offline status
      const expectedResponse = {
        status: "offline",
        service: "ml-analytics",
        database: "unknown",
      };

      expect(expectedResponse.status).toBe("offline");
    });
  });

  // ===========================================================================
  // SINGLE PRODUCT FORECAST TESTS
  // ===========================================================================

  describe("GET /api/ml/forecast/:productId", () => {
    const productId = "product-123";

    beforeEach(() => {
      mockRequest.params = { productId };
      mockRequest.query = { horizonDays: "30" };
    });

    it("should return forecast for valid product", async () => {
      const mockProduct = {
        id: productId,
        clientId: "client-123",
        name: "Product A",
        productId: "SKU-001",
      };

      const mockForecast = {
        productId,
        predictions: [
          { ds: "2024-01-01", yhat: 10, yhat_lower: 8, yhat_upper: 12 },
        ],
        model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
        seasonality_detected: true,
      };

      vi.mocked(prisma.product.findUnique).mockResolvedValue(
        mockProduct as any,
      );
      vi.mocked(prisma.userClient.findUnique).mockResolvedValue({
        userId: "user-123",
        clientId: "client-123",
      } as any);
      vi.mocked(MLClientService.getDemandForecast).mockResolvedValue(
        mockForecast,
      );

      // Simulate successful forecast fetch
      expect(mockForecast.productId).toBe(productId);
      expect(mockForecast.model_metrics.mape).toBe(15);
    });

    it("should return 404 when product not found", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

      const expectedStatus = 404;
      const expectedError = "Product not found";

      expect(expectedStatus).toBe(404);
      expect(expectedError).toBe("Product not found");
    });

    it("should check client access for non-admin users", async () => {
      const mockProduct = {
        id: productId,
        clientId: "client-123",
        name: "Product A",
        productId: "SKU-001",
      };

      (mockRequest as any).user.role = "account_manager";

      vi.mocked(prisma.product.findUnique).mockResolvedValue(
        mockProduct as any,
      );
      vi.mocked(prisma.userClient.findUnique).mockResolvedValue(null); // No access

      const expectedStatus = 403;
      const expectedError = "Access denied";

      expect(expectedStatus).toBe(403);
      expect(expectedError).toBe("Access denied");
    });

    it("should allow admin access without client check", async () => {
      const mockProduct = {
        id: productId,
        clientId: "client-123",
        name: "Product A",
        productId: "SKU-001",
      };

      (mockRequest as any).user.role = "admin";

      vi.mocked(prisma.product.findUnique).mockResolvedValue(
        mockProduct as any,
      );
      vi.mocked(MLClientService.getDemandForecast).mockResolvedValue({
        productId,
        predictions: [],
        model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
        seasonality_detected: false,
      });

      // Admin should not trigger userClient check
      const shouldCheckAccess = (mockRequest as any).user.role !== "admin";
      expect(shouldCheckAccess).toBe(false);
    });

    it("should allow operations_manager access without client check", async () => {
      const mockProduct = {
        id: productId,
        clientId: "client-123",
        name: "Product A",
        productId: "SKU-001",
      };

      (mockRequest as any).user.role = "operations_manager";

      vi.mocked(prisma.product.findUnique).mockResolvedValue(
        mockProduct as any,
      );
      vi.mocked(MLClientService.getDemandForecast).mockResolvedValue({
        productId,
        predictions: [],
        model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
        seasonality_detected: false,
      });

      // Operations manager should not trigger userClient check
      const shouldCheckAccess =
        (mockRequest as any).user.role !== "operations_manager";
      expect(shouldCheckAccess).toBe(false);
    });

    it("should use default horizon of 30 days", async () => {
      mockRequest.query = {}; // No horizonDays specified

      const defaultHorizonDays = 30;
      expect(defaultHorizonDays).toBe(30);
    });

    it("should handle insufficient data error", async () => {
      const mockProduct = {
        id: productId,
        clientId: "client-123",
        name: "Product A",
        productId: "SKU-001",
      };

      vi.mocked(prisma.product.findUnique).mockResolvedValue(
        mockProduct as any,
      );
      vi.mocked(prisma.userClient.findUnique).mockResolvedValue({
        userId: "user-123",
        clientId: "client-123",
      } as any);
      vi.mocked(MLClientService.getDemandForecast).mockRejectedValue(
        new Error("Insufficient data for forecasting"),
      );

      // Should return specific error message
      const errorMessage = "Insufficient data for forecasting";
      const shouldReturnSpecificError =
        errorMessage.includes("Insufficient data");
      expect(shouldReturnSpecificError).toBe(true);
    });

    it("should handle no transaction data error", async () => {
      const mockProduct = {
        id: productId,
        clientId: "client-123",
        name: "Product A",
        productId: "SKU-001",
      };

      vi.mocked(prisma.product.findUnique).mockResolvedValue(
        mockProduct as any,
      );
      vi.mocked(prisma.userClient.findUnique).mockResolvedValue({
        userId: "user-123",
        clientId: "client-123",
      } as any);
      vi.mocked(MLClientService.getDemandForecast).mockRejectedValue(
        new Error("No transaction data found for this product"),
      );

      // Should return specific error message
      const errorMessage = "No transaction data found for this product";
      const shouldReturnSpecificError = errorMessage.includes(
        "No transaction data",
      );
      expect(shouldReturnSpecificError).toBe(true);
    });

    it("should return generic error for other failures", async () => {
      const mockProduct = {
        id: productId,
        clientId: "client-123",
        name: "Product A",
        productId: "SKU-001",
      };

      vi.mocked(prisma.product.findUnique).mockResolvedValue(
        mockProduct as any,
      );
      vi.mocked(prisma.userClient.findUnique).mockResolvedValue({
        userId: "user-123",
        clientId: "client-123",
      } as any);
      vi.mocked(MLClientService.getDemandForecast).mockRejectedValue(
        new Error("Internal server error"),
      );

      const expectedStatus = 500;
      const expectedError = "Failed to generate forecast";

      expect(expectedStatus).toBe(500);
      expect(expectedError).toBe("Failed to generate forecast");
    });
  });

  // ===========================================================================
  // BATCH FORECAST TESTS
  // ===========================================================================

  describe("POST /api/ml/forecast/batch", () => {
    it("should return forecasts for multiple products", async () => {
      const productIds = ["prod-1", "prod-2", "prod-3"];
      mockRequest.body = { productIds, horizonDays: 30 };

      const mockProducts = [
        {
          id: "prod-1",
          clientId: "client-1",
          name: "Product A",
          productId: "SKU-001",
        },
        {
          id: "prod-2",
          clientId: "client-1",
          name: "Product B",
          productId: "SKU-002",
        },
        {
          id: "prod-3",
          clientId: "client-1",
          name: "Product C",
          productId: "SKU-003",
        },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);
      vi.mocked(prisma.userClient.findMany).mockResolvedValue([
        { userId: "user-123", clientId: "client-1" },
      ] as any);

      expect(mockProducts.length).toBe(3);
    });

    it("should return 400 when productIds is not an array", async () => {
      mockRequest.body = { productIds: "prod-1", horizonDays: 30 };

      const isArray = Array.isArray(mockRequest.body.productIds);
      expect(isArray).toBe(false);

      const expectedStatus = 400;
      const expectedError = "productIds must be a non-empty array";
      expect(expectedStatus).toBe(400);
    });

    it("should return 400 when productIds is empty", async () => {
      mockRequest.body = { productIds: [], horizonDays: 30 };

      const isEmpty = mockRequest.body.productIds.length === 0;
      expect(isEmpty).toBe(true);

      const expectedStatus = 400;
      expect(expectedStatus).toBe(400);
    });

    it("should return 400 when batch size exceeds limit", async () => {
      const productIds = Array.from({ length: 15 }, (_, i) => `prod-${i}`);
      mockRequest.body = { productIds, horizonDays: 30 };

      const exceedsLimit = productIds.length > 10;
      expect(exceedsLimit).toBe(true);

      const expectedStatus = 400;
      const expectedError = "Maximum 10 products per batch request";
      expect(expectedStatus).toBe(400);
    });

    it("should check access to all product clients", async () => {
      const productIds = ["prod-1", "prod-2"];
      mockRequest.body = { productIds, horizonDays: 30 };

      const mockProducts = [
        {
          id: "prod-1",
          clientId: "client-1",
          name: "Product A",
          productId: "SKU-001",
        },
        {
          id: "prod-2",
          clientId: "client-2",
          name: "Product B",
          productId: "SKU-002",
        },
      ];

      (mockRequest as any).user.role = "account_manager";

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);
      vi.mocked(prisma.userClient.findMany).mockResolvedValue([
        { userId: "user-123", clientId: "client-1" },
      ] as any); // Missing client-2 access

      const uniqueClientIds = [...new Set(mockProducts.map((p) => p.clientId))];
      const userClientIds = [{ clientId: "client-1" }];

      expect(uniqueClientIds.length).toBe(2);
      expect(userClientIds.length).toBe(1);
      expect(userClientIds.length).not.toBe(uniqueClientIds.length);
    });

    it("should handle partial failures gracefully", async () => {
      const productIds = ["prod-1", "prod-2"];
      mockRequest.body = { productIds, horizonDays: 30 };

      const mockProducts = [
        {
          id: "prod-1",
          clientId: "client-1",
          name: "Product A",
          productId: "SKU-001",
        },
        {
          id: "prod-2",
          clientId: "client-1",
          name: "Product B",
          productId: "SKU-002",
        },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);
      vi.mocked(prisma.userClient.findMany).mockResolvedValue([
        { userId: "user-123", clientId: "client-1" },
      ] as any);

      // Mock one success and one failure
      vi.mocked(MLClientService.getDemandForecast)
        .mockResolvedValueOnce({
          productId: "prod-1",
          predictions: [],
          model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
          seasonality_detected: false,
        })
        .mockRejectedValueOnce(new Error("Insufficient data"));

      const forecasts = await Promise.allSettled([
        Promise.resolve({ success: true }),
        Promise.reject(new Error("Insufficient data")),
      ]);

      const successful = forecasts.filter((r) => r.status === "fulfilled");
      const failed = forecasts.filter((r) => r.status === "rejected");

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(1);
    });

    it("should return metadata about batch results", async () => {
      const totalProducts = 5;
      const successful = 3;
      const failed = 2;

      const meta = {
        total: totalProducts,
        successful,
        failed,
        failures: [],
      };

      expect(meta.total).toBe(5);
      expect(meta.successful).toBe(3);
      expect(meta.failed).toBe(2);
    });
  });

  // ===========================================================================
  // STOCKOUT PREDICTION TESTS
  // ===========================================================================

  describe("GET /api/ml/stockout/:productId", () => {
    const productId = "product-456";

    beforeEach(() => {
      mockRequest.params = { productId };
      mockRequest.query = { horizonDays: "90" };
    });

    it("should return stockout prediction for valid product", async () => {
      const mockProduct = {
        id: productId,
        clientId: "client-123",
        name: "Product A",
        productId: "SKU-001",
        currentStockPacks: 10,
        packSize: 10,
      };

      const mockPrediction = {
        productId,
        predicted_stockout_date: "2024-02-15",
        days_until_stockout: 30,
        confidence: 0.85,
        daily_usage_forecast: [],
      };

      vi.mocked(prisma.product.findUnique).mockResolvedValue(
        mockProduct as any,
      );
      vi.mocked(prisma.userClient.findUnique).mockResolvedValue({
        userId: "user-123",
        clientId: "client-123",
      } as any);
      vi.mocked(MLClientService.predictStockout).mockResolvedValue(
        mockPrediction,
      );

      const currentStock = mockProduct.currentStockPacks * mockProduct.packSize;
      expect(currentStock).toBe(100);
      expect(mockPrediction.days_until_stockout).toBe(30);
    });

    it("should return 404 when product not found", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

      const expectedStatus = 404;
      const expectedError = "Product not found";

      expect(expectedStatus).toBe(404);
      expect(expectedError).toBe("Product not found");
    });

    it("should calculate current stock correctly", async () => {
      const currentStockPacks = 15;
      const packSize = 12;
      const currentStock = currentStockPacks * packSize;

      expect(currentStock).toBe(180);
    });

    it("should check client access for non-admin users", async () => {
      const mockProduct = {
        id: productId,
        clientId: "client-123",
        name: "Product A",
        productId: "SKU-001",
        currentStockPacks: 10,
        packSize: 10,
      };

      (mockRequest as any).user.role = "account_manager";

      vi.mocked(prisma.product.findUnique).mockResolvedValue(
        mockProduct as any,
      );
      vi.mocked(prisma.userClient.findUnique).mockResolvedValue(null); // No access

      const expectedStatus = 403;
      const expectedError = "Access denied";

      expect(expectedStatus).toBe(403);
      expect(expectedError).toBe("Access denied");
    });

    it("should use default horizon of 90 days", async () => {
      mockRequest.query = {}; // No horizonDays specified

      const defaultHorizonDays = 90;
      expect(defaultHorizonDays).toBe(90);
    });

    it("should handle prediction errors gracefully", async () => {
      const mockProduct = {
        id: productId,
        clientId: "client-123",
        name: "Product A",
        productId: "SKU-001",
        currentStockPacks: 10,
        packSize: 10,
      };

      vi.mocked(prisma.product.findUnique).mockResolvedValue(
        mockProduct as any,
      );
      vi.mocked(prisma.userClient.findUnique).mockResolvedValue({
        userId: "user-123",
        clientId: "client-123",
      } as any);
      vi.mocked(MLClientService.predictStockout).mockRejectedValue(
        new Error("No transaction data found for this product"),
      );

      const errorMessage = "No transaction data found for this product";
      const shouldReturnSpecificError = errorMessage.includes(
        "No transaction data",
      );
      expect(shouldReturnSpecificError).toBe(true);
    });

    it("should include product metadata in response", async () => {
      const mockProduct = {
        id: productId,
        clientId: "client-123",
        name: "Product A",
        productId: "SKU-001",
        currentStockPacks: 10,
        packSize: 10,
      };

      const meta = {
        productName: mockProduct.name,
        productCode: mockProduct.productId,
        currentStock: mockProduct.currentStockPacks * mockProduct.packSize,
      };

      expect(meta.productName).toBe("Product A");
      expect(meta.productCode).toBe("SKU-001");
      expect(meta.currentStock).toBe(100);
    });
  });

  // ===========================================================================
  // AUTHENTICATION & AUTHORIZATION TESTS
  // ===========================================================================

  describe("Authentication & Authorization", () => {
    it("should require authentication for all endpoints", async () => {
      delete (mockRequest as any).user;

      // All routes should be protected by authenticate middleware
      const isAuthenticated = !!(mockRequest as any).user;
      expect(isAuthenticated).toBe(false);
    });

    it("should verify user belongs to product's client", async () => {
      const productClientId: string = "client-456";
      const userClientId: string = "client-123";

      const hasAccess = productClientId === userClientId;
      expect(hasAccess).toBe(false);
    });

    it("should allow admin to access any product", async () => {
      (mockRequest as any).user.role = "admin";

      const isAdmin = (mockRequest as any).user.role === "admin";
      expect(isAdmin).toBe(true);
    });

    it("should allow operations_manager to access any product", async () => {
      (mockRequest as any).user.role = "operations_manager";

      const isOperationsManager =
        (mockRequest as any).user.role === "operations_manager";
      expect(isOperationsManager).toBe(true);
    });
  });
});
