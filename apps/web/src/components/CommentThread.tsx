// =============================================================================
// COMMENT THREAD COMPONENT
// Threaded comments with visibility controls for enterprise collaboration
// =============================================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Send,
  Edit2,
  Trash2,
  Reply,
  Lock,
  Users,
  Globe,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/api/client';
import { useAuthStore, User } from '@/stores/auth.store';
import { AuthState } from '@inventory/shared/stores';
import { staggerContainer, staggerItem, fadeInUp } from '@/lib/animations';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

type AuthStateUser = AuthState<User>;

interface Comment {
  id: string;
  entityType: string;
  entityId: string;
  authorType: 'user' | 'portal_user';
  authorId: string;
  authorRole: string | null;
  authorName?: string;
  content: string;
  visibility: 'internal' | 'client' | 'all';
  parentId: string | null;
  mentions: Array<{ userId: string; userType: string }> | null;
  isEdited: boolean;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  replies?: Comment[];
}

interface CommentsResponse {
  data: Comment[];
  meta: {
    total: number;
  };
}

interface CommentThreadProps {
  entityType: 'product' | 'order' | 'client' | 'alert';
  entityId: string;
  title?: string;
  className?: string;
}

type CommentVisibility = 'internal' | 'client' | 'all';

const VISIBILITY_OPTIONS: Array<{
  value: CommentVisibility;
  label: string;
  icon: typeof Lock;
  description: string;
  color: string;
}> = [
  {
    value: 'internal',
    label: 'Internal',
    icon: Lock,
    description: 'Only visible to admin team',
    color: 'text-amber-600',
  },
  {
    value: 'client',
    label: 'Client',
    icon: Users,
    description: 'Visible to client contacts',
    color: 'text-blue-600',
  },
  {
    value: 'all',
    label: 'Everyone',
    icon: Globe,
    description: 'Visible to all',
    color: 'text-emerald-600',
  },
];

export function CommentThread({
  entityType,
  entityId,
  title = 'Comments',
  className,
}: CommentThreadProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state: AuthStateUser) => state.user);
  const [newComment, setNewComment] = useState('');
  const [visibility, setVisibility] = useState<CommentVisibility>('all');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  // Fetch comments
  const { data, isLoading } = useQuery({
    queryKey: ['comments', entityType, entityId],
    queryFn: () =>
      api.get<CommentsResponse>(
        `/collaboration/comments/${entityType}/${entityId}`,
        { params: { includeReplies: 'true' } }
      ),
  });

  const comments = data?.data || [];
  const totalCount = data?.meta?.total || 0;

  // Create comment mutation
  const createComment = useMutation({
    mutationFn: (data: { content: string; visibility: CommentVisibility; parentId?: string }) =>
      api.post(`/collaboration/comments/${entityType}/${entityId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] });
      setNewComment('');
      setReplyContent('');
      setReplyingTo(null);
      toast.success('Comment added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add comment');
    },
  });

  // Update comment mutation
  const updateComment = useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      api.patch(`/collaboration/comments/${commentId}`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] });
      setEditingComment(null);
      setEditContent('');
      toast.success('Comment updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update comment');
    },
  });

  // Delete comment mutation
  const deleteComment = useMutation({
    mutationFn: (commentId: string) => api.delete(`/collaboration/comments/${commentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] });
      toast.success('Comment deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete comment');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    createComment.mutate({ content: newComment, visibility });
  };

  const handleReply = (parentId: string) => {
    if (!replyContent.trim()) return;
    createComment.mutate({
      content: replyContent,
      visibility,
      parentId,
    });
  };

  const handleEdit = (commentId: string) => {
    if (!editContent.trim()) return;
    updateComment.mutate({ commentId, content: editContent });
  };

  const toggleReplies = (commentId: string) => {
    const newExpanded = new Set(expandedReplies);
    if (newExpanded.has(commentId)) {
      newExpanded.delete(commentId);
    } else {
      newExpanded.add(commentId);
    }
    setExpandedReplies(newExpanded);
  };

  const getVisibilityBadge = (vis: CommentVisibility) => {
    const option = VISIBILITY_OPTIONS.find((o) => o.value === vis);
    if (!option) return null;
    const Icon = option.icon;
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1 text-xs',
          option.color
        )}
        title={option.description}
      >
        <Icon className="w-3 h-3" />
        {option.label}
      </span>
    );
  };

  const canEdit = (comment: Comment) =>
    comment.authorId === user?.id && comment.authorType === 'user';

  const isAdmin = user?.role && ['admin', 'operations_manager', 'account_manager'].includes(user.role);

  const renderComment = (comment: Comment, isReply = false) => {
    const isEditing = editingComment === comment.id;
    const isReplying = replyingTo === comment.id;
    const hasReplies = comment.replies && comment.replies.length > 0;
    const showReplies = expandedReplies.has(comment.id);

    return (
      <motion.div
        key={comment.id}
        variants={staggerItem}
        className={clsx(
          'group',
          isReply && 'ml-8 border-l-2 border-gray-100 pl-4'
        )}
      >
        <div className={clsx(
          'p-4 rounded-lg transition-colors',
          comment.visibility === 'internal' && 'bg-amber-50/50 border border-amber-100',
          comment.visibility === 'client' && 'bg-blue-50/30 border border-blue-100',
          comment.visibility === 'all' && 'bg-gray-50 hover:bg-gray-100/80'
        )}>
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-sm font-medium text-primary-700">
                  {(comment.authorName || 'U')[0].toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm">
                    {comment.authorName || 'Unknown User'}
                  </span>
                  {comment.authorRole && (
                    <span className="text-xs text-gray-400 capitalize">
                      {comment.authorRole.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
                  {comment.isEdited && <span className="italic">(edited)</span>}
                  {getVisibilityBadge(comment.visibility)}
                </div>
              </div>
            </div>

            {/* Actions */}
            {canEdit(comment) && !isEditing && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setEditingComment(comment.id);
                    setEditContent(comment.content);
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this comment?')) {
                      deleteComment.mutate(comment.id);
                    }
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          {isEditing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="input w-full resize-none"
                rows={3}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(comment.id)}
                  disabled={updateComment.isPending}
                  className="btn btn-primary btn-sm"
                >
                  {updateComment.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    'Save'
                  )}
                </button>
                <button
                  onClick={() => {
                    setEditingComment(null);
                    setEditContent('');
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-gray-700 text-sm whitespace-pre-wrap">{comment.content}</p>
          )}

          {/* Reply button */}
          {!isReply && !isEditing && (
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => setReplyingTo(isReplying ? null : comment.id)}
                className="text-xs text-gray-500 hover:text-primary-600 flex items-center gap-1"
              >
                <Reply className="w-3.5 h-3.5" />
                Reply
              </button>
              {hasReplies && (
                <button
                  onClick={() => toggleReplies(comment.id)}
                  className="text-xs text-gray-500 hover:text-primary-600 flex items-center gap-1"
                >
                  {showReplies ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  {comment.replies!.length} {comment.replies!.length === 1 ? 'reply' : 'replies'}
                </button>
              )}
            </div>
          )}

          {/* Reply form */}
          {isReplying && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 space-y-2"
            >
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="input w-full resize-none text-sm"
                rows={2}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReply(comment.id)}
                  disabled={createComment.isPending || !replyContent.trim()}
                  className="btn btn-primary btn-sm"
                >
                  {createComment.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Reply
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyContent('');
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Replies */}
        <AnimatePresence>
          {hasReplies && showReplies && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 space-y-2"
            >
              {comment.replies!.map((reply) => renderComment(reply, true))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
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
            <MessageSquare className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {totalCount > 0 && (
              <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                {totalCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Comments List */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-medium">No comments yet</p>
            <p className="text-sm">Start the conversation by adding a comment below</p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            {comments
              .filter((c) => !c.parentId)
              .map((comment) => renderComment(comment))}
          </motion.div>
        )}
      </div>

      {/* New Comment Form */}
      <div className="p-4 border-t border-gray-100 bg-gray-50/50">
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="input w-full resize-none"
            rows={3}
          />

          <div className="flex items-center justify-between">
            {/* Visibility picker */}
            {isAdmin && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowVisibilityPicker(!showVisibilityPicker)}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors',
                    'hover:bg-gray-100',
                    visibility === 'internal' && 'border-amber-200 bg-amber-50 text-amber-700',
                    visibility === 'client' && 'border-blue-200 bg-blue-50 text-blue-700',
                    visibility === 'all' && 'border-gray-200 bg-white text-gray-700'
                  )}
                >
                  {(() => {
                    const opt = VISIBILITY_OPTIONS.find((o) => o.value === visibility);
                    const Icon = opt?.icon || Globe;
                    return (
                      <>
                        <Icon className="w-4 h-4" />
                        {opt?.label}
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    );
                  })()}
                </button>

                <AnimatePresence>
                  {showVisibilityPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute bottom-full left-0 mb-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10"
                    >
                      {VISIBILITY_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setVisibility(option.value);
                              setShowVisibilityPicker(false);
                            }}
                            className={clsx(
                              'w-full px-3 py-2 text-left hover:bg-gray-50 flex items-start gap-3',
                              visibility === option.value && 'bg-gray-50'
                            )}
                          >
                            <Icon className={clsx('w-4 h-4 mt-0.5', option.color)} />
                            <div>
                              <div className="font-medium text-sm text-gray-900">
                                {option.label}
                              </div>
                              <div className="text-xs text-gray-500">
                                {option.description}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <button
              type="submit"
              disabled={createComment.isPending || !newComment.trim()}
              className="btn btn-primary"
            >
              {createComment.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Post Comment
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

export default CommentThread;
