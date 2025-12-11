import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Clock, CheckCircle, XCircle, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { portalApi } from '@/api/client';
import { formatDistanceToNow } from 'date-fns';

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
}

interface Order {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'fulfilled';
  items: OrderItem[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

interface OrdersResponse {
  data: Order[];
  meta: {
    total: number;
    statusCounts: Record<string, number>;
  };
}

export default function Orders() {
  const { data, isLoading } = useQuery({
    queryKey: ['portal', 'orders'],
    queryFn: () => portalApi.get<OrdersResponse>('/orders'),
  });

  const orders = data?.data || [];
  const statusCounts = data?.meta?.statusCounts || {};

  const statusConfig = {
    pending: { icon: Clock, color: 'bg-amber-100 text-amber-800', label: 'Pending Review' },
    approved: { icon: CheckCircle, color: 'bg-blue-100 text-blue-800', label: 'Approved' },
    rejected: { icon: XCircle, color: 'bg-red-100 text-red-800', label: 'Rejected' },
    fulfilled: { icon: Package, color: 'bg-green-100 text-green-800', label: 'Fulfilled' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order History</h1>
          <p className="text-gray-500 mt-1">Track your order requests and their status</p>
        </div>
        <Link to="/order/new" className="btn btn-primary">
          <ShoppingCart className="w-4 h-4" />
          New Order Request
        </Link>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(statusConfig).map(([status, config]) => {
          const Icon = config.icon;
          return (
            <div key={status} className="card p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${config.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{config.label}</p>
                  <p className="text-xl font-bold text-gray-900">
                    {statusCounts[status] || 0}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Orders List */}
      <div className="card">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">All Orders</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p>No orders yet</p>
            <Link to="/order/new" className="text-primary-600 hover:text-primary-700 text-sm">
              Create your first order request
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {orders.map((order) => {
              const config = statusConfig[order.status];
              const Icon = config.icon;

              return (
                <div key={order.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                          <Icon className="w-3 h-3" />
                          {config.label}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                        </span>
                      </div>

                      <div className="space-y-1">
                        {order.items.slice(0, 3).map((item, idx) => (
                          <div key={idx} className="text-sm">
                            <span className="font-medium text-gray-900">{item.productName}</span>
                            <span className="text-gray-500"> × {item.quantity}</span>
                          </div>
                        ))}
                        {order.items.length > 3 && (
                          <p className="text-sm text-gray-500">
                            +{order.items.length - 3} more items
                          </p>
                        )}
                      </div>

                      {order.notes && (
                        <p className="text-sm text-gray-500 mt-2 italic">
                          "{order.notes}"
                        </p>
                      )}
                    </div>

                    <div className="text-right text-sm">
                      <p className="font-medium text-gray-900">
                        {order.items.reduce((sum, item) => sum + item.quantity, 0)} items
                      </p>
                      <p className="text-gray-500">
                        Order #{order.id.slice(-6)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
