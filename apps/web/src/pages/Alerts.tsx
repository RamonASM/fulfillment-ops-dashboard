import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, X, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/api/client';
import type { AlertWithProduct } from '@inventory/shared';
import { SEVERITY_COLORS } from '@inventory/shared';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { fadeInUp, staggerContainer, staggerItem } from '@/lib/animations';

export default function Alerts() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSeverity = searchParams.get('severity');
  const [severityFilter, setSeverityFilter] = useState<string | null>(initialSeverity);

  // Update URL when filter changes
  useEffect(() => {
    if (severityFilter) {
      setSearchParams({ severity: severityFilter });
    } else {
      setSearchParams({});
    }
  }, [severityFilter, setSearchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', { severity: severityFilter }],
    queryFn: () =>
      api.get<{
        data: AlertWithProduct[];
        meta: { severityCounts: Record<string, number> };
      }>('/alerts', {
        params: {
          severity: severityFilter || undefined,
        },
      }),
  });

  const dismissMutation = useMutation({
    mutationFn: (alertId: string) => api.patch(`/alerts/${alertId}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alert dismissed');
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post('/alerts/mark-all-read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('All alerts marked as read');
    },
  });

  const alerts = data?.data || [];
  const severityCounts = data?.meta?.severityCounts || {};

  return (
    <motion.div
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Alerts</h1>
          <p className="text-text-secondary mt-1">
            Monitor and manage inventory alerts across all clients
          </p>
        </div>
        <button
          onClick={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending}
          className="btn-secondary"
        >
          <Check className="w-4 h-4 mr-2" />
          Mark all as read
        </button>
      </div>

      {/* Severity filter */}
      <div className="flex items-center gap-4">
        <Filter className="w-4 h-4 text-gray-400" />
        <div className="flex gap-2">
          <FilterButton
            label="All"
            count={Object.values(severityCounts).reduce((a, b) => a + b, 0)}
            isActive={!severityFilter}
            onClick={() => setSeverityFilter(null)}
          />
          <FilterButton
            label="Critical"
            count={severityCounts.critical || 0}
            color={SEVERITY_COLORS.critical}
            isActive={severityFilter === 'critical'}
            onClick={() => setSeverityFilter('critical')}
          />
          <FilterButton
            label="Warning"
            count={severityCounts.warning || 0}
            color={SEVERITY_COLORS.warning}
            isActive={severityFilter === 'warning'}
            onClick={() => setSeverityFilter('warning')}
          />
          <FilterButton
            label="Info"
            count={severityCounts.info || 0}
            color={SEVERITY_COLORS.info}
            isActive={severityFilter === 'info'}
            onClick={() => setSeverityFilter('info')}
          />
        </div>
      </div>

      {/* Alerts list */}
      <div className="card divide-y divide-border">
        {isLoading ? (
          <div className="p-8 text-center text-text-secondary">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="w-12 h-12 mx-auto text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-text-primary">
              No alerts
            </h3>
            <p className="mt-2 text-text-secondary">
              {severityFilter
                ? `No ${severityFilter} alerts found`
                : 'All caught up! No alerts requiring attention.'}
            </p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence>
              {alerts.map((alert) => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  onDismiss={() => dismissMutation.mutate(alert.id)}
                  dismissing={dismissMutation.isPending}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function FilterButton({
  label,
  count,
  color,
  isActive,
  onClick,
}: {
  label: string;
  count: number;
  color?: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-gray-900 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      )}
    >
      {color && (
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
      <span
        className={clsx(
          'px-1.5 py-0.5 rounded text-xs',
          isActive ? 'bg-white/20' : 'bg-gray-200'
        )}
      >
        {count}
      </span>
    </button>
  );
}

function AlertItem({
  alert,
  onDismiss,
  dismissing,
}: {
  alert: AlertWithProduct;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  const severityConfig = {
    critical: {
      bg: 'bg-red-50',
      border: 'border-l-red-500',
      icon: 'bg-red-500',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-l-amber-500',
      icon: 'bg-amber-500',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-l-blue-500',
      icon: 'bg-blue-500',
    },
  };

  const config = severityConfig[alert.severity as keyof typeof severityConfig];

  return (
    <motion.div
      variants={staggerItem}
      exit={{ opacity: 0, x: -20 }}
      className={clsx(
        'p-4 border-l-4 transition-colors',
        config.border,
        !alert.isRead && config.bg
      )}
    >
      <div className="flex items-start gap-4">
        <div className={clsx('w-2 h-2 mt-2 rounded-full', config.icon)} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-medium text-gray-900">{alert.title}</h3>
              {alert.message && (
                <p className="text-sm text-gray-500 mt-1">{alert.message}</p>
              )}
            </div>

            <button
              onClick={onDismiss}
              disabled={dismissing}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            {alert.client && <span>{alert.client.name}</span>}
            {alert.product && (
              <span className="font-mono">{alert.product.productId}</span>
            )}
            <span>
              {new Date(alert.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
