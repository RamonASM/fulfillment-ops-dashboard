import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '@/api/client';
import type { ClientWithStats } from '@inventory/shared';
import { STATUS_COLORS } from '@inventory/shared';
import { useState } from 'react';
import { fadeInUp, staggerContainer, staggerItem } from '@/lib/animations';

export default function Clients() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ data: ClientWithStats[] }>('/clients'),
  });

  const clients = data?.data || [];
  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Clients</h1>
          <p className="text-text-secondary mt-1">
            Manage your client inventory accounts
          </p>
        </div>
        <button className="btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          Add Client
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients..."
          className="input pl-10"
        />
      </div>

      {/* Clients grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6">
              <div className="skeleton h-6 w-32 mb-4" />
              <div className="skeleton h-4 w-24 mb-4" />
              <div className="skeleton h-2 w-full mb-2" />
              <div className="skeleton h-4 w-48" />
            </div>
          ))}
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 className="w-12 h-12 mx-auto text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No clients found
          </h3>
          <p className="mt-2 text-gray-500">
            {search
              ? 'Try adjusting your search terms'
              : 'Get started by adding your first client'}
          </p>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {filteredClients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

function ClientCard({ client }: { client: ClientWithStats }) {
  const stats = client.stats;
  const total = stats?.totalProducts || 0;
  const critical = (stats?.criticalCount || 0) + (stats?.stockoutCount || 0);
  const low = stats?.lowCount || 0;
  const watch = stats?.watchCount || 0;
  const healthy = stats?.healthyCount || 0;

  return (
    <motion.div variants={staggerItem}>
      <Link
        to={`/clients/${client.id}`}
        className="card-interactive p-6 block"
      >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">{client.name}</h3>
          <p className="text-sm text-gray-500">{client.code}</p>
        </div>
        {critical > 0 && (
          <span className="badge-critical">{critical} critical</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex mb-3">
        {critical > 0 && (
          <div
            className="h-full transition-all"
            style={{
              width: `${(critical / total) * 100}%`,
              backgroundColor: STATUS_COLORS.critical,
            }}
          />
        )}
        {low > 0 && (
          <div
            className="h-full transition-all"
            style={{
              width: `${(low / total) * 100}%`,
              backgroundColor: STATUS_COLORS.low,
            }}
          />
        )}
        {watch > 0 && (
          <div
            className="h-full transition-all"
            style={{
              width: `${(watch / total) * 100}%`,
              backgroundColor: STATUS_COLORS.watch,
            }}
          />
        )}
        {healthy > 0 && (
          <div
            className="h-full transition-all"
            style={{
              width: `${(healthy / total) * 100}%`,
              backgroundColor: STATUS_COLORS.healthy,
            }}
          />
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">{total} products</span>
        <div className="flex items-center gap-3">
          {critical > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <span className="status-dot-critical" />
              {critical}
            </span>
          )}
          {low > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <span className="status-dot-warning" />
              {low}
            </span>
          )}
          <span className="flex items-center gap-1 text-green-600">
            <span className="status-dot-healthy" />
            {healthy}
          </span>
        </div>
      </div>

      {/* Alerts indicator */}
      {(stats?.alertCount || 0) > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <span className="text-sm text-amber-600">
            {stats?.alertCount} unread alerts
          </span>
        </div>
      )}
      </Link>
    </motion.div>
  );
}
