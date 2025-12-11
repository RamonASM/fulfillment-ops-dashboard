import { useQuery } from '@tanstack/react-query';
import { Package, AlertTriangle, TrendingDown, Clock, ArrowRight, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { portalApi } from '@/api/client';

interface DashboardStats {
  totalProducts: number;
  lowStockCount: number;
  criticalCount: number;
  pendingOrders: number;
  recentAlerts: Array<{
    id: string;
    title: string;
    severity: string;
    createdAt: string;
  }>;
  lowStockProducts: Array<{
    id: string;
    productId: string;
    name: string;
    currentStock: number;
    status: string;
    weeksRemaining: number;
  }>;
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['portal', 'dashboard'],
    queryFn: () => portalApi.get<DashboardStats>('/dashboard'),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Your inventory at a glance</p>
        </div>
        <Link
          to="/order/new"
          className="btn btn-primary"
        >
          <ShoppingCart className="w-4 h-4" />
          Request Reorder
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Products"
          value={stats?.totalProducts || 0}
          icon={Package}
          color="emerald"
          loading={isLoading}
        />
        <StatCard
          title="Low Stock Items"
          value={stats?.lowStockCount || 0}
          icon={TrendingDown}
          color="amber"
          loading={isLoading}
        />
        <StatCard
          title="Critical Alerts"
          value={stats?.criticalCount || 0}
          icon={AlertTriangle}
          color="red"
          loading={isLoading}
        />
        <StatCard
          title="Pending Orders"
          value={stats?.pendingOrders || 0}
          icon={Clock}
          color="blue"
          loading={isLoading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alert */}
        <div className="card">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Items Needing Attention</h2>
            <Link
              to="/products?status=low"
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="divide-y divide-gray-100">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : !stats?.lowStockProducts?.length ? (
              <div className="p-8 text-center text-gray-500">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p>All products are well stocked!</p>
              </div>
            ) : (
              stats.lowStockProducts.slice(0, 5).map((product) => (
                <div key={product.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.productId}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{product.currentStock} units</p>
                      <span className={`badge badge-${product.status === 'critical' ? 'critical' : 'warning'}`}>
                        {product.weeksRemaining}w remaining
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="card">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Alerts</h2>
            <Link
              to="/alerts"
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="divide-y divide-gray-100">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : !stats?.recentAlerts?.length ? (
              <div className="p-8 text-center text-gray-500">
                <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p>No recent alerts</p>
              </div>
            ) : (
              stats.recentAlerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 mt-2 rounded-full ${
                      alert.severity === 'critical' ? 'bg-red-500' :
                      alert.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{alert.title}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(alert.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to="/order/new"
            className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <div className="p-2 bg-emerald-600 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Request Reorder</p>
              <p className="text-sm text-gray-500">Submit a new order request</p>
            </div>
          </Link>

          <Link
            to="/products"
            className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <div className="p-2 bg-blue-600 rounded-lg">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Browse Products</p>
              <p className="text-sm text-gray-500">View your full catalog</p>
            </div>
          </Link>

          <Link
            to="/orders"
            className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <div className="p-2 bg-purple-600 rounded-lg">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Order History</p>
              <p className="text-sm text-gray-500">Track past orders</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: 'emerald' | 'amber' | 'red' | 'blue';
  loading?: boolean;
}) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          {loading ? (
            <div className="h-7 w-12 bg-gray-200 animate-pulse rounded mt-1" />
          ) : (
            <p className="text-xl font-bold text-gray-900">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}
