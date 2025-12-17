// =============================================================================
// NOTIFICATION PREFERENCE SERVICE
// Manages user notification preferences and delivery rules
// =============================================================================

import { PrismaClient, NotificationPreference } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Get notification preferences for a user
 */
export async function getUserPreference(
  userId: string,
  userType: "User" | "PortalUser",
): Promise<NotificationPreference | null> {
  return prisma.notificationPreference.findUnique({
    where: {
      userId_userType: {
        userId,
        userType,
      },
    },
  });
}

/**
 * Check if a notification should be sent based on user preferences
 */
export async function shouldSendNotification(
  userId: string,
  userType: "User" | "PortalUser",
  eventType: string,
  channel: "email" | "push" | "inApp",
): Promise<boolean> {
  const pref = await getUserPreference(userId, userType);

  // If no preferences set, don't send
  if (!pref) {
    return false;
  }

  // Check if channel is enabled
  if (channel === "email" && !pref.emailEnabled) {
    return false;
  }
  if (channel === "push" && !pref.pushEnabled) {
    return false;
  }
  if (channel === "inApp" && !pref.inAppEnabled) {
    return false;
  }

  // Check if event type is enabled by checking the appropriate event preferences JSON field
  // orderEvents, alertEvents, commentEvents, todoEvents are JSON fields
  if (eventType.startsWith("order_")) {
    const orderEvents = pref.orderEvents as any;
    if (!orderEvents || !orderEvents[eventType.replace("order_", "")]) {
      return false;
    }
  } else if (eventType.startsWith("alert_")) {
    const alertEvents = pref.alertEvents as any;
    if (!alertEvents || !alertEvents[eventType.replace("alert_", "")]) {
      return false;
    }
  } else if (eventType.startsWith("comment_")) {
    const commentEvents = pref.commentEvents as any;
    if (!commentEvents || !commentEvents[eventType.replace("comment_", "")]) {
      return false;
    }
  } else if (eventType.startsWith("todo_")) {
    const todoEvents = pref.todoEvents as any;
    if (!todoEvents || !todoEvents[eventType.replace("todo_", "")]) {
      return false;
    }
  }

  // Check quiet hours
  if (isQuietHours(pref)) {
    return false;
  }

  return true;
}

/**
 * Check if current time is within user's quiet hours
 */
function isQuietHours(pref: NotificationPreference): boolean {
  if (!pref.quietHoursEnabled || !pref.quietHoursStart || !pref.quietHoursEnd) {
    return false;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const start = parseInt(pref.quietHoursStart.split(":")[0]);
  const end = parseInt(pref.quietHoursEnd.split(":")[0]);

  // Handle quiet hours that cross midnight
  if (start < end) {
    return currentHour >= start && currentHour < end;
  } else {
    return currentHour >= start || currentHour < end;
  }
}

/**
 * Update or create notification preferences for a user
 */
export async function updatePreference(
  userId: string,
  userType: "User" | "PortalUser",
  updates: Partial<NotificationPreference>,
): Promise<NotificationPreference> {
  // Remove fields that shouldn't be updated directly
  const { id, createdAt, updatedAt, ...safeUpdates } = updates as any;

  return prisma.notificationPreference.upsert({
    where: {
      userId_userType: {
        userId,
        userType,
      },
    },
    update: {
      ...safeUpdates,
      updatedAt: new Date(),
    },
    create: {
      userId,
      userType,
      ...safeUpdates,
    },
  });
}

/**
 * Create default notification preferences for a new user
 */
export async function createDefaultPreferences(
  userId: string,
  userType: "User" | "PortalUser",
): Promise<NotificationPreference> {
  return prisma.notificationPreference.create({
    data: {
      userId,
      userType,
      emailEnabled: true,
      pushEnabled: false,
      inAppEnabled: true,
      orderEvents: {
        submitted: true,
        acknowledged: true,
        fulfilled: true,
      },
      alertEvents: {
        critical: true,
        warning: true,
        info: false,
      },
      commentEvents: {
        mention: true,
        reply: true,
        thread: false,
      },
      todoEvents: {
        assigned: true,
        due_soon: true,
        overdue: true,
      },
      dailyDigest: false,
      weeklyDigest: true,
      digestTime: "09:00",
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    },
  });
}
