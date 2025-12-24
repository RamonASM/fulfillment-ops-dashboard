import { useQuery } from '@tanstack/react-query';
import { Bell, AlertTriangle, TrendingDown, Package } from 'lucide-react';
import { portalApi } from '@/api/client';
import { formatDistanceToNow } from 'date-fns';

interface Alert {
  id: string;
  alertType: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message?: string;
  productId?: string;
  productName?: string;
  isRead: boolean;
  createdAt: string;
}

interface AlertsResponse {
  data: Alert[];
  meta: {
    total: number;
    unreadCount: number;
  };
}

export default function Alerts() {
  const { data, isLoading } = useQuery({
    queryKey: ['portal', 'alerts'],
    queryFn: () => portalApi.get<AlertsResponse>('/alerts'),
  });

  const alerts = data?.data || [];
  const unreadCount = data?.meta?.unreadCount || 0;

  const alertConfig = {
    stockout: { icon: Package, color: 'text-red-600 bg-red-100' },
    critical_stock: { icon: AlertTriangle, color: 'text-red-600 bg-red-100' },
    low_stock: { icon: TrendingDown, color: 'text-amber-600 bg-amber-100' },
    usage_spike: { icon: TrendingDown, color: 'text-blue-600 bg-blue-100' },
    reorder_due: { icon: Bell, color: 'text-blue-600 bg-blue-100' },
    no_movement: { icon: Package, color: 'text-gray-600 bg-gray-100' },
  };

  const severityColors = {
    critical: 'border-l-red-500 bg-red-50',
    warning: 'border-l-amber-500 bg-amber-50',
    info: 'border-l-blue-500 bg-blue-50',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-500 mt-1">
            Stay informed about your inventory status
          </p>
        </div>
        {unreadCount > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
            <Bell className="w-4 h-4" />
            {unreadCount} unread
          </span>
        )}
      </div>

      {/* Alerts List */}
      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p>No alerts at this time</p>
            <p className="text-sm">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {alerts.map((alert) => {
              const config = alertConfig[alert.alertType as keyof typeof alertConfig] || {
                icon: Bell,
                color: 'text-gray-600 bg-gray-100',
              };
              const Icon = config.icon;

              return (
                <div
                  key={alert.id}
                  className={`p-4 border-l-4 ${severityColors[alert.severity]} ${
                    !alert.isRead ? 'bg-opacity-100' : 'bg-opacity-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className={`font-medium ${!alert.isRead ? 'text-gray-900' : 'text-gray-600'}`}>
                          {alert.title}
                        </h3>
                        {!alert.isRead && (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 bg-blue-500 rounded-full" aria-hidden="true" />
                            <span className="text-xs text-blue-600 font-medium">New</span>
                          </span>
                        )}
                      </div>
                      {alert.message && (
                        <p className="text-sm text-gray-500 mt-1">{alert.message}</p>
                      )}
                      {alert.productName && (
                        <p className="text-sm text-gray-400 mt-1">
                          Product: {alert.productName}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
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
