import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireClientAccess } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error-handler.js';
import {
  createComment,
  getComments,
  updateComment,
  deleteComment,
  getCommentCount,
  logActivity,
  getClientActivityFeed,
  getEntityActivityFeed,
  getSystemActivityFeed,
  createTodo,
  getUserTodos,
  getClientTodos,
  updateTodoStatus,
  updateTodo,
  deleteTodo,
  getOverdueTodos,
  getTodoStats,
  getVisibilityFilter,
  type EntityType,
  type CommentVisibility,
  type TodoStatus,
  type TodoPriority,
} from '../services/collaboration.service.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createCommentSchema = z.object({
  content: z.string().min(1, 'Content is required').max(5000),
  visibility: z.enum(['internal', 'client', 'all']).optional().default('all'),
  parentId: z.string().uuid().optional(),
  mentions: z
    .array(
      z.object({
        userId: z.string().uuid(),
        userType: z.enum(['user', 'portal_user']),
      })
    )
    .optional(),
});

const updateCommentSchema = z.object({
  content: z.string().min(1, 'Content is required').max(5000),
});

const createTodoSchema = z.object({
  clientId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(2000).optional(),
  assignedToType: z.enum(['user', 'portal_user']).optional(),
  assignedToId: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  entityType: z.string().max(50).optional(),
  entityId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  slaHours: z.number().int().positive().optional(),
});

const updateTodoSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assignedToType: z.enum(['user', 'portal_user']).optional(),
  assignedToId: z.string().uuid().optional(),
});

const updateTodoStatusSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'blocked', 'completed', 'cancelled']),
  resolution: z.string().max(1000).optional(),
});

// =============================================================================
// COMMENT ROUTES
// =============================================================================

/**
 * GET /api/collaboration/comments/:entityType/:entityId
 * Get comments for an entity
 */
router.get('/comments/:entityType/:entityId', async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params as { entityType: EntityType; entityId: string };
    const { includeReplies, limit } = req.query;

    const userType = 'user';
    const userRole = req.user!.role;

    // Get visibility filter based on user permissions
    const visibilityFilter = getVisibilityFilter(userType, userRole);

    const comments = await getComments(entityType, entityId, {
      visibility: visibilityFilter,
      includeReplies: includeReplies === 'true',
      limit: limit ? parseInt(limit as string) : undefined,
    });

    const count = await getCommentCount(entityType, entityId, visibilityFilter);

    res.json({
      data: comments,
      meta: {
        total: count,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/collaboration/comments/:entityType/:entityId
 * Create a comment on an entity
 */
router.post('/comments/:entityType/:entityId', async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params as { entityType: EntityType; entityId: string };
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const data = createCommentSchema.parse(req.body);

    // Only admins can create internal comments
    if (data.visibility === 'internal' && !['admin', 'operations_manager', 'account_manager'].includes(userRole)) {
      return res.status(403).json({ message: 'Not authorized to create internal comments' });
    }

    const comment = await createComment({
      entityType,
      entityId,
      authorType: 'user',
      authorId: userId,
      authorRole: userRole,
      content: data.content,
      visibility: data.visibility as CommentVisibility,
      parentId: data.parentId,
      mentions: data.mentions,
    });

    // Log activity
    await logActivity({
      actorType: 'user',
      actorId: userId,
      actorRole: userRole,
      action: 'comment_created',
      category: 'system',
      entityType,
      entityId,
      metadata: { commentId: comment.id, visibility: data.visibility },
    });

    res.status(201).json(comment);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/collaboration/comments/:commentId
 * Update a comment
 */
router.patch('/comments/:commentId', async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user!.userId;
    const data = updateCommentSchema.parse(req.body);

    const result = await updateComment(commentId, userId, data.content);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json(result.comment);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/collaboration/comments/:commentId
 * Delete a comment
 */
router.delete('/comments/:commentId', async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user!.userId;

    const result = await deleteComment(commentId, userId);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json({ message: 'Comment deleted' });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// ACTIVITY FEED ROUTES
// =============================================================================

/**
 * GET /api/collaboration/activity
 * Get system-wide activity feed (admin only)
 */
router.get('/activity', async (req, res, next) => {
  try {
    const userRole = req.user!.role;
    const { category, severity, limit, offset } = req.query;

    if (!['admin', 'operations_manager'].includes(userRole)) {
      return res.status(403).json({ message: 'Not authorized to view system activity' });
    }

    const result = await getSystemActivityFeed({
      category: category as any,
      severity: severity as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({
      data: result.activities,
      meta: {
        total: result.total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/collaboration/activity/client/:clientId
 * Get activity feed for a client
 */
router.get('/activity/client/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { category, entityType, entityId, limit, offset } = req.query;

    const result = await getClientActivityFeed(clientId, {
      category: category as any,
      entityType: entityType as string,
      entityId: entityId as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({
      data: result.activities,
      meta: {
        total: result.total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/collaboration/activity/entity/:entityType/:entityId
 * Get activity feed for a specific entity
 */
router.get('/activity/entity/:entityType/:entityId', async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params;
    const { limit } = req.query;

    const activities = await getEntityActivityFeed(
      entityType,
      entityId,
      limit ? parseInt(limit as string) : undefined
    );

    res.json({
      data: activities,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// TODO ROUTES
// =============================================================================

/**
 * GET /api/collaboration/todos
 * Get todos assigned to current user
 */
router.get('/todos', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { status, priority, limit } = req.query;

    const statusArray = status
      ? (status as string).split(',') as TodoStatus[]
      : undefined;

    const todos = await getUserTodos(userId, 'user', {
      status: statusArray,
      priority: priority as TodoPriority,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    const stats = await getTodoStats(userId, 'user');

    res.json({
      data: todos,
      meta: {
        stats,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/collaboration/todos/client/:clientId
 * Get todos for a client
 */
router.get('/todos/client/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { status, assignedToId, limit } = req.query;

    const statusArray = status
      ? (status as string).split(',') as TodoStatus[]
      : undefined;

    const todos = await getClientTodos(clientId, {
      status: statusArray,
      assignedToId: assignedToId as string,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({
      data: todos,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/collaboration/todos/overdue
 * Get overdue todos
 */
router.get('/todos/overdue', async (req, res, next) => {
  try {
    const { clientId } = req.query;

    const todos = await getOverdueTodos(clientId as string);

    res.json({
      data: todos,
      meta: {
        total: todos.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/collaboration/todos
 * Create a new todo
 */
router.post('/todos', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const data = createTodoSchema.parse(req.body);

    const todo = await createTodo({
      ...data,
      assignedBy: userId,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    });

    // Log activity
    await logActivity({
      clientId: data.clientId,
      actorType: 'user',
      actorId: userId,
      action: 'todo_created',
      category: 'system',
      entityType: 'todo',
      entityId: todo.id,
      metadata: { title: data.title, priority: data.priority },
    });

    res.status(201).json(todo);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/collaboration/todos/:todoId
 * Update a todo
 */
router.patch('/todos/:todoId', async (req, res, next) => {
  try {
    const { todoId } = req.params;
    const data = updateTodoSchema.parse(req.body);

    const todo = await updateTodo(todoId, {
      ...data,
      dueDate: data.dueDate === null ? null : data.dueDate ? new Date(data.dueDate) : undefined,
    });

    res.json(todo);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/collaboration/todos/:todoId/status
 * Update todo status
 */
router.patch('/todos/:todoId/status', async (req, res, next) => {
  try {
    const { todoId } = req.params;
    const userId = req.user!.userId;
    const data = updateTodoStatusSchema.parse(req.body);

    const todo = await updateTodoStatus(todoId, data.status, userId, data.resolution);

    // Log activity
    await logActivity({
      actorType: 'user',
      actorId: userId,
      action: `todo_${data.status}`,
      category: 'system',
      entityType: 'todo',
      entityId: todoId,
      metadata: { status: data.status },
    });

    res.json(todo);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/collaboration/todos/:todoId
 * Delete a todo
 */
router.delete('/todos/:todoId', async (req, res, next) => {
  try {
    const { todoId } = req.params;

    await deleteTodo(todoId);

    res.json({ message: 'Todo deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
