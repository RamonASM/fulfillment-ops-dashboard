import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart, Clock, AlertTriangle, Check, X, Filter, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/api/client';
import { useState } from 'react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { fadeInUp, staggerContainer, staggerItem } from '@/lib/animations';

interface OrderItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  packSize: number;
  quantityPacks: number;
  quantityUnits: number;
  snapshotMonthlyUsage: number | null;
  snapshotCalculationTier: string | null;
  snapshotStockLevel: number | null;
  snapshotWeeksRemaining: number | null;
}

interface Order {
  id: string;
  status: string;
  statusDisplay: {
    label: string;
    color: string;
    description: string;
  };
  slaStatus: {
    isBreached: boolean;
    hoursRemaining: number | null;
    urgency: 'normal' | 'approaching' | 'breached';
  };
  client: {
    id: string;
    name: string;
    code: string;
  };
  location: {
    id: string;
    name: string;
    code: string;
  } | null;
  requestedBy: {
    id: string;
    name: string;
    email: string;
  };
  itemCount: number;
  totalPacks: number | null;
  totalUnits: number | null;
  estimatedValue: number | null;
  notes: string | null;
  reviewNotes: string | null;
  externalOrderRef: string | null;
  createdAt: string;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  fulfilledAt: string | null;
  items: OrderItem[];
}

interface OrdersResponse {
  data: Order[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    statusCounts: Record<string, number>;
  };
}

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Orders' },
  { value: 'submitted', label: 'Pending Review' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'changes_requested', label: 'Changes Requested' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function Orders() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['orders', { status: statusFilter }],
    queryFn: () =>
      api.get<OrdersResponse>('/orders', {
        params: {
          status: statusFilter || undefined,
          limit: '50',
        },
      }),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (orderId: string) => api.post(`/orders/${orderId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order acknowledged');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to acknowledge order');
    },
  });

  const fulfillMutation = useMutation({
    mutationFn: ({ orderId, externalOrderRef, notes }: { orderId: string; externalOrderRef: string; notes?: string }) =>
      api.post(`/orders/${orderId}/fulfill`, { externalOrderRef, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order marked as fulfilled');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to fulfill order');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      api.post(`/orders/${orderId}/cancel`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order cancelled');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to cancel order');
    },
  });

  const orders = data?.data || [];
  const statusCounts = data?.meta?.statusCounts || {};

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleFulfill = (orderId: string) => {
    const ref = prompt('Enter external order reference (e.g., SO-12345):');
    if (ref) {
      fulfillMutation.mutate({ orderId, externalOrderRef: ref });
    }
  };

  const handleCancel = (orderId: string) => {
    const reason = prompt('Enter cancellation reason:');
    if (reason) {
      cancelMutation.mutate({ orderId, reason });
    }
  };

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
          <h1 className="text-2xl font-bold text-text-primary">Order Requests</h1>
          <p className="text-text-secondary mt-1">
            Review and manage client reorder requests
          </p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-4">
        <Filter className="w-4 h-4 text-gray-400" />
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <FilterButton
              key={option.value}
              label={option.label}
              count={option.value ? statusCounts[option.value] || 0 : Object.values(statusCounts).reduce((a, b) => a + b, 0)}
              isActive={statusFilter === option.value}
              onClick={() => setStatusFilter(option.value)}
            />
          ))}
        </div>
      </div>

      {/* Orders list */}
      <div className="card divide-y divide-border">
        {isLoading ? (
          <div className="p-8 text-center text-text-secondary">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart className="w-12 h-12 mx-auto text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-text-primary">
              No order requests
            </h3>
            <p className="mt-2 text-text-secondary">
              {statusFilter
                ? `No orders with status "${statusFilter}" found`
                : 'No order requests have been submitted yet.'}
            </p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence>
              {orders.map((order) => (
                <OrderItem
                  key={order.id}
                  order={order}
                  isExpanded={expandedOrders.has(order.id)}
                  onToggleExpand={() => toggleExpanded(order.id)}
                  onAcknowledge={() => acknowledgeMutation.mutate(order.id)}
                  onFulfill={() => handleFulfill(order.id)}
                  onCancel={() => handleCancel(order.id)}
                  isPending={
                    acknowledgeMutation.isPending ||
                    fulfillMutation.isPending ||
                    cancelMutation.isPending
                  }
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
  isActive,
  onClick,
}: {
  label: string;
  count: number;
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

function OrderItem({
  order,
  isExpanded,
  onToggleExpand,
  onAcknowledge,
  onFulfill,
  onCancel,
  isPending,
}: {
  order: Order;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAcknowledge: () => void;
  onFulfill: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const statusColors: Record<string, string> = {
    submitted: 'bg-yellow-100 text-yellow-800',
    acknowledged: 'bg-blue-100 text-blue-800',
    changes_requested: 'bg-orange-100 text-orange-800',
    on_hold: 'bg-gray-100 text-gray-800',
    fulfilled: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const slaUrgencyColors: Record<string, string> = {
    normal: '',
    approaching: 'bg-yellow-50 border-l-yellow-500',
    breached: 'bg-red-50 border-l-red-500',
  };

  return (
    <motion.div
      variants={staggerItem}
      className={clsx(
        'border-l-4 transition-colors',
        order.slaStatus.urgency !== 'normal'
          ? slaUrgencyColors[order.slaStatus.urgency]
          : 'border-l-transparent'
      )}
    >
      {/* Main row */}
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Expand toggle */}
          <button
            onClick={onToggleExpand}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded mt-1"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {/* Order info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-gray-900">{order.client.name}</h3>
                  <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', statusColors[order.status])}>
                    {order.statusDisplay.label}
                  </span>
                  {order.slaStatus.isBreached && (
                    <span className="flex items-center gap-1 text-xs text-red-600">
                      <AlertTriangle className="w-3 h-3" />
                      SLA Breached
                    </span>
                  )}
                  {order.slaStatus.urgency === 'approaching' && (
                    <span className="flex items-center gap-1 text-xs text-yellow-600">
                      <Clock className="w-3 h-3" />
                      SLA in {order.slaStatus.hoursRemaining}h
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {order.itemCount} items, {order.totalPacks || 0} packs
                  {order.location && ` - ${order.location.name}`}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {order.status === 'submitted' && (
                  <button
                    onClick={onAcknowledge}
                    disabled={isPending}
                    className="btn-primary text-sm"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Acknowledge
                  </button>
                )}
                {(order.status === 'acknowledged' || order.status === 'on_hold') && (
                  <button
                    onClick={onFulfill}
                    disabled={isPending}
                    className="btn-primary text-sm"
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Mark Fulfilled
                  </button>
                )}
                {!['fulfilled', 'cancelled'].includes(order.status) && (
                  <button
                    onClick={onCancel}
                    disabled={isPending}
                    className="btn-secondary text-sm text-red-600 hover:bg-red-50"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span>Requested by: {order.requestedBy.name}</span>
              {order.submittedAt && (
                <span>
                  Submitted:{' '}
                  {new Date(order.submittedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              )}
              {order.externalOrderRef && (
                <span className="font-mono">Ref: {order.externalOrderRef}</span>
              )}
            </div>

            {order.notes && (
              <p className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                <strong>Notes:</strong> {order.notes}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Expanded items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 ml-10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 font-medium">Product</th>
                    <th className="py-2 font-medium text-right">Qty (Packs)</th>
                    <th className="py-2 font-medium text-right">Qty (Units)</th>
                    <th className="py-2 font-medium text-right">Monthly Usage</th>
                    <th className="py-2 font-medium text-right">Stock at Order</th>
                    <th className="py-2 font-medium text-right">Weeks Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2">
                        <div className="font-medium text-gray-900">{item.productName}</div>
                        <div className="text-xs text-gray-500 font-mono">{item.productCode}</div>
                      </td>
                      <td className="py-2 text-right">{item.quantityPacks}</td>
                      <td className="py-2 text-right">{item.quantityUnits}</td>
                      <td className="py-2 text-right">
                        {item.snapshotMonthlyUsage != null ? (
                          <span>
                            {item.snapshotMonthlyUsage.toFixed(1)}
                            {item.snapshotCalculationTier && (
                              <span className="text-xs text-gray-400 ml-1">
                                ({item.snapshotCalculationTier.replace('_', '-')})
                              </span>
                            )}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {item.snapshotStockLevel != null ? item.snapshotStockLevel : '-'}
                      </td>
                      <td className="py-2 text-right">
                        {item.snapshotWeeksRemaining != null ? (
                          <span
                            className={clsx(
                              item.snapshotWeeksRemaining <= 2 && 'text-red-600 font-medium',
                              item.snapshotWeeksRemaining <= 4 && item.snapshotWeeksRemaining > 2 && 'text-yellow-600'
                            )}
                          >
                            {item.snapshotWeeksRemaining.toFixed(1)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
