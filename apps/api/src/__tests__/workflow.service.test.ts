import { describe, it, expect } from 'vitest';

// Testing workflow state machine logic
// These are the order request statuses and their valid transitions
const ORDER_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['acknowledged', 'changes_requested', 'on_hold', 'cancelled'],
  acknowledged: ['fulfilled', 'changes_requested', 'on_hold', 'cancelled'],
  changes_requested: ['submitted', 'cancelled'],
  on_hold: ['acknowledged', 'changes_requested', 'cancelled'],
  fulfilled: [], // Terminal state
  cancelled: [], // Terminal state
};

function canTransition(fromStatus: string, toStatus: string): boolean {
  const validTransitions = ORDER_TRANSITIONS[fromStatus];
  if (!validTransitions) return false;
  return validTransitions.includes(toStatus);
}

function isTerminalState(status: string): boolean {
  const transitions = ORDER_TRANSITIONS[status];
  return transitions !== undefined && transitions.length === 0;
}

function calculateSlaDeadline(submittedAt: Date, slaHours: number): Date {
  const deadline = new Date(submittedAt);
  deadline.setHours(deadline.getHours() + slaHours);
  return deadline;
}

function isSlaBreached(submittedAt: Date, slaHours: number): boolean {
  const deadline = calculateSlaDeadline(submittedAt, slaHours);
  return new Date() > deadline;
}

describe('Workflow Service', () => {
  describe('Order State Machine', () => {
    describe('canTransition', () => {
      it('should allow draft to submitted transition', () => {
        expect(canTransition('draft', 'submitted')).toBe(true);
      });

      it('should allow draft to cancelled transition', () => {
        expect(canTransition('draft', 'cancelled')).toBe(true);
      });

      it('should not allow draft to fulfilled directly', () => {
        expect(canTransition('draft', 'fulfilled')).toBe(false);
      });

      it('should allow submitted to acknowledged transition', () => {
        expect(canTransition('submitted', 'acknowledged')).toBe(true);
      });

      it('should allow submitted to changes_requested transition', () => {
        expect(canTransition('submitted', 'changes_requested')).toBe(true);
      });

      it('should allow acknowledged to fulfilled transition', () => {
        expect(canTransition('acknowledged', 'fulfilled')).toBe(true);
      });

      it('should not allow fulfilled to any transition', () => {
        expect(canTransition('fulfilled', 'submitted')).toBe(false);
        expect(canTransition('fulfilled', 'cancelled')).toBe(false);
        expect(canTransition('fulfilled', 'draft')).toBe(false);
      });

      it('should not allow cancelled to any transition', () => {
        expect(canTransition('cancelled', 'draft')).toBe(false);
        expect(canTransition('cancelled', 'submitted')).toBe(false);
      });

      it('should allow changes_requested to submitted (resubmit)', () => {
        expect(canTransition('changes_requested', 'submitted')).toBe(true);
      });

      it('should allow on_hold to acknowledged (resume)', () => {
        expect(canTransition('on_hold', 'acknowledged')).toBe(true);
      });
    });

    describe('isTerminalState', () => {
      it('should identify fulfilled as terminal', () => {
        expect(isTerminalState('fulfilled')).toBe(true);
      });

      it('should identify cancelled as terminal', () => {
        expect(isTerminalState('cancelled')).toBe(true);
      });

      it('should not identify draft as terminal', () => {
        expect(isTerminalState('draft')).toBe(false);
      });

      it('should not identify submitted as terminal', () => {
        expect(isTerminalState('submitted')).toBe(false);
      });

      it('should not identify acknowledged as terminal', () => {
        expect(isTerminalState('acknowledged')).toBe(false);
      });
    });
  });

  describe('SLA Tracking', () => {
    describe('calculateSlaDeadline', () => {
      it('should calculate deadline correctly for 24-hour SLA', () => {
        const submittedAt = new Date('2024-12-10T10:00:00Z');
        const deadline = calculateSlaDeadline(submittedAt, 24);

        expect(deadline.getTime()).toBe(new Date('2024-12-11T10:00:00Z').getTime());
      });

      it('should calculate deadline correctly for 4-hour SLA', () => {
        const submittedAt = new Date('2024-12-10T10:00:00Z');
        const deadline = calculateSlaDeadline(submittedAt, 4);

        expect(deadline.getTime()).toBe(new Date('2024-12-10T14:00:00Z').getTime());
      });
    });

    describe('isSlaBreached', () => {
      it('should detect breached SLA for old submission', () => {
        const submittedAt = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
        const breached = isSlaBreached(submittedAt, 24);

        expect(breached).toBe(true);
      });

      it('should not breach SLA for recent submission', () => {
        const submittedAt = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
        const breached = isSlaBreached(submittedAt, 24);

        expect(breached).toBe(false);
      });
    });
  });

  describe('Order Workflow Flow', () => {
    it('should support the happy path: draft -> submitted -> acknowledged -> fulfilled', () => {
      const happyPath = ['draft', 'submitted', 'acknowledged', 'fulfilled'];

      for (let i = 0; i < happyPath.length - 1; i++) {
        expect(canTransition(happyPath[i], happyPath[i + 1])).toBe(true);
      }
    });

    it('should support revision flow: submitted -> changes_requested -> submitted', () => {
      expect(canTransition('submitted', 'changes_requested')).toBe(true);
      expect(canTransition('changes_requested', 'submitted')).toBe(true);
    });

    it('should support hold flow: acknowledged -> on_hold -> acknowledged', () => {
      expect(canTransition('acknowledged', 'on_hold')).toBe(true);
      expect(canTransition('on_hold', 'acknowledged')).toBe(true);
    });

    it('should allow cancellation from most states', () => {
      const cancellableStates = ['draft', 'submitted', 'acknowledged', 'changes_requested', 'on_hold'];

      for (const state of cancellableStates) {
        expect(canTransition(state, 'cancelled')).toBe(true);
      }
    });
  });
});
