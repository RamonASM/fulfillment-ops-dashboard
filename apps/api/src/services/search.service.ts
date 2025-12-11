import { prisma } from '../lib/prisma.js';

// =============================================================================
// TYPES
// =============================================================================

export interface SearchResult {
  id: string;
  type: 'product' | 'client' | 'alert';
  title: string;
  subtitle?: string;
  metadata?: Record<string, unknown>;
  score: number;
}

export interface SearchOptions {
  clientId?: string;
  types?: ('product' | 'client' | 'alert')[];
  limit?: number;
}

// =============================================================================
// SEARCH SERVICE
// =============================================================================

/**
 * Global search across products, clients, and alerts
 */
export async function globalSearch(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { clientId, types = ['product', 'client', 'alert'], limit = 20 } = options;
  const results: SearchResult[] = [];

  // Normalize search query
  const searchTerms = query.toLowerCase().trim().split(/\s+/);
  if (searchTerms.length === 0 || searchTerms[0] === '') {
    return results;
  }

  // Search products
  if (types.includes('product')) {
    const productResults = await searchProducts(searchTerms, clientId, limit);
    results.push(...productResults);
  }

  // Search clients (if no clientId filter)
  if (types.includes('client') && !clientId) {
    const clientResults = await searchClients(searchTerms, limit);
    results.push(...clientResults);
  }

  // Search alerts
  if (types.includes('alert')) {
    const alertResults = await searchAlerts(searchTerms, clientId, limit);
    results.push(...alertResults);
  }

  // Sort by score and limit total results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Search products by name or productId
 */
async function searchProducts(
  searchTerms: string[],
  clientId?: string,
  limit: number = 20
): Promise<SearchResult[]> {
  // Build search pattern for PostgreSQL ILIKE
  const searchPattern = `%${searchTerms.join('%')}%`;

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(clientId && { clientId }),
      OR: [
        { name: { contains: searchTerms.join(' '), mode: 'insensitive' } },
        { productId: { contains: searchTerms[0], mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      productId: true,
      name: true,
      itemType: true,
      stockStatus: true,
      client: {
        select: { name: true, code: true },
      },
    },
    take: limit,
  });

  return products.map(product => ({
    id: product.id,
    type: 'product' as const,
    title: product.name,
    subtitle: `${product.productId} • ${product.client.name}`,
    metadata: {
      productId: product.productId,
      itemType: product.itemType,
      stockStatus: product.stockStatus,
      clientCode: product.client.code,
    },
    score: calculateRelevanceScore(searchTerms, [product.name, product.productId]),
  }));
}

/**
 * Search clients by name or code
 */
async function searchClients(
  searchTerms: string[],
  limit: number = 10
): Promise<SearchResult[]> {
  const clients = await prisma.client.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: searchTerms.join(' '), mode: 'insensitive' } },
        { code: { contains: searchTerms[0], mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      code: true,
      _count: {
        select: { products: true },
      },
    },
    take: limit,
  });

  return clients.map(client => ({
    id: client.id,
    type: 'client' as const,
    title: client.name,
    subtitle: `${client.code} • ${client._count.products} products`,
    metadata: {
      code: client.code,
      productCount: client._count.products,
    },
    score: calculateRelevanceScore(searchTerms, [client.name, client.code]),
  }));
}

/**
 * Search alerts by title
 */
async function searchAlerts(
  searchTerms: string[],
  clientId?: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const alerts = await prisma.alert.findMany({
    where: {
      isDismissed: false,
      ...(clientId && { clientId }),
      title: { contains: searchTerms.join(' '), mode: 'insensitive' },
    },
    select: {
      id: true,
      title: true,
      alertType: true,
      severity: true,
      client: {
        select: { name: true, code: true },
      },
      product: {
        select: { name: true },
      },
    },
    take: limit,
  });

  return alerts.map(alert => ({
    id: alert.id,
    type: 'alert' as const,
    title: alert.title,
    subtitle: `${alert.severity} • ${alert.client.name}${alert.product ? ` • ${alert.product.name}` : ''}`,
    metadata: {
      alertType: alert.alertType,
      severity: alert.severity,
      clientCode: alert.client.code,
    },
    score: calculateRelevanceScore(searchTerms, [alert.title]),
  }));
}

/**
 * Calculate relevance score based on term matches
 */
function calculateRelevanceScore(searchTerms: string[], fields: string[]): number {
  let score = 0;
  const normalizedFields = fields.map(f => f?.toLowerCase() || '');

  for (const term of searchTerms) {
    for (const field of normalizedFields) {
      // Exact match = high score
      if (field === term) {
        score += 100;
      }
      // Starts with = medium score
      else if (field.startsWith(term)) {
        score += 50;
      }
      // Contains = lower score
      else if (field.includes(term)) {
        score += 25;
      }
    }
  }

  return score;
}

/**
 * Search products within a specific client
 */
export async function searchClientProducts(
  clientId: string,
  query: string,
  options: { limit?: number; includeInactive?: boolean } = {}
): Promise<SearchResult[]> {
  const { limit = 50, includeInactive = false } = options;

  const products = await prisma.product.findMany({
    where: {
      clientId,
      ...(includeInactive ? {} : { isActive: true }),
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { productId: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      productId: true,
      name: true,
      itemType: true,
      stockStatus: true,
      currentStockPacks: true,
      packSize: true,
    },
    orderBy: { name: 'asc' },
    take: limit,
  });

  return products.map(product => ({
    id: product.id,
    type: 'product' as const,
    title: product.name,
    subtitle: product.productId,
    metadata: {
      productId: product.productId,
      itemType: product.itemType,
      stockStatus: product.stockStatus,
      currentStock: product.currentStockPacks * product.packSize,
    },
    score: 100, // All results equally scored for single-client search
  }));
}
