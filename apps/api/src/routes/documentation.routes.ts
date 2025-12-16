// =============================================================================
// DOCUMENTATION ROUTES
// Live documentation management for admin and client users
// =============================================================================

import express from "express";
import { DocumentationService } from "../services/documentation.service.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// =============================================================================
// PUBLIC ROUTES (for client portal and admin dashboard)
// =============================================================================

/**
 * GET /api/documentation
 * Get all documentation (filtered by audience)
 */
router.get("/", async (req, res) => {
  try {
    const { audience, category, search } = req.query;

    const docs = await DocumentationService.getDocumentation({
      audience: audience as any,
      category: category as string,
      search: search as string,
      publishedOnly: true,
    });

    res.json({
      success: true,
      data: docs,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to get documentation",
      details: message,
    });
  }
});

/**
 * GET /api/documentation/categories
 * Get all categories
 */
router.get("/categories", async (req, res) => {
  try {
    const { audience } = req.query;

    const categories = await DocumentationService.getCategories(
      audience as any,
    );

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to get categories",
      details: message,
    });
  }
});

/**
 * GET /api/documentation/search
 * Search documentation
 */
router.get("/search", async (req, res) => {
  try {
    const { q, audience } = req.query;

    if (!q || typeof q !== "string") {
      return res.status(400).json({
        success: false,
        error: "Search query is required",
      });
    }

    const docs = await DocumentationService.searchDocumentation(
      q,
      audience as any,
    );

    res.json({
      success: true,
      data: docs,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to search documentation",
      details: message,
    });
  }
});

/**
 * GET /api/documentation/:slug
 * Get documentation by slug
 */
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const doc = await DocumentationService.getDocumentationBySlug(slug);

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: "Documentation not found",
      });
    }

    res.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to get documentation",
      details: message,
    });
  }
});

// =============================================================================
// ADMIN ROUTES (requires authentication and admin role)
// =============================================================================

/**
 * POST /api/documentation
 * Create new documentation (admin only)
 */
router.post("/", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Only admins can create documentation
    if (userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only administrators can create documentation",
      });
    }

    const {
      slug,
      title,
      category,
      audience,
      content,
      excerpt,
      order,
      tags,
      keywords,
    } = req.body;

    if (!slug || !title || !category || !audience || !content) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: slug, title, category, audience, content",
      });
    }

    const doc = await DocumentationService.createDocumentation(
      {
        slug,
        title,
        category,
        audience,
        content,
        excerpt,
        order,
        tags,
        keywords,
      },
      userId,
    );

    res.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to create documentation",
      details: message,
    });
  }
});

/**
 * PATCH /api/documentation/:id
 * Update documentation (admin only)
 */
router.patch("/:id", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const { id } = req.params;

    // Only admins can update documentation
    if (userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only administrators can update documentation",
      });
    }

    const updates = req.body;

    const doc = await DocumentationService.updateDocumentation(
      id,
      updates,
      userId,
    );

    res.json({
      success: true,
      data: doc,
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
 * DELETE /api/documentation/:id
 * Delete documentation (admin only)
 */
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const userRole = req.user!.role;
    const { id } = req.params;

    // Only admins can delete documentation
    if (userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only administrators can delete documentation",
      });
    }

    await DocumentationService.deleteDocumentation(id);

    res.json({
      success: true,
      message: "Documentation deleted",
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to delete documentation",
      details: message,
    });
  }
});

/**
 * GET /api/documentation/admin/all
 * Get all documentation including unpublished (admin only)
 */
router.get("/admin/all", authenticate, async (req, res) => {
  try {
    const userRole = req.user!.role;

    // Only admins can view unpublished docs
    if (userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only administrators can view unpublished documentation",
      });
    }

    const { audience, category } = req.query;

    const docs = await DocumentationService.getDocumentation({
      audience: audience as any,
      category: category as string,
      publishedOnly: false,
    });

    res.json({
      success: true,
      data: docs,
    });
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error: "Failed to get documentation",
      details: message,
    });
  }
});

export default router;
