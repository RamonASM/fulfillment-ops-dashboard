import { describe, it, expect } from 'vitest';

// =============================================================================
// COMMENT VISIBILITY RULES TESTS
// =============================================================================

const COMMENT_VISIBILITY_RULES: Record<string, { canView: string[]; canCreate: string[] }> = {
  internal: {
    canView: ['admin', 'account_manager'],
    canCreate: ['admin', 'account_manager'],
  },
  client: {
    canView: ['admin', 'account_manager', 'client_admin', 'client_user'],
    canCreate: ['admin', 'account_manager', 'client_admin'],
  },
  all: {
    canView: ['admin', 'account_manager', 'client_admin', 'client_user'],
    canCreate: ['admin', 'account_manager', 'client_admin', 'client_user'],
  },
};

function canViewComment(visibility: string, userRole: string): boolean {
  const rules = COMMENT_VISIBILITY_RULES[visibility];
  if (!rules) return false;
  return rules.canView.includes(userRole);
}

function canCreateComment(visibility: string, userRole: string): boolean {
  const rules = COMMENT_VISIBILITY_RULES[visibility];
  if (!rules) return false;
  return rules.canCreate.includes(userRole);
}

// =============================================================================
// TODO STATUS TRANSITIONS
// =============================================================================

const TODO_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'blocked', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  completed: [], // Terminal state
  cancelled: [], // Terminal state
};

function canTransitionTodoStatus(from: string, to: string): boolean {
  const validTransitions = TODO_STATUS_TRANSITIONS[from];
  if (!validTransitions) return false;
  return validTransitions.includes(to);
}

function isTodoTerminal(status: string): boolean {
  const transitions = TODO_STATUS_TRANSITIONS[status];
  return transitions !== undefined && transitions.length === 0;
}

// =============================================================================
// ACTIVITY CATEGORIZATION
// =============================================================================

const ACTIVITY_CATEGORIES = ['order', 'inventory', 'alert', 'user', 'system'] as const;
const ACTIVITY_SEVERITIES = ['info', 'warning', 'critical'] as const;

type ActivityCategory = typeof ACTIVITY_CATEGORIES[number];
type ActivitySeverity = typeof ACTIVITY_SEVERITIES[number];

function isValidCategory(category: string): category is ActivityCategory {
  return ACTIVITY_CATEGORIES.includes(category as ActivityCategory);
}

function isValidSeverity(severity: string): severity is ActivitySeverity {
  return ACTIVITY_SEVERITIES.includes(severity as ActivitySeverity);
}

function determineActivitySeverity(action: string, category: string): ActivitySeverity {
  // Critical actions
  if (action.includes('delete') || action.includes('breach') || action.includes('escalate')) {
    return 'critical';
  }
  // Warning actions
  if (action.includes('reject') || action.includes('hold') || action.includes('overdue')) {
    return 'warning';
  }
  return 'info';
}

// =============================================================================
// TESTS
// =============================================================================

describe('Collaboration Service', () => {
  describe('Comment Visibility Rules', () => {
    describe('canViewComment', () => {
      it('should allow admin to view internal comments', () => {
        expect(canViewComment('internal', 'admin')).toBe(true);
      });

      it('should allow account_manager to view internal comments', () => {
        expect(canViewComment('internal', 'account_manager')).toBe(true);
      });

      it('should NOT allow client_admin to view internal comments', () => {
        expect(canViewComment('internal', 'client_admin')).toBe(false);
      });

      it('should NOT allow client_user to view internal comments', () => {
        expect(canViewComment('internal', 'client_user')).toBe(false);
      });

      it('should allow client_admin to view client-visibility comments', () => {
        expect(canViewComment('client', 'client_admin')).toBe(true);
      });

      it('should allow all roles to view all-visibility comments', () => {
        expect(canViewComment('all', 'admin')).toBe(true);
        expect(canViewComment('all', 'account_manager')).toBe(true);
        expect(canViewComment('all', 'client_admin')).toBe(true);
        expect(canViewComment('all', 'client_user')).toBe(true);
      });
    });

    describe('canCreateComment', () => {
      it('should allow admin to create internal comments', () => {
        expect(canCreateComment('internal', 'admin')).toBe(true);
      });

      it('should NOT allow client_user to create internal comments', () => {
        expect(canCreateComment('internal', 'client_user')).toBe(false);
      });

      it('should allow client_admin to create client-visibility comments', () => {
        expect(canCreateComment('client', 'client_admin')).toBe(true);
      });

      it('should NOT allow client_user to create client-visibility comments', () => {
        expect(canCreateComment('client', 'client_user')).toBe(false);
      });

      it('should allow client_user to create all-visibility comments', () => {
        expect(canCreateComment('all', 'client_user')).toBe(true);
      });
    });
  });

  describe('Todo Status Transitions', () => {
    describe('canTransitionTodoStatus', () => {
      it('should allow pending to in_progress', () => {
        expect(canTransitionTodoStatus('pending', 'in_progress')).toBe(true);
      });

      it('should allow pending to cancelled', () => {
        expect(canTransitionTodoStatus('pending', 'cancelled')).toBe(true);
      });

      it('should NOT allow pending directly to completed', () => {
        expect(canTransitionTodoStatus('pending', 'completed')).toBe(false);
      });

      it('should allow in_progress to completed', () => {
        expect(canTransitionTodoStatus('in_progress', 'completed')).toBe(true);
      });

      it('should allow in_progress to blocked', () => {
        expect(canTransitionTodoStatus('in_progress', 'blocked')).toBe(true);
      });

      it('should allow blocked to in_progress (unblock)', () => {
        expect(canTransitionTodoStatus('blocked', 'in_progress')).toBe(true);
      });

      it('should NOT allow completed to any other status', () => {
        expect(canTransitionTodoStatus('completed', 'pending')).toBe(false);
        expect(canTransitionTodoStatus('completed', 'in_progress')).toBe(false);
        expect(canTransitionTodoStatus('completed', 'cancelled')).toBe(false);
      });

      it('should NOT allow cancelled to any other status', () => {
        expect(canTransitionTodoStatus('cancelled', 'pending')).toBe(false);
        expect(canTransitionTodoStatus('cancelled', 'in_progress')).toBe(false);
      });
    });

    describe('isTodoTerminal', () => {
      it('should identify completed as terminal', () => {
        expect(isTodoTerminal('completed')).toBe(true);
      });

      it('should identify cancelled as terminal', () => {
        expect(isTodoTerminal('cancelled')).toBe(true);
      });

      it('should NOT identify pending as terminal', () => {
        expect(isTodoTerminal('pending')).toBe(false);
      });

      it('should NOT identify in_progress as terminal', () => {
        expect(isTodoTerminal('in_progress')).toBe(false);
      });

      it('should NOT identify blocked as terminal', () => {
        expect(isTodoTerminal('blocked')).toBe(false);
      });
    });
  });

  describe('Activity Feed', () => {
    describe('isValidCategory', () => {
      it('should validate order category', () => {
        expect(isValidCategory('order')).toBe(true);
      });

      it('should validate inventory category', () => {
        expect(isValidCategory('inventory')).toBe(true);
      });

      it('should validate alert category', () => {
        expect(isValidCategory('alert')).toBe(true);
      });

      it('should validate user category', () => {
        expect(isValidCategory('user')).toBe(true);
      });

      it('should validate system category', () => {
        expect(isValidCategory('system')).toBe(true);
      });

      it('should reject invalid category', () => {
        expect(isValidCategory('invalid')).toBe(false);
        expect(isValidCategory('')).toBe(false);
      });
    });

    describe('isValidSeverity', () => {
      it('should validate info severity', () => {
        expect(isValidSeverity('info')).toBe(true);
      });

      it('should validate warning severity', () => {
        expect(isValidSeverity('warning')).toBe(true);
      });

      it('should validate critical severity', () => {
        expect(isValidSeverity('critical')).toBe(true);
      });

      it('should reject invalid severity', () => {
        expect(isValidSeverity('invalid')).toBe(false);
        expect(isValidSeverity('error')).toBe(false);
      });
    });

    describe('determineActivitySeverity', () => {
      it('should return critical for delete actions', () => {
        expect(determineActivitySeverity('delete_order', 'order')).toBe('critical');
        expect(determineActivitySeverity('bulk_delete', 'inventory')).toBe('critical');
      });

      it('should return critical for breach actions', () => {
        expect(determineActivitySeverity('sla_breach', 'order')).toBe('critical');
      });

      it('should return critical for escalate actions', () => {
        expect(determineActivitySeverity('escalate_todo', 'system')).toBe('critical');
      });

      it('should return warning for reject actions', () => {
        expect(determineActivitySeverity('reject_order', 'order')).toBe('warning');
      });

      it('should return warning for hold actions', () => {
        expect(determineActivitySeverity('put_on_hold', 'order')).toBe('warning');
      });

      it('should return warning for overdue actions', () => {
        expect(determineActivitySeverity('mark_overdue', 'alert')).toBe('warning');
      });

      it('should return info for standard actions', () => {
        expect(determineActivitySeverity('create_order', 'order')).toBe('info');
        expect(determineActivitySeverity('update_product', 'inventory')).toBe('info');
        expect(determineActivitySeverity('user_login', 'user')).toBe('info');
      });
    });
  });

  describe('Mention Parsing', () => {
    function parseMentions(content: string): string[] {
      const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
      const mentions: string[] = [];
      let match;
      while ((match = mentionRegex.exec(content)) !== null) {
        mentions.push(match[2]); // Return the ID
      }
      return mentions;
    }

    it('should parse single mention', () => {
      const content = 'Hey @[John Doe](user-123), please review this.';
      expect(parseMentions(content)).toEqual(['user-123']);
    });

    it('should parse multiple mentions', () => {
      const content = '@[Alice](user-1) and @[Bob](user-2) should check this.';
      expect(parseMentions(content)).toEqual(['user-1', 'user-2']);
    });

    it('should return empty array for no mentions', () => {
      const content = 'This comment has no mentions.';
      expect(parseMentions(content)).toEqual([]);
    });

    it('should handle mentions with special characters in names', () => {
      const content = 'CC @[John O\'Brien](user-456)';
      expect(parseMentions(content)).toEqual(['user-456']);
    });
  });

  describe('Notification Preferences', () => {
    interface NotificationPrefs {
      emailEnabled: boolean;
      pushEnabled: boolean;
      inAppEnabled: boolean;
      orderEvents: { submitted: boolean; approved: boolean; shipped: boolean };
      alertEvents: { critical: boolean; warning: boolean; info: boolean };
    }

    function shouldSendNotification(
      prefs: NotificationPrefs,
      eventType: 'order' | 'alert',
      eventSubtype: string,
      channel: 'email' | 'push' | 'inApp'
    ): boolean {
      // Check channel enabled
      if (channel === 'email' && !prefs.emailEnabled) return false;
      if (channel === 'push' && !prefs.pushEnabled) return false;
      if (channel === 'inApp' && !prefs.inAppEnabled) return false;

      // Check event type preference
      if (eventType === 'order') {
        return (prefs.orderEvents as Record<string, boolean>)[eventSubtype] ?? false;
      }
      if (eventType === 'alert') {
        return (prefs.alertEvents as Record<string, boolean>)[eventSubtype] ?? false;
      }

      return false;
    }

    const defaultPrefs: NotificationPrefs = {
      emailEnabled: true,
      pushEnabled: true,
      inAppEnabled: true,
      orderEvents: { submitted: true, approved: true, shipped: true },
      alertEvents: { critical: true, warning: true, info: false },
    };

    it('should send email for order submitted event', () => {
      expect(shouldSendNotification(defaultPrefs, 'order', 'submitted', 'email')).toBe(true);
    });

    it('should send push for critical alert', () => {
      expect(shouldSendNotification(defaultPrefs, 'alert', 'critical', 'push')).toBe(true);
    });

    it('should NOT send notification for info alert (disabled by default)', () => {
      expect(shouldSendNotification(defaultPrefs, 'alert', 'info', 'email')).toBe(false);
    });

    it('should NOT send email when email is disabled', () => {
      const prefs = { ...defaultPrefs, emailEnabled: false };
      expect(shouldSendNotification(prefs, 'order', 'submitted', 'email')).toBe(false);
    });

    it('should still send inApp when email is disabled', () => {
      const prefs = { ...defaultPrefs, emailEnabled: false };
      expect(shouldSendNotification(prefs, 'order', 'submitted', 'inApp')).toBe(true);
    });
  });
});
