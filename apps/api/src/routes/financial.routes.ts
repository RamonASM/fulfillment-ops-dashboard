import express from "express";
import { FinancialService } from "../services/financial.service.js";
import { authenticate, requireClientAccess } from "../middleware/auth.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Get budget summary for a client
router.get(
  "/budgets/summary/:clientId",
  requireClientAccess,
  async (req, res) => {
    try {
      const { clientId } = req.params;
      const { periodStart, periodEnd } = req.query;

      if (!periodStart || !periodEnd) {
        return res.status(400).json({
          success: false,
          error: "periodStart and periodEnd are required",
        });
      }

      const summary = await FinancialService.getBudgetSummary(
        clientId,
        new Date(periodStart as string),
        new Date(periodEnd as string),
      );

      res.json({ success: true, data: summary });
    } catch (error) {
      console.error("Error getting budget summary:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve budget summary",
      });
    }
  },
);

// Get EOQ optimization opportunities for a client
router.get(
  "/eoq/opportunities/:clientId",
  requireClientAccess,
  async (req, res) => {
    try {
      const { clientId } = req.params;
      const opportunities =
        await FinancialService.analyzeEOQOpportunities(clientId);
      res.json({ success: true, data: opportunities });
    } catch (error) {
      console.error("Error analyzing EOQ opportunities:", error);
      res.status(500).json({
        success: false,
        error: "Failed to analyze EOQ opportunities",
      });
    }
  },
);

export default router;
