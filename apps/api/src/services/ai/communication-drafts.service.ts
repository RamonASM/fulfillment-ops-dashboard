import { prisma } from '../../lib/prisma.js';
import { format, addDays } from 'date-fns';

// =============================================================================
// AI COMMUNICATION DRAFTS SERVICE
// Generates context-aware client communication templates
// =============================================================================

interface DraftTemplate {
  id: string;
  type: 'reorder_alert' | 'stockout_warning' | 'usage_report' | 'proactive_check' | 'order_confirmation';
  subject: string;
  body: string;
  urgency: 'low' | 'medium' | 'high';
  suggestedSendTime: Date;
  clientId: string;
  productIds?: string[];
  metadata: Record<string, unknown>;
}

interface ClientContext {
  clientName: string;
  accountManagerName: string;
  criticalProducts: Array<{
    name: string;
    productId: string;
    currentStock: number;
    weeksRemaining: number;
    suggestedOrder: number;
  }>;
  lowStockCount: number;
  healthyCount: number;
  totalProducts: number;
  recentOrderCount: number;
}

// =============================================================================
// CONTEXT GATHERING
// =============================================================================

async function getClientContext(clientId: string, userId: string): Promise<ClientContext | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    select: {
      id: true,
      productId: true,
      name: true,
      currentStockPacks: true,
      packSize: true,
      stockStatus: true,
      weeksRemaining: true,
      avgDailyUsage: true,
      reorderPointPacks: true,
    },
  });

  const criticalProducts = products
    .filter((p) => ['critical', 'stockout', 'low'].includes(p.stockStatus || ''))
    .map((p) => {
      // Calculate suggested order quantity
      const targetWeeks = 8;
      const weeklyUsage = (p.avgDailyUsage || 0) * 7;
      const targetStock = weeklyUsage * targetWeeks;
      const currentUnits = p.currentStockPacks * (p.packSize || 1);
      const deficit = targetStock - currentUnits;
      const suggestedOrder = Math.max(0, Math.ceil(deficit / (p.packSize || 1)));

      return {
        name: p.name,
        productId: p.productId,
        currentStock: p.currentStockPacks,
        weeksRemaining: p.weeksRemaining || 0,
        suggestedOrder,
      };
    })
    .sort((a, b) => a.weeksRemaining - b.weeksRemaining)
    .slice(0, 10);

  const lowStockCount = products.filter((p) =>
    ['critical', 'stockout', 'low'].includes(p.stockStatus || '')
  ).length;

  const healthyCount = products.filter((p) => p.stockStatus === 'healthy').length;

  // Get recent orders count
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentTransactions = await prisma.transaction.findMany({
    where: {
      product: { clientId },
      dateSubmitted: { gte: thirtyDaysAgo },
    },
    distinct: ['orderId'],
  });

  return {
    clientName: client.name,
    accountManagerName: user?.name || 'Account Manager',
    criticalProducts,
    lowStockCount,
    healthyCount,
    totalProducts: products.length,
    recentOrderCount: recentTransactions.length,
  };
}

// =============================================================================
// DRAFT GENERATORS
// =============================================================================

function generateReorderAlertDraft(context: ClientContext, clientId: string): DraftTemplate {
  const topProducts = context.criticalProducts.slice(0, 5);
  const productList = topProducts
    .map(
      (p) =>
        `  - ${p.name} (${p.productId}): ${p.currentStock} packs remaining, ~${p.weeksRemaining} weeks left`
    )
    .join('\n');

  const suggestedOrderList = topProducts
    .filter((p) => p.suggestedOrder > 0)
    .map((p) => `  - ${p.name}: ${p.suggestedOrder} packs`)
    .join('\n');

  return {
    id: `reorder-${clientId}-${Date.now()}`,
    type: 'reorder_alert',
    subject: `[Action Required] ${context.lowStockCount} items need reordering - ${context.clientName}`,
    body: `Hi Team,

I wanted to reach out regarding your current inventory status. Based on recent usage patterns, the following items are running low and will need attention soon:

${productList}

To maintain your service levels and avoid stockouts, I'd recommend placing an order for:

${suggestedOrderList}

This should bring you back to approximately 8 weeks of coverage based on your current usage rates.

Would you like me to prepare a formal quote for these items? I'm also happy to adjust quantities based on any anticipated changes in demand.

Best regards,
${context.accountManagerName}`,
    urgency: context.criticalProducts.some((p) => p.weeksRemaining <= 2) ? 'high' : 'medium',
    suggestedSendTime: new Date(),
    clientId,
    productIds: topProducts.map((p) => p.productId),
    metadata: {
      lowStockCount: context.lowStockCount,
      criticalCount: context.criticalProducts.filter((p) => p.weeksRemaining <= 2).length,
    },
  };
}

function generateStockoutWarningDraft(context: ClientContext, clientId: string): DraftTemplate {
  const urgentProducts = context.criticalProducts.filter((p) => p.weeksRemaining <= 1);

  if (urgentProducts.length === 0) {
    return generateReorderAlertDraft(context, clientId);
  }

  const productList = urgentProducts
    .map((p) => `  - ${p.name}: ${p.currentStock} packs (CRITICAL - ${p.weeksRemaining} week remaining)`)
    .join('\n');

  return {
    id: `stockout-${clientId}-${Date.now()}`,
    type: 'stockout_warning',
    subject: `URGENT: Stockout Risk - ${urgentProducts.length} items critical - ${context.clientName}`,
    body: `Hi Team,

This is an urgent notification regarding critical inventory levels. The following items are at immediate risk of stockout:

${productList}

Based on current usage rates, these items could run out within the next week. I strongly recommend expedited ordering to prevent service disruption.

Please let me know ASAP if you'd like me to process an emergency order, and I'll work with our fulfillment team to prioritize delivery.

I'm available to discuss this at your earliest convenience.

Regards,
${context.accountManagerName}

P.S. If you have questions about alternative products or temporary solutions, I'm happy to help.`,
    urgency: 'high',
    suggestedSendTime: new Date(),
    clientId,
    productIds: urgentProducts.map((p) => p.productId),
    metadata: {
      urgentCount: urgentProducts.length,
      estimatedStockoutDate: format(addDays(new Date(), 7), 'MMMM d, yyyy'),
    },
  };
}

function generateUsageReportDraft(context: ClientContext, clientId: string): DraftTemplate {
  const healthPercent = Math.round((context.healthyCount / context.totalProducts) * 100);

  return {
    id: `report-${clientId}-${Date.now()}`,
    type: 'usage_report',
    subject: `Monthly Inventory Report - ${context.clientName}`,
    body: `Hi Team,

Here's your monthly inventory summary:

OVERVIEW
--------
Total Products Tracked: ${context.totalProducts}
Healthy Stock (4+ weeks): ${context.healthyCount} (${healthPercent}%)
Items Needing Attention: ${context.lowStockCount}
Orders Processed (30 days): ${context.recentOrderCount}

${
  context.lowStockCount > 0
    ? `
ITEMS TO WATCH
--------------
The following items may need reordering soon:
${context.criticalProducts.slice(0, 5).map((p) => `  - ${p.name}: ~${p.weeksRemaining} weeks remaining`).join('\n')}
`
    : `
Great news! All items are well-stocked.
`
}

KEY INSIGHTS
------------
- Your inventory health score is ${healthPercent}%
- ${context.recentOrderCount > 10 ? 'High activity this month with ' + context.recentOrderCount + ' orders' : 'Normal ordering patterns observed'}
- ${context.lowStockCount === 0 ? 'No immediate action required' : context.lowStockCount + ' items should be reviewed for reorder'}

Let me know if you'd like to schedule a call to review your inventory strategy or discuss any upcoming needs.

Best regards,
${context.accountManagerName}`,
    urgency: 'low',
    suggestedSendTime: addDays(new Date(), 1), // Schedule for next day
    clientId,
    metadata: {
      healthPercent,
      reportPeriod: 'monthly',
    },
  };
}

function generateProactiveCheckDraft(context: ClientContext, clientId: string): DraftTemplate {
  return {
    id: `proactive-${clientId}-${Date.now()}`,
    type: 'proactive_check',
    subject: `Quick Check-In: Upcoming Inventory Needs - ${context.clientName}`,
    body: `Hi Team,

I wanted to reach out proactively to check in on your inventory needs.

Currently, your inventory is looking ${context.lowStockCount === 0 ? 'great' : 'mostly healthy'}, with ${context.healthyCount} of ${context.totalProducts} items well-stocked.

${
  context.lowStockCount > 0
    ? `I noticed ${context.lowStockCount} items are running lower than usual. Would you like me to prepare a recommended reorder list?`
    : `No immediate reorders are needed, but I'd be happy to review your forecast if you're planning any changes.`
}

A few questions for you:
- Any upcoming events or campaigns that might increase demand?
- Are there any new products you'd like to add to your program?
- Should we adjust safety stock levels based on recent patterns?

Feel free to reply directly or book time on my calendar for a quick call.

Best,
${context.accountManagerName}`,
    urgency: 'low',
    suggestedSendTime: addDays(new Date(), 3),
    clientId,
    metadata: {
      checkInType: 'proactive',
    },
  };
}

// =============================================================================
// MAIN API
// =============================================================================

export async function generateCommunicationDrafts(
  clientId: string,
  userId: string
): Promise<DraftTemplate[]> {
  const context = await getClientContext(clientId, userId);

  if (!context) return [];

  const drafts: DraftTemplate[] = [];

  // Generate drafts based on client status
  if (context.criticalProducts.some((p) => p.weeksRemaining <= 1)) {
    drafts.push(generateStockoutWarningDraft(context, clientId));
  } else if (context.lowStockCount > 0) {
    drafts.push(generateReorderAlertDraft(context, clientId));
  }

  // Always offer usage report and proactive check options
  drafts.push(generateUsageReportDraft(context, clientId));
  drafts.push(generateProactiveCheckDraft(context, clientId));

  return drafts;
}

export async function generateSpecificDraft(
  clientId: string,
  userId: string,
  draftType: DraftTemplate['type']
): Promise<DraftTemplate | null> {
  const context = await getClientContext(clientId, userId);

  if (!context) return null;

  switch (draftType) {
    case 'reorder_alert':
      return generateReorderAlertDraft(context, clientId);
    case 'stockout_warning':
      return generateStockoutWarningDraft(context, clientId);
    case 'usage_report':
      return generateUsageReportDraft(context, clientId);
    case 'proactive_check':
      return generateProactiveCheckDraft(context, clientId);
    default:
      return null;
  }
}
