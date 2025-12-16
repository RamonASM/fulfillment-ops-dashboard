// =============================================================================
// BENCHMARKING ROUTES
// Privacy-preserving cross-client performance comparison
// =============================================================================

import express from "express";
import { BenchmarkingService } from "../services/benchmarking.service.js";
import { authenticate } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// GET CLIENT BENCHMARK
// =============================================================================

/**
 * GET /api/benchmarking/client/:clientId
 * Get benchmark comparison for a client
 */
router.get("/client/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;

    // Authorization: Admin, ops manager, or user with access to this client
    if (req.user?.role !== "admin" && req.user?.role !== "operations_manager") {
      const access = await prisma.userClient.findUnique({
        where: {
          userId_clientId: {
            userId: req.user!.userId,
            clientId,
          },
        },
      });

      if (!access) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }
    }

    const benchmark = await BenchmarkingService.getClientBenchmark(clientId);

    if (!benchmark) {
      return res.status(200).json({
        success: true,
        data: null,
        message:
          "Client not participating in benchmarking or insufficient data",
      });
    }

    res.json({
      success: true,
      data: benchmark,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to get benchmark comparison",
      details: message,
    });
  }
});

// =============================================================================
// OPT IN/OUT
// =============================================================================

/**
 * POST /api/benchmarking/opt-in
 * Opt client into benchmarking
 */
router.post("/opt-in", async (req, res) => {
  try {
    const { clientId, cohort = "general" } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: "clientId is required",
      });
    }

    // Authorization: Admin or ops manager only
    if (req.user?.role !== "admin" && req.user?.role !== "operations_manager") {
      return res.status(403).json({
        success: false,
        error: "Only admins can manage benchmarking participation",
      });
    }

    await BenchmarkingService.optIn(clientId, cohort);

    res.json({
      success: true,
      message: "Client opted into benchmarking",
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to opt in",
      details: message,
    });
  }
});

/**
 * POST /api/benchmarking/opt-out
 * Opt client out of benchmarking
 */
router.post("/opt-out", async (req, res) => {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: "clientId is required",
      });
    }

    // Authorization: Admin or ops manager only
    if (req.user?.role !== "admin" && req.user?.role !== "operations_manager") {
      return res.status(403).json({
        success: false,
        error: "Only admins can manage benchmarking participation",
      });
    }

    await BenchmarkingService.optOut(clientId);

    res.json({
      success: true,
      message: "Client opted out of benchmarking",
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to opt out",
      details: message,
    });
  }
});

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

/**
 * POST /api/benchmarking/generate-snapshot
 * Manually trigger snapshot generation (admin only)
 */
router.post("/generate-snapshot", async (req, res) => {
  try {
    // Authorization: Admin only
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Admin access required",
      });
    }

    const { cohort = "general" } = req.body;

    await BenchmarkingService.generateSnapshot(cohort);

    res.json({
      success: true,
      message: "Benchmark snapshot generated",
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to generate snapshot",
      details: message,
    });
  }
});

/**
 * GET /api/benchmarking/cohorts
 * Get available cohorts (admin only)
 */
router.get("/cohorts", async (req, res) => {
  try {
    // Authorization: Admin or ops manager
    if (req.user?.role !== "admin" && req.user?.role !== "operations_manager") {
      return res.status(403).json({
        success: false,
        error: "Admin or operations manager access required",
      });
    }

    const cohorts = await BenchmarkingService.getAvailableCohorts();

    res.json({
      success: true,
      data: cohorts,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to get cohorts",
      details: message,
    });
  }
});

/**
 * GET /api/benchmarking/participation
 * Get all clients' benchmarking participation status (admin only)
 */
router.get("/participation", async (req, res) => {
  try {
    // Authorization: Admin only
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Admin access required",
      });
    }

    const participation = await prisma.benchmarkParticipation.findMany({
      include: {
        client: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    res.json({
      success: true,
      data: participation,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to get participation status",
      details: message,
    });
  }
});

export default router;
