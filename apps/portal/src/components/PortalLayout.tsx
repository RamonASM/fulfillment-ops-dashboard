import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
  FileText,
  BarChart3,
  MessageSquare,
} from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePortalAuthStore } from '@/stores/auth.store';
import { portalApi } from '@/api/client';
import { clsx } from 'clsx';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Orders', href: '/orders', icon: ShoppingCart },
  { name: 'Alerts', href: '/alerts', icon: Bell },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Feedback', href: '/feedback', icon: MessageSquare },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function PortalLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = usePortalAuthStore();

  // Fetch unread alert count for the notification badge
  const { data: alertsData } = useQuery({
    queryKey: ['portal', 'alerts', 'unread-count'],
    queryFn: () => portalApi.get<{ data: { unreadCount: number } }>('/alerts/unread-count'),
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });

  const unreadAlertCount = alertsData?.data?.unreadCount || 0;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 bg-emerald-900 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-emerald-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-white font-semibold block text-sm">Client Portal</span>
                <span className="text-emerald-300 text-xs">{user?.clientName}</span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-emerald-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Action */}
          <div className="p-3">
            <button
              onClick={() => {
                navigate('/order/new');
                setSidebarOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Order Request
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === '/'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-emerald-700 text-white'
                      : 'text-emerald-200 hover:bg-emerald-800 hover:text-white'
                  )
                }
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-emerald-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-700 rounded-full flex items-center justify-center">
                <span className="text-white font-medium">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-emerald-300 truncate capitalize">
                  {user?.role || 'Viewer'}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-border">
          <div className="flex items-center justify-between h-full px-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 text-gray-500 hover:text-gray-700"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-semibold text-gray-900 hidden sm:block">
                Welcome, {user?.name?.split(' ')[0]}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Quick reorder button */}
              <button
                onClick={() => navigate('/order/new')}
                className="btn btn-primary btn-sm hidden sm:flex"
              >
                <Plus className="w-4 h-4" />
                New Order
              </button>

              {/* Alerts */}
              <button
                onClick={() => navigate('/alerts')}
                className="relative p-2 text-gray-500 hover:text-gray-700"
                aria-label={`Alerts${unreadAlertCount > 0 ? ` (${unreadAlertCount} unread)` : ''}`}
              >
                <Bell className="w-5 h-5" />
                {unreadAlertCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
