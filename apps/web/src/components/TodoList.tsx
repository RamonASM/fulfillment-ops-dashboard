// =============================================================================
// TODO LIST COMPONENT
// Task management with priority, assignment, and due date tracking
// =============================================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Plus,
  Calendar,
  User,
  MoreHorizontal,
  Trash2,
  X,
  Loader2,
  CheckSquare,
  Pause,
  Play,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/api/client';
import { staggerContainer, staggerItem, fadeInUp, scaleIn } from '@/lib/animations';
import toast from 'react-hot-toast';
import { format, isPast, isToday, isTomorrow } from 'date-fns';

interface Todo {
  id: string;
  clientId: string | null;
  title: string;
  description: string | null;
  assignedToType: 'user' | 'portal_user' | null;
  assignedToId: string | null;
  assignedToName?: string;
  assignedBy: string;
  assignedByName?: string;
  assignedAt: string;
  escalateToId: string | null;
  escalatedAt: string | null;
  escalationLevel: number;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  entityType: string | null;
  entityId: string | null;
  dueDate: string | null;
  reminderDate: string | null;
  slaHours: number | null;
  completedAt: string | null;
  completedBy: string | null;
  resolution: string | null;
  isRecurring: boolean;
  recurrenceRule: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TodosResponse {
  data: Todo[];
  meta: {
    stats: {
      pending: number;
      inProgress: number;
      blocked: number;
      completed: number;
      overdue: number;
    };
  };
}

interface TodoListProps {
  clientId?: string;
  entityType?: string;
  entityId?: string;
  title?: string;
  showCreateButton?: boolean;
  limit?: number;
  className?: string;
}

type TodoStatus = 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
type TodoPriority = 'low' | 'medium' | 'high' | 'urgent';

const STATUS_CONFIG: Record<
  TodoStatus,
  { icon: typeof Circle; label: string; color: string; bgColor: string }
> = {
  pending: {
    icon: Circle,
    label: 'Pending',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
  },
  in_progress: {
    icon: Play,
    label: 'In Progress',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  blocked: {
    icon: Pause,
    label: 'Blocked',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  completed: {
    icon: CheckCircle2,
    label: 'Completed',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
  },
  cancelled: {
    icon: XCircle,
    label: 'Cancelled',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
};

const PRIORITY_CONFIG: Record<
  TodoPriority,
  { label: string; color: string; bgColor: string; dotColor: string }
> = {
  low: {
    label: 'Low',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    dotColor: 'bg-gray-400',
  },
  medium: {
    label: 'Medium',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    dotColor: 'bg-blue-500',
  },
  high: {
    label: 'High',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    dotColor: 'bg-amber-500',
  },
  urgent: {
    label: 'Urgent',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    dotColor: 'bg-red-500',
  },
};

const STATUS_TRANSITIONS: Record<TodoStatus, TodoStatus[]> = {
  pending: ['in_progress', 'blocked', 'completed', 'cancelled'],
  in_progress: ['pending', 'blocked', 'completed', 'cancelled'],
  blocked: ['pending', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function TodoList({
  clientId,
  entityType,
  entityId,
  title = 'Tasks',
  showCreateButton = true,
  limit = 20,
  className,
}: TodoListProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<TodoStatus | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedTodo, setExpandedTodo] = useState<string | null>(null);

  // Fetch todos
  const queryKey = clientId
    ? ['todos', 'client', clientId, statusFilter]
    : ['todos', 'user', statusFilter];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const endpoint = clientId
        ? `/collaboration/todos/client/${clientId}`
        : '/collaboration/todos';
      return api.get<TodosResponse>(endpoint, {
        params: {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          limit,
        },
      });
    },
  });

  const todos = data?.data || [];
  const stats = data?.meta?.stats;

  // Create todo mutation
  const createTodo = useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      priority?: TodoPriority;
      dueDate?: string;
      clientId?: string;
      entityType?: string;
      entityId?: string;
    }) => api.post('/collaboration/todos', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setShowCreateModal(false);
      toast.success('Task created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create task');
    },
  });

  // Update todo status mutation
  const updateStatus = useMutation({
    mutationFn: ({ todoId, status, resolution }: { todoId: string; status: TodoStatus; resolution?: string }) =>
      api.patch(`/collaboration/todos/${todoId}/status`, { status, resolution }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success('Task status updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update task');
    },
  });

  // Delete todo mutation
  const deleteTodo = useMutation({
    mutationFn: (todoId: string) => api.delete(`/collaboration/todos/${todoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success('Task deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete task');
    },
  });

  const getDueDateDisplay = (dueDate: string | null) => {
    if (!dueDate) return null;

    const date = new Date(dueDate);
    const isOverdue = isPast(date) && !isToday(date);

    if (isOverdue) {
      return (
        <span className="text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Overdue
        </span>
      );
    }

    if (isToday(date)) {
      return (
        <span className="text-amber-600 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Today
        </span>
      );
    }

    if (isTomorrow(date)) {
      return (
        <span className="text-blue-600 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          Tomorrow
        </span>
      );
    }

    return (
      <span className="text-gray-500 flex items-center gap-1">
        <Calendar className="w-3 h-3" />
        {format(date, 'MMM d')}
      </span>
    );
  };

  const handleQuickComplete = (todo: Todo) => {
    if (todo.status === 'completed' || todo.status === 'cancelled') return;
    updateStatus.mutate({ todoId: todo.id, status: 'completed' });
  };

  const handleStatusChange = (todo: Todo, newStatus: TodoStatus) => {
    updateStatus.mutate({ todoId: todo.id, status: newStatus });
    setExpandedTodo(null);
  };

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className={clsx('card', className)}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold text-gray-900">{title}</h3>
          </div>

          {showCreateButton && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary btn-sm"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          )}
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="flex items-center gap-4 mt-3">
            <button
              onClick={() => setStatusFilter('all')}
              className={clsx(
                'text-xs font-medium px-2 py-1 rounded transition-colors',
                statusFilter === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              All ({stats.pending + stats.inProgress + stats.blocked})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={clsx(
                'text-xs font-medium px-2 py-1 rounded transition-colors',
                statusFilter === 'pending'
                  ? 'bg-gray-500 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              Pending ({stats.pending})
            </button>
            <button
              onClick={() => setStatusFilter('in_progress')}
              className={clsx(
                'text-xs font-medium px-2 py-1 rounded transition-colors',
                statusFilter === 'in_progress'
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-600 hover:bg-blue-50'
              )}
            >
              In Progress ({stats.inProgress})
            </button>
            {stats.overdue > 0 && (
              <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded">
                {stats.overdue} overdue
              </span>
            )}
          </div>
        )}
      </div>

      {/* Todo List */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : todos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-medium">No tasks yet</p>
            <p className="text-sm">Create a task to get started</p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-2"
          >
            {todos.map((todo) => {
              const statusConfig = STATUS_CONFIG[todo.status];
              const priorityConfig = PRIORITY_CONFIG[todo.priority];
              const StatusIcon = statusConfig.icon;
              const isExpanded = expandedTodo === todo.id;
              const canTransition = STATUS_TRANSITIONS[todo.status].length > 0;

              return (
                <motion.div
                  key={todo.id}
                  variants={staggerItem}
                  layout
                  className={clsx(
                    'group relative p-3 rounded-lg border transition-all',
                    todo.status === 'completed' && 'opacity-60',
                    todo.status !== 'completed' && 'hover:shadow-sm',
                    isExpanded ? 'border-primary-200 bg-primary-50/30' : 'border-gray-100 bg-white'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox / Status Icon */}
                    <button
                      onClick={() => handleQuickComplete(todo)}
                      disabled={!canTransition}
                      className={clsx(
                        'flex-shrink-0 mt-0.5 transition-colors',
                        canTransition && 'hover:text-emerald-600',
                        statusConfig.color
                      )}
                    >
                      <StatusIcon className="w-5 h-5" />
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4
                            className={clsx(
                              'font-medium text-gray-900 text-sm',
                              todo.status === 'completed' && 'line-through'
                            )}
                          >
                            {todo.title}
                          </h4>
                          {todo.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                              {todo.description}
                            </p>
                          )}
                        </div>

                        {/* Priority badge */}
                        <div
                          className={clsx(
                            'flex-shrink-0 w-2 h-2 rounded-full',
                            priorityConfig.dotColor
                          )}
                          title={`${priorityConfig.label} priority`}
                        />
                      </div>

                      {/* Meta info */}
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        {todo.dueDate && getDueDateDisplay(todo.dueDate)}

                        {todo.assignedToName && (
                          <span className="text-gray-500 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {todo.assignedToName}
                          </span>
                        )}

                        <span
                          className={clsx(
                            'px-1.5 py-0.5 rounded text-xs font-medium',
                            statusConfig.bgColor,
                            statusConfig.color
                          )}
                        >
                          {statusConfig.label}
                        </span>
                      </div>

                      {/* Expanded actions */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 pt-3 border-t border-gray-100"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-gray-500 mr-2">Change status:</span>
                              {STATUS_TRANSITIONS[todo.status].map((newStatus) => {
                                const config = STATUS_CONFIG[newStatus];
                                const Icon = config.icon;
                                return (
                                  <button
                                    key={newStatus}
                                    onClick={() => handleStatusChange(todo, newStatus)}
                                    className={clsx(
                                      'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                                      'border hover:bg-gray-50',
                                      config.color
                                    )}
                                  >
                                    <Icon className="w-3 h-3" />
                                    {config.label}
                                  </button>
                                );
                              })}
                            </div>

                            {todo.resolution && (
                              <div className="mt-2 text-xs text-gray-500">
                                <span className="font-medium">Resolution:</span> {todo.resolution}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setExpandedTodo(isExpanded ? null : todo.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this task?')) {
                            deleteTodo.mutate(todo.id);
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateTodoModal
            clientId={clientId}
            entityType={entityType}
            entityId={entityId}
            onClose={() => setShowCreateModal(false)}
            onSubmit={(data) => createTodo.mutate(data)}
            isSubmitting={createTodo.isPending}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Create Todo Modal Component
interface CreateTodoModalProps {
  clientId?: string;
  entityType?: string;
  entityId?: string;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description?: string;
    priority?: TodoPriority;
    dueDate?: string;
    clientId?: string;
    entityType?: string;
    entityId?: string;
  }) => void;
  isSubmitting: boolean;
}

function CreateTodoModal({
  clientId,
  entityType,
  entityId,
  onClose,
  onSubmit,
  isSubmitting,
}: CreateTodoModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [dueDate, setDueDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate || undefined,
      clientId,
      entityType,
      entityId,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <motion.div
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Create Task</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="input w-full"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details..."
              className="input w-full resize-none"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TodoPriority)}
                className="input w-full"
              >
                {(Object.keys(PRIORITY_CONFIG) as TodoPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_CONFIG[p].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input w-full"
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="btn btn-primary"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Task
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default TodoList;
