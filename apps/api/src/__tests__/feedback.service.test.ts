import { describe, it, expect } from 'vitest';

// =============================================================================
// FEEDBACK VALIDATION
// =============================================================================

interface FeedbackInput {
  productId: string;
  qualityRating: number;
  deliveryRating?: number;
  valueRating?: number;
  wouldReorder?: boolean;
  quantitySatisfaction?: 'too_little' | 'just_right' | 'too_much';
  usageNotes?: string;
  positiveComments?: string;
  improvementSuggestions?: string;
}

function validateFeedbackInput(input: FeedbackInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.productId || input.productId.trim() === '') {
    errors.push('productId is required');
  }

  if (input.qualityRating === undefined || input.qualityRating === null) {
    errors.push('qualityRating is required');
  } else if (input.qualityRating < 1 || input.qualityRating > 5) {
    errors.push('qualityRating must be between 1 and 5');
  }

  if (input.deliveryRating !== undefined && (input.deliveryRating < 1 || input.deliveryRating > 5)) {
    errors.push('deliveryRating must be between 1 and 5');
  }

  if (input.valueRating !== undefined && (input.valueRating < 1 || input.valueRating > 5)) {
    errors.push('valueRating must be between 1 and 5');
  }

  if (input.quantitySatisfaction !== undefined) {
    const validValues = ['too_little', 'just_right', 'too_much'];
    if (!validValues.includes(input.quantitySatisfaction)) {
      errors.push('quantitySatisfaction must be one of: too_little, just_right, too_much');
    }
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// POPULARITY SCORE CALCULATION
// =============================================================================

interface ProductStats {
  avgQualityRating: number | null;
  feedbackCount: number;
  orderCount: number;
  reorderRate: number; // Percentage of customers who would reorder
  monthlyUsage: number;
}

function calculatePopularityScore(stats: ProductStats): number {
  // Weighted scoring:
  // - Quality rating: 30% (normalized to 0-100)
  // - Feedback volume: 15% (capped at 20 feedbacks = 100%)
  // - Order volume: 25% (capped at 50 orders = 100%)
  // - Reorder rate: 20% (direct percentage)
  // - Usage volume: 10% (capped at 100 units = 100%)

  const qualityScore = stats.avgQualityRating ? (stats.avgQualityRating / 5) * 100 : 50;
  const feedbackScore = Math.min((stats.feedbackCount / 20) * 100, 100);
  const orderScore = Math.min((stats.orderCount / 50) * 100, 100);
  const reorderScore = stats.reorderRate;
  const usageScore = Math.min((stats.monthlyUsage / 100) * 100, 100);

  const popularityScore =
    qualityScore * 0.3 +
    feedbackScore * 0.15 +
    orderScore * 0.25 +
    reorderScore * 0.2 +
    usageScore * 0.1;

  return Math.round(popularityScore * 100) / 100; // Round to 2 decimal places
}

// =============================================================================
// RECOMMENDATION TYPES
// =============================================================================

type RecommendationType =
  | 'trending'           // High recent orders + positive feedback
  | 'top_rated'          // Highest quality ratings
  | 'low_stock_high_demand' // Low inventory but high usage
  | 'review_needed';     // Low ratings or no recent feedback

interface ProductForRecommendation {
  id: string;
  name: string;
  avgQualityRating: number | null;
  feedbackCount: number;
  recentOrderCount: number; // Orders in last 30 days
  currentStock: number;
  monthlyUsage: number;
  lastFeedbackDate: Date | null;
}

function categorizeProduct(product: ProductForRecommendation): RecommendationType[] {
  const categories: RecommendationType[] = [];
  const now = new Date();

  // Trending: High recent orders (>5) and decent rating (>3.5 or no rating yet)
  if (product.recentOrderCount > 5 && (product.avgQualityRating === null || product.avgQualityRating >= 3.5)) {
    categories.push('trending');
  }

  // Top rated: Rating >= 4.5 with at least 3 feedbacks
  if (product.avgQualityRating !== null && product.avgQualityRating >= 4.5 && product.feedbackCount >= 3) {
    categories.push('top_rated');
  }

  // Low stock high demand: Stock covers less than 2 weeks of usage
  const weeksOfStock = product.monthlyUsage > 0
    ? (product.currentStock / product.monthlyUsage) * 4
    : Infinity;
  if (weeksOfStock < 2 && product.monthlyUsage > 10) {
    categories.push('low_stock_high_demand');
  }

  // Review needed: Low rating (<3) OR no feedback in 90 days with orders
  if (product.avgQualityRating !== null && product.avgQualityRating < 3) {
    categories.push('review_needed');
  }
  if (product.lastFeedbackDate) {
    const daysSinceLastFeedback = (now.getTime() - product.lastFeedbackDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastFeedback > 90 && product.recentOrderCount > 0) {
      categories.push('review_needed');
    }
  } else if (product.recentOrderCount > 0) {
    // No feedback ever but has orders
    categories.push('review_needed');
  }

  return categories;
}

// =============================================================================
// FEEDBACK ANALYTICS
// =============================================================================

interface FeedbackAnalytics {
  totalFeedbacks: number;
  averageQuality: number;
  averageDelivery: number;
  averageValue: number;
  reorderPercentage: number;
  quantityDistribution: {
    tooLittle: number;
    justRight: number;
    tooMuch: number;
  };
}

function calculateAnalytics(feedbacks: Array<{
  qualityRating: number;
  deliveryRating: number | null;
  valueRating: number | null;
  wouldReorder: boolean | null;
  quantitySatisfaction: string | null;
}>): FeedbackAnalytics {
  if (feedbacks.length === 0) {
    return {
      totalFeedbacks: 0,
      averageQuality: 0,
      averageDelivery: 0,
      averageValue: 0,
      reorderPercentage: 0,
      quantityDistribution: { tooLittle: 0, justRight: 0, tooMuch: 0 },
    };
  }

  const qualitySum = feedbacks.reduce((sum, f) => sum + f.qualityRating, 0);

  const deliveryFeedbacks = feedbacks.filter(f => f.deliveryRating !== null);
  const deliverySum = deliveryFeedbacks.reduce((sum, f) => sum + (f.deliveryRating || 0), 0);

  const valueFeedbacks = feedbacks.filter(f => f.valueRating !== null);
  const valueSum = valueFeedbacks.reduce((sum, f) => sum + (f.valueRating || 0), 0);

  const reorderFeedbacks = feedbacks.filter(f => f.wouldReorder !== null);
  const reorderCount = reorderFeedbacks.filter(f => f.wouldReorder === true).length;

  const quantityFeedbacks = feedbacks.filter(f => f.quantitySatisfaction !== null);
  const tooLittle = quantityFeedbacks.filter(f => f.quantitySatisfaction === 'too_little').length;
  const justRight = quantityFeedbacks.filter(f => f.quantitySatisfaction === 'just_right').length;
  const tooMuch = quantityFeedbacks.filter(f => f.quantitySatisfaction === 'too_much').length;

  return {
    totalFeedbacks: feedbacks.length,
    averageQuality: Math.round((qualitySum / feedbacks.length) * 100) / 100,
    averageDelivery: deliveryFeedbacks.length > 0
      ? Math.round((deliverySum / deliveryFeedbacks.length) * 100) / 100
      : 0,
    averageValue: valueFeedbacks.length > 0
      ? Math.round((valueSum / valueFeedbacks.length) * 100) / 100
      : 0,
    reorderPercentage: reorderFeedbacks.length > 0
      ? Math.round((reorderCount / reorderFeedbacks.length) * 100)
      : 0,
    quantityDistribution: {
      tooLittle: quantityFeedbacks.length > 0 ? Math.round((tooLittle / quantityFeedbacks.length) * 100) : 0,
      justRight: quantityFeedbacks.length > 0 ? Math.round((justRight / quantityFeedbacks.length) * 100) : 0,
      tooMuch: quantityFeedbacks.length > 0 ? Math.round((tooMuch / quantityFeedbacks.length) * 100) : 0,
    },
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Feedback Service', () => {
  describe('Feedback Validation', () => {
    it('should validate valid feedback input', () => {
      const input: FeedbackInput = {
        productId: 'prod-123',
        qualityRating: 5,
        deliveryRating: 4,
        valueRating: 5,
        wouldReorder: true,
        quantitySatisfaction: 'just_right',
      };
      const result = validateFeedbackInput(input);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should require productId', () => {
      const input: FeedbackInput = {
        productId: '',
        qualityRating: 5,
      };
      const result = validateFeedbackInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('productId is required');
    });

    it('should require qualityRating', () => {
      const input = {
        productId: 'prod-123',
      } as FeedbackInput;
      const result = validateFeedbackInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('qualityRating is required');
    });

    it('should reject qualityRating below 1', () => {
      const input: FeedbackInput = {
        productId: 'prod-123',
        qualityRating: 0,
      };
      const result = validateFeedbackInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('qualityRating must be between 1 and 5');
    });

    it('should reject qualityRating above 5', () => {
      const input: FeedbackInput = {
        productId: 'prod-123',
        qualityRating: 6,
      };
      const result = validateFeedbackInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('qualityRating must be between 1 and 5');
    });

    it('should reject invalid quantitySatisfaction', () => {
      const input: FeedbackInput = {
        productId: 'prod-123',
        qualityRating: 4,
        quantitySatisfaction: 'invalid' as any,
      };
      const result = validateFeedbackInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('quantitySatisfaction must be one of: too_little, just_right, too_much');
    });

    it('should allow minimal valid feedback (only required fields)', () => {
      const input: FeedbackInput = {
        productId: 'prod-123',
        qualityRating: 3,
      };
      const result = validateFeedbackInput(input);
      expect(result.valid).toBe(true);
    });
  });

  describe('Popularity Score Calculation', () => {
    it('should calculate perfect score for ideal product', () => {
      const stats: ProductStats = {
        avgQualityRating: 5,
        feedbackCount: 20,
        orderCount: 50,
        reorderRate: 100,
        monthlyUsage: 100,
      };
      expect(calculatePopularityScore(stats)).toBe(100);
    });

    it('should calculate zero-ish score for poor product', () => {
      const stats: ProductStats = {
        avgQualityRating: 1,
        feedbackCount: 0,
        orderCount: 0,
        reorderRate: 0,
        monthlyUsage: 0,
      };
      // Quality: 1/5 * 100 * 0.3 = 6
      // Rest are 0
      expect(calculatePopularityScore(stats)).toBe(6);
    });

    it('should handle null quality rating with default score', () => {
      const stats: ProductStats = {
        avgQualityRating: null,
        feedbackCount: 10,
        orderCount: 25,
        reorderRate: 80,
        monthlyUsage: 50,
      };
      // Quality: 50 * 0.3 = 15
      // Feedback: 50 * 0.15 = 7.5
      // Orders: 50 * 0.25 = 12.5
      // Reorder: 80 * 0.2 = 16
      // Usage: 50 * 0.1 = 5
      // Total: 56
      expect(calculatePopularityScore(stats)).toBe(56);
    });

    it('should cap scores that exceed thresholds', () => {
      const stats: ProductStats = {
        avgQualityRating: 5,
        feedbackCount: 100, // Way over cap
        orderCount: 200,    // Way over cap
        reorderRate: 100,
        monthlyUsage: 500,  // Way over cap
      };
      // All capped at 100, so still 100
      expect(calculatePopularityScore(stats)).toBe(100);
    });

    it('should calculate mid-range score accurately', () => {
      const stats: ProductStats = {
        avgQualityRating: 4,
        feedbackCount: 10,
        orderCount: 25,
        reorderRate: 75,
        monthlyUsage: 40,
      };
      // Quality: (4/5)*100 * 0.3 = 24
      // Feedback: (10/20)*100 * 0.15 = 7.5
      // Orders: (25/50)*100 * 0.25 = 12.5
      // Reorder: 75 * 0.2 = 15
      // Usage: (40/100)*100 * 0.1 = 4
      // Total: 63
      expect(calculatePopularityScore(stats)).toBe(63);
    });
  });

  describe('Product Categorization', () => {
    it('should identify trending product', () => {
      const product: ProductForRecommendation = {
        id: 'prod-1',
        name: 'Popular Item',
        avgQualityRating: 4.0,
        feedbackCount: 5,
        recentOrderCount: 10,
        currentStock: 100,
        monthlyUsage: 20,
        lastFeedbackDate: new Date(),
      };
      const categories = categorizeProduct(product);
      expect(categories).toContain('trending');
    });

    it('should identify top_rated product', () => {
      const product: ProductForRecommendation = {
        id: 'prod-2',
        name: 'Highly Rated Item',
        avgQualityRating: 4.8,
        feedbackCount: 10,
        recentOrderCount: 3,
        currentStock: 100,
        monthlyUsage: 20,
        lastFeedbackDate: new Date(),
      };
      const categories = categorizeProduct(product);
      expect(categories).toContain('top_rated');
    });

    it('should identify low_stock_high_demand product', () => {
      const product: ProductForRecommendation = {
        id: 'prod-3',
        name: 'Running Low',
        avgQualityRating: 4.0,
        feedbackCount: 5,
        recentOrderCount: 8,
        currentStock: 5,   // Very low
        monthlyUsage: 20,  // High usage
        lastFeedbackDate: new Date(),
      };
      const categories = categorizeProduct(product);
      expect(categories).toContain('low_stock_high_demand');
    });

    it('should identify review_needed product (low rating)', () => {
      const product: ProductForRecommendation = {
        id: 'prod-4',
        name: 'Poorly Rated',
        avgQualityRating: 2.5,
        feedbackCount: 5,
        recentOrderCount: 3,
        currentStock: 50,
        monthlyUsage: 10,
        lastFeedbackDate: new Date(),
      };
      const categories = categorizeProduct(product);
      expect(categories).toContain('review_needed');
    });

    it('should identify review_needed product (stale feedback)', () => {
      const product: ProductForRecommendation = {
        id: 'prod-5',
        name: 'Stale Feedback',
        avgQualityRating: 4.0,
        feedbackCount: 3,
        recentOrderCount: 5,
        currentStock: 50,
        monthlyUsage: 10,
        lastFeedbackDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
      };
      const categories = categorizeProduct(product);
      expect(categories).toContain('review_needed');
    });

    it('should identify review_needed product (no feedback but has orders)', () => {
      const product: ProductForRecommendation = {
        id: 'prod-6',
        name: 'Never Reviewed',
        avgQualityRating: null,
        feedbackCount: 0,
        recentOrderCount: 5,
        currentStock: 50,
        monthlyUsage: 10,
        lastFeedbackDate: null,
      };
      const categories = categorizeProduct(product);
      expect(categories).toContain('review_needed');
    });

    it('should handle product with multiple categories', () => {
      const product: ProductForRecommendation = {
        id: 'prod-7',
        name: 'Complex Item',
        avgQualityRating: 4.8,
        feedbackCount: 5,
        recentOrderCount: 10,
        currentStock: 3,
        monthlyUsage: 15,
        lastFeedbackDate: new Date(),
      };
      const categories = categorizeProduct(product);
      expect(categories).toContain('trending');
      expect(categories).toContain('top_rated');
      expect(categories).toContain('low_stock_high_demand');
    });

    it('should return empty array for unremarkable product', () => {
      const product: ProductForRecommendation = {
        id: 'prod-8',
        name: 'Average Item',
        avgQualityRating: 3.5,
        feedbackCount: 5,
        recentOrderCount: 3,
        currentStock: 100,
        monthlyUsage: 10,
        lastFeedbackDate: new Date(),
      };
      const categories = categorizeProduct(product);
      expect(categories.length).toBe(0);
    });
  });

  describe('Feedback Analytics', () => {
    it('should calculate analytics for feedback set', () => {
      const feedbacks = [
        { qualityRating: 5, deliveryRating: 5, valueRating: 5, wouldReorder: true, quantitySatisfaction: 'just_right' },
        { qualityRating: 4, deliveryRating: 4, valueRating: 4, wouldReorder: true, quantitySatisfaction: 'just_right' },
        { qualityRating: 3, deliveryRating: 3, valueRating: null, wouldReorder: false, quantitySatisfaction: 'too_little' },
        { qualityRating: 5, deliveryRating: null, valueRating: 5, wouldReorder: true, quantitySatisfaction: null },
      ];

      const analytics = calculateAnalytics(feedbacks);

      expect(analytics.totalFeedbacks).toBe(4);
      expect(analytics.averageQuality).toBe(4.25); // (5+4+3+5)/4
      expect(analytics.averageDelivery).toBe(4); // (5+4+3)/3
      expect(analytics.averageValue).toBeCloseTo(4.67, 1); // (5+4+5)/3
      expect(analytics.reorderPercentage).toBe(75); // 3/4
    });

    it('should handle empty feedback set', () => {
      const analytics = calculateAnalytics([]);

      expect(analytics.totalFeedbacks).toBe(0);
      expect(analytics.averageQuality).toBe(0);
      expect(analytics.averageDelivery).toBe(0);
      expect(analytics.averageValue).toBe(0);
      expect(analytics.reorderPercentage).toBe(0);
      expect(analytics.quantityDistribution).toEqual({ tooLittle: 0, justRight: 0, tooMuch: 0 });
    });

    it('should calculate quantity distribution correctly', () => {
      const feedbacks = [
        { qualityRating: 4, deliveryRating: null, valueRating: null, wouldReorder: null, quantitySatisfaction: 'too_little' },
        { qualityRating: 4, deliveryRating: null, valueRating: null, wouldReorder: null, quantitySatisfaction: 'just_right' },
        { qualityRating: 4, deliveryRating: null, valueRating: null, wouldReorder: null, quantitySatisfaction: 'just_right' },
        { qualityRating: 4, deliveryRating: null, valueRating: null, wouldReorder: null, quantitySatisfaction: 'too_much' },
      ];

      const analytics = calculateAnalytics(feedbacks);

      expect(analytics.quantityDistribution.tooLittle).toBe(25); // 1/4
      expect(analytics.quantityDistribution.justRight).toBe(50); // 2/4
      expect(analytics.quantityDistribution.tooMuch).toBe(25); // 1/4
    });

    it('should handle feedbacks with only required fields', () => {
      const feedbacks = [
        { qualityRating: 5, deliveryRating: null, valueRating: null, wouldReorder: null, quantitySatisfaction: null },
        { qualityRating: 4, deliveryRating: null, valueRating: null, wouldReorder: null, quantitySatisfaction: null },
      ];

      const analytics = calculateAnalytics(feedbacks);

      expect(analytics.totalFeedbacks).toBe(2);
      expect(analytics.averageQuality).toBe(4.5);
      expect(analytics.averageDelivery).toBe(0);
      expect(analytics.averageValue).toBe(0);
      expect(analytics.reorderPercentage).toBe(0);
    });
  });
});
