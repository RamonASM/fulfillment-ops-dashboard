import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma client before importing the service
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    client: {
      findUnique: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    usageMetric: {
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    alert: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getStockStatus } from '../services/alert.service.js';

// =============================================================================
// STOCK STATUS CLASSIFICATION TESTS
// =============================================================================

describe('Alert Service', () => {
  describe('getStockStatus', () => {
    describe('stockout detection', () => {
      it('should return stockout when current stock is 0', () => {
        const result = getStockStatus(0, 100, 10);
        expect(result.status).toBe('stockout');
        expect(result.weeksRemaining).toBe(0);
        expect(result.percentOfReorderPoint).toBe(0);
      });
    });

    describe('critical status detection', () => {
      it('should return critical when below 50% of reorder point', () => {
        const result = getStockStatus(40, 100, 5);
        expect(result.status).toBe('critical');
        expect(result.percentOfReorderPoint).toBe(40);
      });

      it('should return critical when less than 2 weeks remaining', () => {
        // 10 units, 10 units/day = 1 day = 0.14 weeks
        const result = getStockStatus(10, 5, 10);
        expect(result.status).toBe('critical');
        expect(result.weeksRemaining).toBeLessThan(2);
      });

      it('should return critical at exactly 50% of reorder point', () => {
        const result = getStockStatus(50, 100, 1);
        expect(result.status).toBe('critical');
        expect(result.percentOfReorderPoint).toBe(50);
      });
    });

    describe('low status detection', () => {
      it('should return low when at reorder point', () => {
        const result = getStockStatus(100, 100, 2);
        expect(result.status).toBe('low');
        expect(result.percentOfReorderPoint).toBe(100);
      });

      it('should return low when below reorder point but above 50%', () => {
        const result = getStockStatus(70, 100, 2);
        expect(result.status).toBe('low');
        expect(result.percentOfReorderPoint).toBe(70);
      });

      it('should return low when less than 4 weeks remaining', () => {
        // 21 units, 1 unit/day = 3 weeks
        const result = getStockStatus(21, 10, 1);
        expect(result.status).toBe('low');
        expect(result.weeksRemaining).toBe(3);
      });
    });

    describe('watch status detection', () => {
      it('should return watch when within 150% of reorder point', () => {
        const result = getStockStatus(120, 100, 2);
        expect(result.status).toBe('watch');
        expect(result.percentOfReorderPoint).toBe(120);
      });

      it('should return watch when less than 6 weeks remaining', () => {
        // 35 days = 5 weeks
        const result = getStockStatus(35, 10, 1);
        expect(result.status).toBe('watch');
        expect(result.weeksRemaining).toBe(5);
      });

      it('should return watch at exactly 150% of reorder point', () => {
        const result = getStockStatus(150, 100, 2);
        expect(result.status).toBe('watch');
        expect(result.percentOfReorderPoint).toBe(150);
      });
    });

    describe('healthy status detection', () => {
      it('should return healthy when above 150% of reorder point with enough weeks', () => {
        // 200 units, 100 reorder point = 200%
        // 200 units / 2 units per day = 100 days = 14.3 weeks
        const result = getStockStatus(200, 100, 2);
        expect(result.status).toBe('healthy');
        expect(result.percentOfReorderPoint).toBe(200);
        expect(result.weeksRemaining).toBeGreaterThan(6);
      });

      it('should return healthy with very high stock', () => {
        const result = getStockStatus(1000, 100, 5);
        expect(result.status).toBe('healthy');
      });
    });

    describe('edge cases', () => {
      it('should handle zero reorder point', () => {
        const result = getStockStatus(100, 0, 5);
        expect(result.percentOfReorderPoint).toBe(100);
      });

      it('should handle zero daily usage', () => {
        const result = getStockStatus(100, 100, 0);
        expect(result.weeksRemaining).toBe(999);
        // At exactly 100% of reorder point, status is 'low' regardless of weeks
        expect(result.status).toBe('low');
      });

      it('should handle zero daily usage with critical stock', () => {
        const result = getStockStatus(40, 100, 0);
        // Even with infinite weeks remaining, below 50% of reorder point is critical
        expect(result.status).toBe('critical');
      });

      it('should round weeks remaining to 1 decimal place', () => {
        // 25 units / 3 units per day = 8.33 days = 1.19 weeks
        const result = getStockStatus(25, 10, 3);
        expect(result.weeksRemaining).toBe(1.2);
      });

      it('should round percent of reorder point to integer', () => {
        const result = getStockStatus(75, 100, 1);
        expect(result.percentOfReorderPoint).toBe(75);
      });
    });

    describe('status priority (weeks vs percentage)', () => {
      it('should use weeks if percentage is healthy but weeks is critical', () => {
        // High percentage but very low weeks
        // 200% of reorder point but only 1 week remaining
        const result = getStockStatus(7, 3, 1);
        expect(result.percentOfReorderPoint).toBeGreaterThan(150);
        expect(result.weeksRemaining).toBe(1);
        expect(result.status).toBe('critical');
      });

      it('should use percentage if weeks is healthy but percentage is critical', () => {
        // Low percentage but many weeks (very low usage)
        const result = getStockStatus(40, 100, 0.1);
        expect(result.percentOfReorderPoint).toBe(40);
        expect(result.weeksRemaining).toBeGreaterThan(6);
        expect(result.status).toBe('critical');
      });
    });
  });
});

// =============================================================================
// STOCK STATUS BOUNDARY TESTS
// =============================================================================

describe('Stock Status Boundaries', () => {
  describe('percentage boundaries', () => {
    it('49% should be critical', () => {
      const result = getStockStatus(49, 100, 0.5);
      expect(result.status).toBe('critical');
    });

    it('51% should be low (not critical)', () => {
      const result = getStockStatus(51, 100, 0.5);
      expect(result.status).toBe('low');
    });

    it('100% should be low', () => {
      const result = getStockStatus(100, 100, 1);
      expect(result.status).toBe('low');
    });

    it('101% should be watch (not low)', () => {
      const result = getStockStatus(101, 100, 1);
      expect(result.status).toBe('watch');
    });

    it('151% should be healthy (not watch)', () => {
      // Need enough weeks too (151 / 0.5 = 302 days = 43 weeks)
      const result = getStockStatus(151, 100, 0.5);
      expect(result.status).toBe('healthy');
    });
  });

  describe('weeks boundaries', () => {
    it('1.9 weeks should be critical', () => {
      // 13 days / 7 = 1.86 weeks
      const result = getStockStatus(130, 10, 10);
      expect(result.status).toBe('critical');
    });

    it('2.1 weeks should be low (if percentage also qualifies)', () => {
      // 15 days = 2.14 weeks
      const result = getStockStatus(150, 100, 10);
      expect(result.weeksRemaining).toBeGreaterThanOrEqual(2);
      expect(result.status).toBe('low');
    });

    it('3.9 weeks should be low', () => {
      // 27 days / 7 = 3.86 weeks
      const result = getStockStatus(270, 100, 10);
      expect(result.weeksRemaining).toBeLessThan(4);
      expect(result.status).toBe('low');
    });

    it('5.9 weeks should be watch', () => {
      // 41 days / 7 = 5.86 weeks
      const result = getStockStatus(410, 100, 10);
      expect(result.weeksRemaining).toBeLessThan(6);
      expect(result.status).toBe('watch');
    });

    it('6.1 weeks with high percentage should be healthy', () => {
      // 43 days = 6.14 weeks + above 150%
      const result = getStockStatus(430, 200, 10);
      expect(result.weeksRemaining).toBeGreaterThan(6);
      expect(result.status).toBe('healthy');
    });
  });
});
