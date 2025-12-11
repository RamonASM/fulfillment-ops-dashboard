// =============================================================================
// ACTIVITY FEED COMPONENT
// Timeline of activities for audit trail and collaboration
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity,
  Package,
  ShoppingCart,
  AlertTriangle,
  User,
  Settings,
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Upload,
  Download,
  Loader2,
  Filter,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/api/client';
import { staggerContainer, staggerItem, fadeInUp } from '@/lib/animations';
import { formatDistanceToNow, format } from 'date-fns';
import { useState } from 'react';

interface ActivityItem {
  id: string;
  clientId: string | null;
  actorType: 'user' | 'portal_user' | 'system' | 'automation';
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  category: 'order' | 'inventory' | 'alert' | 'user' | 'system';
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  metadata: Record<string, unknown> | null;
  changes: Record<string, unknown> | null;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
}

interface ActivityFeedResponse {
  data: ActivityItem[];
  meta: {
    total: number;
  };
}

interface ActivityFeedProps {
  clientId?: string;
  entityType?: string;
  entityId?: string;
  title?: string;
  limit?: number;
  showFilters?: boolean;
  className?: string;
}

const CATEGORY_CONFIG: Record<
  string,
  { icon: typeof Activity; color: string; bgColor: string }
> = {
  order: {
    icon: ShoppingCart,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  inventory: {
    icon: Package,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
  },
  alert: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  user: {
    icon: User,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  system: {
    icon: Settings,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
};

const ACTION_ICONS: Record<string, typeof Activity> = {
  comment_created: MessageSquare,
  todo_created: CheckCircle,
  todo_completed: CheckCircle,
  todo_cancelled: XCircle,
  order_submitted: ShoppingCart,
  order_acknowledged: Clock,
  order_fulfilled: CheckCircle,
  product_updated: Package,
  product_created: Package,
  alert_created: AlertTriangle,
  alert_resolved: CheckCircle,
  import_completed: Upload,
  export_completed: Download,
  user_login: User,
  settings_updated: Settings,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: 'border-gray-200',
  warning: 'border-amber-200 bg-amber-50/30',
  critical: 'border-red-200 bg-red-50/30',
};

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Activity' },
  { value: 'order', label: 'Orders' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'alert', label: 'Alerts' },
  { value: 'user', label: 'Users' },
  { value: 'system', label: 'System' },
];

export function ActivityFeed({
  clientId,
  entityType,
  entityId,
  title = 'Activity',
  limit = 20,
  showFilters = true,
  className,
}: ActivityFeedProps) {
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Determine which endpoint to use
  const getEndpoint = () => {
    if (entityType && entityId) {
      return `/collaboration/activity/entity/${entityType}/${entityId}`;
    }
    if (clientId) {
      return `/collaboration/activity/client/${clientId}`;
    }
    return '/collaboration/activity';
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['activity', clientId, entityType, entityId, categoryFilter, limit],
    queryFn: () =>
      api.get<ActivityFeedResponse>(getEndpoint(), {
        params: {
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          limit,
        },
      }),
  });

  const activities = data?.data || [];

  const getActionIcon = (activity: ActivityItem) => {
    const Icon = ACTION_ICONS[activity.action] || CATEGORY_CONFIG[activity.category]?.icon || Activity;
    return Icon;
  };

  const getCategoryConfig = (category: string) => {
    return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.system;
  };

  const formatAction = (action: string): string => {
    return action
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getActivityDescription = (activity: ActivityItem): string => {
    const actor = activity.actorName || 'System';
    const action = formatAction(activity.action);
    const entity = activity.entityName || activity.entityType || '';

    if (activity.actorType === 'system' || activity.actorType === 'automation') {
      return `${action}${entity ? ` - ${entity}` : ''}`;
    }

    return `${actor} ${action.toLowerCase()}${entity ? ` ${entity}` : ''}`;
  };

  const groupActivitiesByDate = (items: ActivityItem[]) => {
    const groups: Record<string, ActivityItem[]> = {};

    items.forEach((item) => {
      const date = format(new Date(item.createdAt), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(item);
    });

    return groups;
  };

  const groupedActivities = groupActivitiesByDate(activities);
  const dateKeys = Object.keys(groupedActivities).sort((a, b) => b.localeCompare(a));

  const formatDateHeader = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
      return 'Today';
    }
    if (format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) {
      return 'Yesterday';
    }
    return format(date, 'EEEE, MMMM d');
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
            <Activity className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {activities.length > 0 && (
              <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                {data?.meta?.total || activities.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showFilters && (
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="input py-1.5 text-sm"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => refetch()}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-medium">No activity yet</p>
            <p className="text-sm">Actions and events will appear here</p>
          </div>
        ) : (
          <div className="space-y-6">
            {dateKeys.map((dateKey) => (
              <div key={dateKey}>
                {/* Date Header */}
                <div className="sticky top-0 bg-white z-10 pb-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {formatDateHeader(dateKey)}
                  </h4>
                </div>

                {/* Activities for this date */}
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="space-y-1"
                >
                  {groupedActivities[dateKey].map((activity, idx) => {
                    const Icon = getActionIcon(activity);
                    const config = getCategoryConfig(activity.category);
                    const isLast = idx === groupedActivities[dateKey].length - 1;

                    return (
                      <motion.div
                        key={activity.id}
                        variants={staggerItem}
                        className="relative"
                      >
                        {/* Timeline line */}
                        {!isLast && (
                          <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-gray-100" />
                        )}

                        <div
                          className={clsx(
                            'flex gap-3 p-2 rounded-lg transition-colors hover:bg-gray-50 border border-transparent',
                            SEVERITY_COLORS[activity.severity]
                          )}
                        >
                          {/* Icon */}
                          <div
                            className={clsx(
                              'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                              config.bgColor
                            )}
                          >
                            <Icon className={clsx('w-4 h-4', config.color)} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900">
                              {getActivityDescription(activity)}
                            </p>

                            {/* Metadata */}
                            {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-2">
                                {Object.entries(activity.metadata).map(([key, value]) => (
                                  <span
                                    key={key}
                                    className="inline-flex items-center text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded"
                                  >
                                    <span className="font-medium capitalize">{key}:</span>
                                    <span className="ml-1">{String(value)}</span>
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Changes */}
                            {activity.changes && Object.keys(activity.changes).length > 0 && (
                              <div className="mt-2 text-xs text-gray-500">
                                <span className="font-medium">Changes:</span>
                                <div className="mt-1 space-y-1">
                                  {Object.entries(activity.changes).map(([field, change]) => {
                                    const changeObj = change as { from?: unknown; to?: unknown };
                                    return (
                                      <div key={field} className="flex items-center gap-1">
                                        <span className="capitalize">{field}:</span>
                                        <span className="text-gray-400">{String(changeObj.from || 'null')}</span>
                                        <ArrowRight className="w-3 h-3 text-gray-400" />
                                        <span className="text-gray-700">{String(changeObj.to || 'null')}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Timestamp */}
                            <p className="text-xs text-gray-400 mt-1">
                              {formatDistanceToNow(new Date(activity.createdAt), {
                                addSuffix: true,
                              })}
                            </p>
                          </div>

                          {/* Actor badge */}
                          {activity.actorRole && (
                            <span className="flex-shrink-0 text-xs text-gray-400 capitalize">
                              {activity.actorRole.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default ActivityFeed;
