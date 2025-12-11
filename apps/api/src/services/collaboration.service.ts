import { prisma } from '../lib/prisma.js';

// =============================================================================
// TYPES
// =============================================================================

export type EntityType = 'product' | 'order' | 'client' | 'alert';
export type AuthorType = 'user' | 'portal_user';
export type CommentVisibility = 'internal' | 'client' | 'all';
export type TodoStatus = 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ActorType = 'user' | 'portal_user' | 'system' | 'automation';
export type ActivityCategory = 'order' | 'inventory' | 'alert' | 'user' | 'system';

export interface CreateCommentInput {
  entityType: EntityType;
  entityId: string;
  authorType: AuthorType;
  authorId: string;
  authorRole?: string;
  content: string;
  visibility?: CommentVisibility;
  parentId?: string;
  mentions?: Array<{ userId: string; userType: string }>;
  attachments?: Array<{ url: string; filename: string; type: string; size: number }>;
}

export interface CreateTodoInput {
  clientId?: string;
  title: string;
  description?: string;
  assignedToType?: string;
  assignedToId?: string;
  assignedBy: string;
  priority?: TodoPriority;
  entityType?: string;
  entityId?: string;
  dueDate?: Date;
  slaHours?: number;
}

export interface LogActivityInput {
  clientId?: string;
  actorType: ActorType;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  category: ActivityCategory;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  metadata?: Record<string, unknown>;
  changes?: { before: unknown; after: unknown };
  severity?: 'info' | 'warning' | 'critical';
  ipAddress?: string;
  userAgent?: string;
}

// =============================================================================
// COMMENT SERVICE
// =============================================================================

/**
 * Create a new comment
 */
export async function createComment(input: CreateCommentInput) {
  const comment = await prisma.comment.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      authorType: input.authorType,
      authorId: input.authorId,
      authorRole: input.authorRole,
      content: input.content,
      visibility: input.visibility || 'all',
      parentId: input.parentId,
      mentions: input.mentions || [],
      attachments: input.attachments || [],
    },
  });

  return comment;
}

/**
 * Get comments for an entity with visibility filtering
 */
export async function getComments(
  entityType: EntityType,
  entityId: string,
  options?: {
    visibility?: CommentVisibility[];
    includeReplies?: boolean;
    limit?: number;
  }
) {
  const where: any = {
    entityType,
    entityId,
  };

  // Filter by visibility
  if (options?.visibility && options.visibility.length > 0) {
    where.visibility = { in: options.visibility };
  }

  // Only top-level comments if not including replies
  if (!options?.includeReplies) {
    where.parentId = null;
  }

  const comments = await prisma.comment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50,
    include: {
      replies: options?.includeReplies
        ? {
            orderBy: { createdAt: 'asc' },
          }
        : false,
    },
  });

  return comments;
}

/**
 * Update a comment
 */
export async function updateComment(
  commentId: string,
  authorId: string,
  content: string
) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
  });

  if (!comment) {
    return { success: false, error: 'Comment not found' };
  }

  if (comment.authorId !== authorId) {
    return { success: false, error: 'Not authorized to edit this comment' };
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: {
      content,
      isEdited: true,
      editedAt: new Date(),
    },
  });

  return { success: true, comment: updated };
}

/**
 * Delete a comment
 */
export async function deleteComment(commentId: string, authorId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
  });

  if (!comment) {
    return { success: false, error: 'Comment not found' };
  }

  if (comment.authorId !== authorId) {
    return { success: false, error: 'Not authorized to delete this comment' };
  }

  // Delete replies first
  await prisma.comment.deleteMany({
    where: { parentId: commentId },
  });

  await prisma.comment.delete({
    where: { id: commentId },
  });

  return { success: true };
}

/**
 * Get comment count for an entity
 */
export async function getCommentCount(
  entityType: EntityType,
  entityId: string,
  visibility?: CommentVisibility[]
) {
  const where: any = {
    entityType,
    entityId,
  };

  if (visibility && visibility.length > 0) {
    where.visibility = { in: visibility };
  }

  return prisma.comment.count({ where });
}

// =============================================================================
// ACTIVITY FEED SERVICE
// =============================================================================

/**
 * Log an activity to the feed
 */
export async function logActivity(input: LogActivityInput) {
  const activity = await prisma.activityFeed.create({
    data: {
      clientId: input.clientId,
      actorType: input.actorType,
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: input.action,
      category: input.category,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      metadata: input.metadata as any,
      changes: input.changes as any,
      severity: input.severity || 'info',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });

  return activity;
}

/**
 * Get activity feed for a client
 */
export async function getClientActivityFeed(
  clientId: string,
  options?: {
    category?: ActivityCategory;
    entityType?: string;
    entityId?: string;
    limit?: number;
    offset?: number;
  }
) {
  const where: any = { clientId };

  if (options?.category) {
    where.category = options.category;
  }

  if (options?.entityType) {
    where.entityType = options.entityType;
  }

  if (options?.entityId) {
    where.entityId = options.entityId;
  }

  const [activities, total] = await Promise.all([
    prisma.activityFeed.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.activityFeed.count({ where }),
  ]);

  return { activities, total };
}

/**
 * Get activity feed for an entity
 */
export async function getEntityActivityFeed(
  entityType: string,
  entityId: string,
  limit?: number
) {
  return prisma.activityFeed.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    take: limit || 20,
  });
}

/**
 * Get system-wide activity feed (admin only)
 */
export async function getSystemActivityFeed(options?: {
  category?: ActivityCategory;
  severity?: string;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};

  if (options?.category) {
    where.category = options.category;
  }

  if (options?.severity) {
    where.severity = options.severity;
  }

  const [activities, total] = await Promise.all([
    prisma.activityFeed.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      include: {
        client: { select: { name: true, code: true } },
      },
    }),
    prisma.activityFeed.count({ where }),
  ]);

  return { activities, total };
}

// =============================================================================
// TODO SERVICE
// =============================================================================

/**
 * Create a new todo
 */
export async function createTodo(input: CreateTodoInput) {
  const todo = await prisma.todo.create({
    data: {
      clientId: input.clientId,
      title: input.title,
      description: input.description,
      assignedToType: input.assignedToType,
      assignedToId: input.assignedToId,
      assignedBy: input.assignedBy,
      priority: input.priority || 'medium',
      entityType: input.entityType,
      entityId: input.entityId,
      dueDate: input.dueDate,
      slaHours: input.slaHours,
    },
  });

  return todo;
}

/**
 * Get todos for a user
 */
export async function getUserTodos(
  userId: string,
  userType: string,
  options?: {
    status?: TodoStatus[];
    priority?: TodoPriority;
    limit?: number;
  }
) {
  const where: any = {
    assignedToId: userId,
    assignedToType: userType,
  };

  if (options?.status && options.status.length > 0) {
    where.status = { in: options.status };
  }

  if (options?.priority) {
    where.priority = options.priority;
  }

  return prisma.todo.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: options?.limit || 50,
    include: {
      client: { select: { name: true, code: true } },
    },
  });
}

/**
 * Get todos for a client
 */
export async function getClientTodos(
  clientId: string,
  options?: {
    status?: TodoStatus[];
    assignedToId?: string;
    limit?: number;
  }
) {
  const where: any = { clientId };

  if (options?.status && options.status.length > 0) {
    where.status = { in: options.status };
  }

  if (options?.assignedToId) {
    where.assignedToId = options.assignedToId;
  }

  return prisma.todo.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    take: options?.limit || 50,
  });
}

/**
 * Update todo status
 */
export async function updateTodoStatus(
  todoId: string,
  status: TodoStatus,
  userId?: string,
  resolution?: string
) {
  const updateData: any = { status };

  if (status === 'completed') {
    updateData.completedAt = new Date();
    updateData.completedBy = userId;
    updateData.resolution = resolution;
  } else if (status === 'in_progress') {
    updateData.completedAt = null;
    updateData.completedBy = null;
  }

  const todo = await prisma.todo.update({
    where: { id: todoId },
    data: updateData,
  });

  return todo;
}

/**
 * Update todo
 */
export async function updateTodo(
  todoId: string,
  data: {
    title?: string;
    description?: string;
    priority?: TodoPriority;
    dueDate?: Date | null;
    assignedToId?: string;
    assignedToType?: string;
  }
) {
  const todo = await prisma.todo.update({
    where: { id: todoId },
    data,
  });

  return todo;
}

/**
 * Delete a todo
 */
export async function deleteTodo(todoId: string) {
  await prisma.todo.delete({
    where: { id: todoId },
  });

  return { success: true };
}

/**
 * Get overdue todos
 */
export async function getOverdueTodos(clientId?: string) {
  const where: any = {
    status: { in: ['pending', 'in_progress'] },
    dueDate: { lt: new Date() },
  };

  if (clientId) {
    where.clientId = clientId;
  }

  return prisma.todo.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }],
    include: {
      client: { select: { name: true, code: true } },
    },
  });
}

/**
 * Get todo statistics
 */
export async function getTodoStats(userId?: string, userType?: string) {
  const where: any = {};

  if (userId && userType) {
    where.assignedToId = userId;
    where.assignedToType = userType;
  }

  const [pending, inProgress, completed, overdue] = await Promise.all([
    prisma.todo.count({
      where: { ...where, status: 'pending' },
    }),
    prisma.todo.count({
      where: { ...where, status: 'in_progress' },
    }),
    prisma.todo.count({
      where: { ...where, status: 'completed' },
    }),
    prisma.todo.count({
      where: {
        ...where,
        status: { in: ['pending', 'in_progress'] },
        dueDate: { lt: new Date() },
      },
    }),
  ]);

  return { pending, inProgress, completed, overdue };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if user can view a comment based on visibility rules
 */
export function canViewComment(
  comment: { visibility: string },
  userType: AuthorType,
  userRole?: string
): boolean {
  // Internal comments only visible to admin users
  if (comment.visibility === 'internal') {
    return userType === 'user' && ['admin', 'operations_manager', 'account_manager'].includes(userRole || '');
  }

  // Client visibility includes portal users
  if (comment.visibility === 'client') {
    return true;
  }

  // All visibility is public
  return true;
}

/**
 * Get visible comments based on user permissions
 */
export function getVisibilityFilter(
  userType: AuthorType,
  userRole?: string
): CommentVisibility[] {
  if (userType === 'user' && ['admin', 'operations_manager', 'account_manager'].includes(userRole || '')) {
    return ['internal', 'client', 'all'];
  }

  return ['client', 'all'];
}
