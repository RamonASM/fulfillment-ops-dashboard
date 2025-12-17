// =============================================================================
// NOTIFICATION PREFERENCES ROUTES
// API endpoints for managing user notification settings
// =============================================================================

import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import * as notificationPrefService from "../services/notification-preference.service.js";

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * GET /api/notification-preferences
 * Get current user's notification preferences
 */
router.get("/", async (req, res) => {
  try {
    const user = (req as any).user;
    const userId = user.id;
    const userType = user.role === "portal" ? "PortalUser" : "User";

    const prefs = await notificationPrefService.getUserPreference(
      userId,
      userType,
    );

    // If no preferences exist, create defaults
    if (!prefs) {
      const defaultPrefs =
        await notificationPrefService.createDefaultPreferences(
          userId,
          userType,
        );
      return res.json({
        success: true,
        data: defaultPrefs,
      });
    }

    res.json({
      success: true,
      data: prefs,
    });
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notification preferences",
    });
  }
});

/**
 * PATCH /api/notification-preferences
 * Update notification preferences
 */
router.patch("/", async (req, res) => {
  try {
    const user = (req as any).user;
    const userId = user.id;
    const userType = user.role === "portal" ? "PortalUser" : "User";

    const updates = req.body;

    // Validate updates
    if (
      updates.eventPreferences &&
      typeof updates.eventPreferences !== "object"
    ) {
      return res.status(400).json({
        success: false,
        error: "eventPreferences must be an object",
      });
    }

    if (
      updates.digestFrequency &&
      !["disabled", "daily", "weekly"].includes(updates.digestFrequency)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid digest frequency",
      });
    }

    // Validate quiet hours format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (updates.quietHoursStart && !timeRegex.test(updates.quietHoursStart)) {
      return res.status(400).json({
        success: false,
        error: "Invalid quiet hours start time format (use HH:MM)",
      });
    }
    if (updates.quietHoursEnd && !timeRegex.test(updates.quietHoursEnd)) {
      return res.status(400).json({
        success: false,
        error: "Invalid quiet hours end time format (use HH:MM)",
      });
    }

    const updated = await notificationPrefService.updatePreference(
      userId,
      userType,
      updates,
    );

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update notification preferences",
    });
  }
});

/**
 * POST /api/notification-preferences/reset
 * Reset preferences to defaults
 */
router.post("/reset", async (req, res) => {
  try {
    const user = (req as any).user;
    const userId = user.id;
    const userType = user.role === "portal" ? "PortalUser" : "User";

    // Delete existing preferences
    await notificationPrefService.updatePreference(userId, userType, {
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
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    });

    const prefs = await notificationPrefService.getUserPreference(
      userId,
      userType,
    );

    res.json({
      success: true,
      data: prefs,
    });
  } catch (error) {
    console.error("Error resetting notification preferences:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset notification preferences",
    });
  }
});

export default router;
