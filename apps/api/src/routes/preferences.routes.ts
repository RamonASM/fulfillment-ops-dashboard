// =============================================================================
// USER PREFERENCES & DASHBOARD LAYOUT ROUTES
// =============================================================================

import express from "express";
import { UserPreferencesService } from "../services/user-preferences.service.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// USER PREFERENCES
// =============================================================================

/**
 * GET /api/preferences
 * Get current user's preferences
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const preferences = await UserPreferencesService.getPreferences(userId);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to get preferences",
      details: message,
    });
  }
});

/**
 * PATCH /api/preferences
 * Update current user's preferences
 */
router.patch("/", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const updates = req.body;

    const preferences = await UserPreferencesService.updatePreferences(
      userId,
      updates,
    );

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to update preferences",
      details: message,
    });
  }
});

/**
 * POST /api/preferences/reset
 * Reset preferences to default
 */
router.post("/reset", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const preferences = await UserPreferencesService.resetPreferences(userId);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to reset preferences",
      details: message,
    });
  }
});

// =============================================================================
// DASHBOARD LAYOUTS
// =============================================================================

/**
 * GET /api/preferences/layouts
 * Get all dashboard layouts for current user
 */
router.get("/layouts", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const layouts = await UserPreferencesService.getLayouts(userId);

    res.json({
      success: true,
      data: layouts,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to get layouts",
      details: message,
    });
  }
});

/**
 * GET /api/preferences/layouts/default
 * Get default dashboard layout for current user
 */
router.get("/layouts/default", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const layout = await UserPreferencesService.getDefaultLayout(userId);

    if (!layout) {
      // Return default widget layout
      const defaultLayout = UserPreferencesService.getDefaultWidgetLayout();
      return res.json({
        success: true,
        data: {
          layout: defaultLayout,
          isDefault: true,
          name: "Default",
        },
      });
    }

    res.json({
      success: true,
      data: layout,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to get default layout",
      details: message,
    });
  }
});

/**
 * POST /api/preferences/layouts
 * Create a new dashboard layout
 */
router.post("/layouts", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { name, layout, isDefault } = req.body;

    if (!name || !layout) {
      return res.status(400).json({
        success: false,
        error: "Name and layout are required",
      });
    }

    const newLayout = await UserPreferencesService.createLayout(userId, {
      name,
      layout,
      isDefault,
    });

    res.json({
      success: true,
      data: newLayout,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to create layout",
      details: message,
    });
  }
});

/**
 * PATCH /api/preferences/layouts/:layoutId
 * Update a dashboard layout
 */
router.patch("/layouts/:layoutId", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { layoutId } = req.params;
    const updates = req.body;

    const layout = await UserPreferencesService.updateLayout(
      layoutId,
      userId,
      updates,
    );

    res.json({
      success: true,
      data: layout,
    });
  } catch (error) {
    const message = (error as Error).message;
    const statusCode = message.includes("not found") ? 404 : 500;

    res.status(statusCode).json({
      success: false,
      error: message,
    });
  }
});

/**
 * DELETE /api/preferences/layouts/:layoutId
 * Delete a dashboard layout
 */
router.delete("/layouts/:layoutId", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { layoutId } = req.params;

    await UserPreferencesService.deleteLayout(layoutId, userId);

    res.json({
      success: true,
      message: "Layout deleted",
    });
  } catch (error) {
    const message = (error as Error).message;
    const statusCode = message.includes("not found") ? 404 : 500;

    res.status(statusCode).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/preferences/layouts/:layoutId/set-default
 * Set a layout as default
 */
router.post("/layouts/:layoutId/set-default", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { layoutId } = req.params;

    await UserPreferencesService.setDefaultLayout(layoutId, userId);

    res.json({
      success: true,
      message: "Layout set as default",
    });
  } catch (error) {
    const message = (error as Error).message;
    const statusCode = message.includes("not found") ? 404 : 500;

    res.status(statusCode).json({
      success: false,
      error: message,
    });
  }
});

export default router;
