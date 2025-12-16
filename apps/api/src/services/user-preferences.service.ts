// =============================================================================
// USER PREFERENCES SERVICE
// Manage user preferences and custom dashboard layouts
// =============================================================================

import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export interface GridLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface UserPreferences {
  id: string;
  userId: string;
  defaultView: string;
  chartColorScheme: string;
  compactMode: boolean;
  enableRealtime: boolean;
  notificationSettings: NotificationSettings | null;
  updatedAt: Date;
}

export interface NotificationSettings {
  emailAlerts: boolean;
  desktopNotifications: boolean;
  alertTypes: string[]; // ['critical', 'warning', 'info']
  quietHoursStart?: string; // '22:00'
  quietHoursEnd?: string; // '08:00'
  [key: string]: any; // Index signature for JSON compatibility
}

export interface DashboardLayoutData {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  layout: GridLayout[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdatePreferencesInput {
  defaultView?: string;
  chartColorScheme?: string;
  compactMode?: boolean;
  enableRealtime?: boolean;
  notificationSettings?: NotificationSettings;
}

export interface CreateLayoutInput {
  name: string;
  layout: GridLayout[];
  isDefault?: boolean;
}

// =============================================================================
// USER PREFERENCES SERVICE
// =============================================================================

export class UserPreferencesService {
  /**
   * Get user preferences (creates default if not exists)
   */
  static async getPreferences(userId: string): Promise<UserPreferences> {
    let preferences = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!preferences) {
      // Create default preferences
      preferences = await prisma.userPreferences.create({
        data: {
          userId,
          defaultView: "dashboard",
          chartColorScheme: "default",
          compactMode: false,
          enableRealtime: true,
          notificationSettings: {
            emailAlerts: true,
            desktopNotifications: true,
            alertTypes: ["critical", "warning"],
          },
        },
      });

      logger.info("Created default user preferences", { userId });
    }

    return preferences as UserPreferences;
  }

  /**
   * Update user preferences
   */
  static async updatePreferences(
    userId: string,
    updates: UpdatePreferencesInput,
  ): Promise<UserPreferences> {
    const preferences = await prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        defaultView: updates.defaultView || "dashboard",
        chartColorScheme: updates.chartColorScheme || "default",
        compactMode: updates.compactMode ?? false,
        enableRealtime: updates.enableRealtime ?? true,
        notificationSettings: (updates.notificationSettings as any) || null,
      },
      update: updates,
    });

    logger.info("Updated user preferences", { userId });

    return preferences as UserPreferences;
  }

  /**
   * Reset preferences to default
   */
  static async resetPreferences(userId: string): Promise<UserPreferences> {
    const preferences = await prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        defaultView: "dashboard",
        chartColorScheme: "default",
        compactMode: false,
        enableRealtime: true,
      },
      update: {
        defaultView: "dashboard",
        chartColorScheme: "default",
        compactMode: false,
        enableRealtime: true,
        notificationSettings: {
          emailAlerts: true,
          desktopNotifications: true,
          alertTypes: ["critical", "warning"],
        },
      },
    });

    logger.info("Reset user preferences to default", { userId });

    return preferences as UserPreferences;
  }

  // ===========================================================================
  // DASHBOARD LAYOUTS
  // ===========================================================================

  /**
   * Get all dashboard layouts for a user
   */
  static async getLayouts(userId: string): Promise<DashboardLayoutData[]> {
    const layouts = await prisma.dashboardLayout.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });

    return layouts as unknown as DashboardLayoutData[];
  }

  /**
   * Get default dashboard layout for a user
   */
  static async getDefaultLayout(
    userId: string,
  ): Promise<DashboardLayoutData | null> {
    const layout = await prisma.dashboardLayout.findFirst({
      where: { userId, isDefault: true },
    });

    return layout as DashboardLayoutData | null;
  }

  /**
   * Create a new dashboard layout
   */
  static async createLayout(
    userId: string,
    input: CreateLayoutInput,
  ): Promise<DashboardLayoutData> {
    // If setting as default, unset other defaults
    if (input.isDefault) {
      await prisma.dashboardLayout.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const layout = await prisma.dashboardLayout.create({
      data: {
        userId,
        name: input.name,
        layout: input.layout as any,
        isDefault: input.isDefault || false,
      },
    });

    logger.info("Created dashboard layout", {
      userId,
      layoutId: layout.id,
      name: input.name,
    });

    return layout as unknown as DashboardLayoutData;
  }

  /**
   * Update an existing dashboard layout
   */
  static async updateLayout(
    layoutId: string,
    userId: string,
    updates: Partial<CreateLayoutInput>,
  ): Promise<DashboardLayoutData> {
    // Verify ownership
    const existing = await prisma.dashboardLayout.findFirst({
      where: { id: layoutId, userId },
    });

    if (!existing) {
      throw new Error("Dashboard layout not found or access denied");
    }

    // If setting as default, unset other defaults
    if (updates.isDefault) {
      await prisma.dashboardLayout.updateMany({
        where: { userId, isDefault: true, id: { not: layoutId } },
        data: { isDefault: false },
      });
    }

    const updateData: any = { ...updates };
    if (updates.layout) {
      updateData.layout = updates.layout as any;
    }

    const layout = await prisma.dashboardLayout.update({
      where: { id: layoutId },
      data: updateData,
    });

    logger.info("Updated dashboard layout", { userId, layoutId });

    return layout as unknown as DashboardLayoutData;
  }

  /**
   * Delete a dashboard layout
   */
  static async deleteLayout(layoutId: string, userId: string): Promise<void> {
    // Verify ownership
    const existing = await prisma.dashboardLayout.findFirst({
      where: { id: layoutId, userId },
    });

    if (!existing) {
      throw new Error("Dashboard layout not found or access denied");
    }

    await prisma.dashboardLayout.delete({
      where: { id: layoutId },
    });

    logger.info("Deleted dashboard layout", { userId, layoutId });
  }

  /**
   * Set a layout as default
   */
  static async setDefaultLayout(
    layoutId: string,
    userId: string,
  ): Promise<void> {
    // Verify ownership
    const existing = await prisma.dashboardLayout.findFirst({
      where: { id: layoutId, userId },
    });

    if (!existing) {
      throw new Error("Dashboard layout not found or access denied");
    }

    // Unset other defaults
    await prisma.dashboardLayout.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    // Set this one as default
    await prisma.dashboardLayout.update({
      where: { id: layoutId },
      data: { isDefault: true },
    });

    logger.info("Set default dashboard layout", { userId, layoutId });
  }

  /**
   * Get default widget layout (if no custom layout exists)
   */
  static getDefaultWidgetLayout(): GridLayout[] {
    return [
      { i: "kpi-cards", x: 0, y: 0, w: 12, h: 2 },
      { i: "stock-health", x: 0, y: 2, w: 4, h: 3 },
      { i: "monthly-trends", x: 4, y: 2, w: 8, h: 3 },
      { i: "order-deadlines", x: 0, y: 5, w: 6, h: 3 },
      { i: "benchmark-comparison", x: 6, y: 5, w: 6, h: 3 },
    ];
  }
}
