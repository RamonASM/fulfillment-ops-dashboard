import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Package,
  TrendingUp,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/api/client";
import type { ClientWithStats, AlertWithProduct } from "@inventory/shared";
import { STATUS_COLORS } from "@inventory/shared";
import { RiskDashboard } from "@/components/ai/RiskDashboard";
import { MLInsightsSummaryWidget } from "@/components/widgets/MLInsightsSummaryWidget";
import { SystemHealthWidget } from "@/components/widgets/SystemHealthWidget";
import { staggerContainer, staggerItem, fadeInUp } from "@/lib/animations";

export default function Dashboard() {
  // Fetch clients with stats
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.get<{ data: ClientWithStats[] }>("/clients"),
  });

  // Fetch alerts
  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ["alerts", { unreadOnly: true }],
    queryFn: () =>
      api.get<{
        data: AlertWithProduct[];
        meta: { severityCounts: Record<string, number> };
      }>("/alerts", { params: { unreadOnly: "true", limit: 10 } }),
  });

  const clients = clientsData?.data || [];
  const alerts = alertsData?.data || [];
  const severityCounts = alertsData?.meta?.severityCounts || {};

  // Calculate totals
  const totals = clients.reduce(
    (acc, client) => ({
      products: acc.products + (client.stats?.totalProducts || 0),
      critical:
        acc.critical +
        (client.stats?.criticalCount || 0) +
        (client.stats?.stockoutCount || 0),
      low: acc.low + (client.stats?.lowCount || 0),
      healthy: acc.healthy + (client.stats?.healthyCount || 0),
    }),
    { products: 0, critical: 0, low: 0, healthy: 0 },
  );

  return (
    <motion.div
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-text-secondary mt-1">
          Overview of all client inventory status
        </p>
      </div>

      {/* Stats cards */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <StatCard
          title="Total Products"
          value={totals.products}
          icon={Package}
          color="blue"
          loading={clientsLoading}
          href="/clients"
        />
        <StatCard
          title="Critical Alerts"
          value={totals.critical}
          icon={AlertTriangle}
          color="red"
          loading={clientsLoading}
          href="/alerts?severity=critical"
        />
        <StatCard
          title="Low Stock Items"
          value={totals.low}
          icon={TrendingUp}
          color="amber"
          loading={clientsLoading}
          href="/alerts?severity=medium"
        />
        <StatCard
          title="Healthy Items"
          value={totals.healthy}
          icon={Clock}
          color="green"
          loading={clientsLoading}
        />
      </motion.div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Alerts Requiring Attention
              </h2>
              <Link
                to="/alerts"
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                View all
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Alert summary badges */}
            <div className="p-4 border-b border-border flex gap-4">
              <AlertBadge
                label="Critical"
                count={severityCounts.critical || 0}
                color="red"
                href="/alerts?severity=critical"
              />
              <AlertBadge
                label="Warning"
                count={severityCounts.warning || 0}
                color="amber"
                href="/alerts?severity=warning"
              />
              <AlertBadge
                label="Info"
                count={severityCounts.info || 0}
                color="blue"
                href="/alerts?severity=info"
              />
            </div>

            {/* Alert list */}
            <div className="divide-y divide-gray-100">
              {alertsLoading ? (
                <div className="p-8 text-center text-gray-500">
                  Loading alerts...
                </div>
              ) : alerts.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No alerts requiring attention
                </div>
              ) : (
                alerts
                  .slice(0, 5)
                  .map((alert) => <AlertRow key={alert.id} alert={alert} />)
              )}
            </div>
          </div>

          {/* Risk Dashboard */}
          <RiskDashboard />

          {/* ML Analytics Summary */}
          <MLInsightsSummaryWidget />
        </div>

        {/* System Health Widget */}
        <SystemHealthWidget compact className="mb-6" />

        {/* Clients overview */}
        <div className="card">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Clients Overview</h2>
            <Link
              to="/clients"
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="divide-y divide-gray-100">
            {clientsLoading ? (
              <div className="p-8 text-center text-gray-500">
                Loading clients...
              </div>
            ) : clients.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No clients found
              </div>
            ) : (
              clients.map((client) => (
                <ClientRow key={client.id} client={client} />
              ))
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Helper components
function StatCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
  href,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: "blue" | "red" | "amber" | "green";
  loading?: boolean;
  href?: string;
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-green-50 text-green-600",
  };

  const content = (
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        {loading ? (
          <div className="h-7 w-16 skeleton mt-1" />
        ) : (
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        )}
      </div>
      {href && (
        <ArrowRight className="w-4 h-4 text-gray-400 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );

  if (href) {
    return (
      <motion.div variants={staggerItem}>
        <Link
          to={href}
          className="card card-hover p-4 group cursor-pointer hover:border-primary-200 block"
        >
          {content}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div variants={staggerItem} className="card p-4">
      {content}
    </motion.div>
  );
}

function AlertBadge({
  label,
  count,
  color,
  href,
}: {
  label: string;
  count: number;
  color: "red" | "amber" | "blue";
  href?: string;
}) {
  const colorClasses = {
    red: "bg-red-100 text-red-800 border-red-200 hover:bg-red-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200",
    blue: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200",
  };

  const content = (
    <>
      <span className="text-lg font-bold">{count}</span>
      <span className="text-sm">{label}</span>
    </>
  );

  if (href && count > 0) {
    return (
      <Link
        to={href}
        className={`px-3 py-2 rounded-lg border ${colorClasses[color]} flex items-center gap-2 transition-colors cursor-pointer`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={`px-3 py-2 rounded-lg border ${colorClasses[color]} flex items-center gap-2`}
    >
      {content}
    </div>
  );
}

function AlertRow({ alert }: { alert: AlertWithProduct }) {
  const severityColors = {
    critical: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-blue-500",
  };

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        <div
          className={`w-2 h-2 mt-2 rounded-full ${
            severityColors[alert.severity as keyof typeof severityColors]
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{alert.title}</p>
          <p className="text-sm text-gray-500 truncate">
            {alert.product?.productId} - {alert.client?.name}
          </p>
        </div>
      </div>
    </div>
  );
}

function ClientRow({ client }: { client: ClientWithStats }) {
  const stats = client.stats;
  const total = stats?.totalProducts || 0;
  const critical = (stats?.criticalCount || 0) + (stats?.stockoutCount || 0);
  const low = stats?.lowCount || 0;
  const healthy = stats?.healthyCount || 0;

  return (
    <Link
      to={`/clients/${client.id}`}
      className="block p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-900">{client.name}</span>
        <span className="text-sm text-gray-500">{total} products</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
        {critical > 0 && (
          <div
            className="h-full"
            style={{
              width: `${(critical / total) * 100}%`,
              backgroundColor: STATUS_COLORS.critical,
            }}
          />
        )}
        {low > 0 && (
          <div
            className="h-full"
            style={{
              width: `${(low / total) * 100}%`,
              backgroundColor: STATUS_COLORS.low,
            }}
          />
        )}
        {healthy > 0 && (
          <div
            className="h-full"
            style={{
              width: `${(healthy / total) * 100}%`,
              backgroundColor: STATUS_COLORS.healthy,
            }}
          />
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        {critical > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-critical" />
            {critical} critical
          </span>
        )}
        {low > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-warning" />
            {low} low
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-healthy" />
          {healthy} healthy
        </span>
      </div>
    </Link>
  );
}
