import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireClientAccess } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';
import {
  calculateProductRisk,
  calculateClientRisk,
  getTopRiskyProducts,
} from '../services/ai/risk-scoring.service.js';
import {
  detectProductAnomalies,
  detectClientAnomalies,
  getTopAnomalies,
} from '../services/ai/anomaly-detection.service.js';
import {
  detectSeasonalPatterns,
  detectClientSeasonalPatterns,
  getSeasonalForecast,
} from '../services/ai/seasonal-patterns.service.js';
import {
  generateCommunicationDrafts,
  generateSpecificDraft,
} from '../services/ai/communication-drafts.service.js';

const router = Router();

// Apply authentication
router.use(authenticate);

// =============================================================================
// RISK SCORING ROUTES
// =============================================================================

/**
 * GET /api/ai/risk/product/:productId
 * Get risk score for a specific product
 */
router.get('/risk/product/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    const risk = await calculateProductRisk(productId);
    res.json(risk);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ai/risk/client/:clientId
 * Get risk summary for a client
 */
router.get('/risk/client/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError('Client');
    }

    const risk = await calculateClientRisk(clientId);
    res.json(risk);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ai/risk/top-risky
 * Get top risky products across all accessible clients
 */
router.get('/risk/top-risky', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 10;

    const topRisky = await getTopRiskyProducts(userId, limit);
    res.json({ data: topRisky });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// ANOMALY DETECTION ROUTES
// =============================================================================

/**
 * GET /api/ai/anomalies/product/:productId
 * Detect anomalies for a specific product
 */
router.get('/anomalies/product/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    const anomalies = await detectProductAnomalies(productId);
    res.json({ data: anomalies });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ai/anomalies/client/:clientId
 * Detect anomalies for all products in a client
 */
router.get('/anomalies/client/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError('Client');
    }

    const anomalies = await detectClientAnomalies(clientId);
    res.json({ data: anomalies, total: anomalies.length });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ai/anomalies/top
 * Get top anomalies across all accessible clients
 */
router.get('/anomalies/top', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 10;

    const anomalies = await getTopAnomalies(userId, limit);
    res.json({ data: anomalies });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// SEASONAL PATTERNS ROUTES
// =============================================================================

/**
 * GET /api/ai/seasonal/product/:productId
 * Detect seasonal patterns for a specific product
 */
router.get('/seasonal/product/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    const patterns = await detectSeasonalPatterns(productId);
    res.json({ data: patterns });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ai/seasonal/client/:clientId
 * Detect seasonal patterns for all products in a client
 */
router.get('/seasonal/client/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError('Client');
    }

    const patterns = await detectClientSeasonalPatterns(clientId);
    res.json({ data: patterns, total: patterns.length });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ai/seasonal/forecast/:productId
 * Get seasonal-adjusted forecast for a product
 */
router.get('/seasonal/forecast/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const monthsAhead = parseInt(req.query.months as string) || 6;

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    const forecast = await getSeasonalForecast(productId, monthsAhead);
    res.json({ productId, productName: product.name, forecast });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// COMMUNICATION DRAFTS ROUTES
// =============================================================================

/**
 * GET /api/ai/drafts/:clientId
 * Generate communication drafts for a client
 */
router.get('/drafts/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.userId;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError('Client');
    }

    const drafts = await generateCommunicationDrafts(clientId, userId);
    res.json({ data: drafts });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ai/drafts/:clientId
 * Generate a specific type of draft
 */
router.post('/drafts/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { type } = req.body;
    const userId = req.user!.userId;

    if (!type) {
      throw new ValidationError('Draft type is required');
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError('Client');
    }

    const draft = await generateSpecificDraft(clientId, userId, type);
    res.json(draft);
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// AI INSIGHTS ROUTES (Placeholder for future LLM integration)
// =============================================================================

/**
 * GET /api/ai/insights/summary/:clientId
 * Get AI-generated summary for a client
 */
router.get('/insights/summary/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        products: {
          where: { isActive: true },
          take: 100,
        },
        alerts: {
          where: { isDismissed: false },
          take: 50,
        },
      },
    });

    if (!client) {
      throw new NotFoundError('Client');
    }

    // Generate basic summary (placeholder for LLM integration)
    const totalProducts = client.products.length;
    const evergreenCount = client.products.filter((p) => p.itemType === 'evergreen').length;
    const activeAlerts = client.alerts.length;
    const criticalAlerts = client.alerts.filter((a) => a.severity === 'critical').length;

    // Calculate risk summary
    const risk = await calculateClientRisk(clientId);

    const summary = {
      clientId,
      clientName: client.name,
      generatedAt: new Date(),
      overview: {
        totalProducts,
        evergreenCount,
        eventCount: totalProducts - evergreenCount,
        activeAlerts,
        criticalAlerts,
        riskLevel: risk.riskLevel,
        riskScore: risk.overallScore,
      },
      keyInsights: generateKeyInsights(client, risk),
      recommendations: generateRecommendations(client, risk),
      // TODO: Replace with actual LLM-generated narrative
      narrative: `${client.name} currently has ${totalProducts} products under management with ${activeAlerts} active alerts. ` +
        `Risk level is ${risk.riskLevel} with ${risk.productsAtRisk} products requiring attention. ` +
        (criticalAlerts > 0
          ? `Immediate action required on ${criticalAlerts} critical alerts.`
          : 'No immediate action required.'),
    };

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ai/ask
 * Natural language query interface (placeholder)
 */
router.post('/ask', async (req, res, next) => {
  try {
    const { query } = req.body;
    const userId = req.user!.userId;

    if (!query || typeof query !== 'string') {
      throw new ValidationError('Query is required');
    }

    // TODO: Implement actual NL processing with LLM
    // For now, return a structured response based on keywords

    const response = processNaturalLanguageQuery(query, userId);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface ClientWithProducts {
  name: string;
  products: Array<{ itemType: string }>;
  alerts: Array<{ severity: string; alertType: string }>;
}

interface RiskSummary {
  overallScore: number;
  riskLevel: string;
  productsAtRisk: number;
  criticalProducts: string[];
  topRiskFactors: string[];
}

function generateKeyInsights(client: ClientWithProducts, risk: RiskSummary): string[] {
  const insights: string[] = [];

  if (risk.productsAtRisk > 0) {
    insights.push(`${risk.productsAtRisk} products are at elevated risk levels`);
  }

  if (risk.topRiskFactors.length > 0) {
    insights.push(`Top risk factors: ${risk.topRiskFactors.join(', ')}`);
  }

  const criticalAlerts = client.alerts.filter((a) => a.severity === 'critical');
  if (criticalAlerts.length > 0) {
    const stockouts = criticalAlerts.filter((a) => a.alertType === 'stockout').length;
    if (stockouts > 0) {
      insights.push(`${stockouts} products are currently stocked out`);
    }
  }

  const noMovementAlerts = client.alerts.filter((a) => a.alertType === 'no_movement');
  if (noMovementAlerts.length > 0) {
    insights.push(`${noMovementAlerts.length} products have no recent movement`);
  }

  return insights;
}

function generateRecommendations(client: ClientWithProducts, risk: RiskSummary): string[] {
  const recommendations: string[] = [];

  if (risk.riskLevel === 'critical' || risk.riskLevel === 'high') {
    recommendations.push('Review and address all critical and high-risk products immediately');
  }

  const criticalAlerts = client.alerts.filter((a) => a.severity === 'critical');
  if (criticalAlerts.length > 0) {
    recommendations.push('Process urgent reorders for stocked-out or critically low items');
  }

  if (risk.topRiskFactors.includes('Stock Level')) {
    recommendations.push('Consider increasing safety stock levels for high-velocity items');
  }

  if (risk.topRiskFactors.includes('Data Reliability')) {
    recommendations.push('Import more historical data to improve forecast accuracy');
  }

  if (recommendations.length === 0) {
    recommendations.push('Continue monitoring - inventory health is stable');
  }

  return recommendations;
}

function processNaturalLanguageQuery(query: string, _userId: string) {
  const normalizedQuery = query.toLowerCase();

  // Simple keyword matching (placeholder for LLM)
  if (normalizedQuery.includes('risk') || normalizedQuery.includes('risky')) {
    return {
      type: 'risk_query',
      intent: 'get_risky_products',
      response: 'To view risky products, check the Risk Dashboard or call GET /api/ai/risk/top-risky',
      suggestedAction: '/api/ai/risk/top-risky',
    };
  }

  if (normalizedQuery.includes('alert') || normalizedQuery.includes('attention')) {
    return {
      type: 'alert_query',
      intent: 'get_alerts',
      response: 'View active alerts on the Alerts page or call GET /api/alerts',
      suggestedAction: '/api/alerts',
    };
  }

  if (normalizedQuery.includes('stock') && normalizedQuery.includes('out')) {
    return {
      type: 'stockout_query',
      intent: 'get_stockouts',
      response: 'To find stocked out items, filter alerts by type "stockout"',
      suggestedAction: '/api/alerts?type=stockout',
    };
  }

  if (normalizedQuery.includes('reorder') || normalizedQuery.includes('order')) {
    return {
      type: 'reorder_query',
      intent: 'get_reorder_list',
      response: 'View products due for reorder in the Reports section',
      suggestedAction: '/api/reports/reorder-schedule',
    };
  }

  return {
    type: 'unknown',
    intent: 'clarify',
    response: 'I can help you with: finding risky products, viewing alerts, checking stockouts, or generating reorder lists. What would you like to know?',
    suggestedQueries: [
      'Which products are at risk?',
      'Show me products that need attention',
      'What items are stocked out?',
      'Generate a reorder list',
    ],
  };
}

export default router;
