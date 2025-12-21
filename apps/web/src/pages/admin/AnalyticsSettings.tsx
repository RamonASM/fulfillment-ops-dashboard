import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ToggleRight,
  RefreshCw,
  Server,
  Users,
  Zap,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface ServiceStatus {
  service: {
    healthy: boolean;
    url: string;
    stats: {
      total_products: number;
      products_with_usage: number;
      avg_confidence_score: number;
    } | null;
  };
  rollout: {
    totalClients: number;
    enabled: number;
    disabled: number;
    notConfigured: number;
    percentEnabled: number;
  };
}

interface ClientAnalyticsStatus {
  clientId: string;
  clientName: string;
  clientCode: string;
  dsAnalyticsEnabled: boolean;
  productCount: number;
  calculatedProducts: number;
}

export default function AnalyticsSettings() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [showConfirmModal, setShowConfirmModal] = useState<'enable-all' | 'disable-all' | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'operations_manager';

  // Fetch service status
  const { data: status, isLoading: loadingStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['ds-analytics-status'],
    queryFn: () => api.get<ServiceStatus>('/admin/ds-analytics/status'),
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: isAdmin,
  });

  // Fetch clients list
  const { data: clients, isLoading: loadingClients, refetch: refetchClients } = useQuery({
    queryKey: ['ds-analytics-clients'],
    queryFn: () => api.get<{ data: ClientAnalyticsStatus[] }>('/admin/ds-analytics/clients'),
    enabled: isAdmin,
  });

  // Enable mutation
  const enableMutation = useMutation({
    mutationFn: (clientId: string) =>
      api.patch(`/admin/ds-analytics/clients/${clientId}/enable`),
    onSuccess: (_, clientId) => {
      queryClient.invalidateQueries({ queryKey: ['ds-analytics-clients'] });
      queryClient.invalidateQueries({ queryKey: ['ds-analytics-status'] });
      const client = clients?.data?.find((c) => c.clientId === clientId);
      toast.success(`DS Analytics enabled for ${client?.clientName || 'client'}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to enable DS Analytics');
    },
  });

  // Disable mutation
  const disableMutation = useMutation({
    mutationFn: (clientId: string) =>
      api.patch(`/admin/ds-analytics/clients/${clientId}/disable`),
    onSuccess: (_, clientId) => {
      queryClient.invalidateQueries({ queryKey: ['ds-analytics-clients'] });
      queryClient.invalidateQueries({ queryKey: ['ds-analytics-status'] });
      const client = clients?.data?.find((c) => c.clientId === clientId);
      toast.success(`DS Analytics disabled for ${client?.clientName || 'client'}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disable DS Analytics');
    },
  });

  // Enable all mutation
  const enableAllMutation = useMutation({
    mutationFn: () => api.post('/admin/ds-analytics/enable-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ds-analytics-clients'] });
      queryClient.invalidateQueries({ queryKey: ['ds-analytics-status'] });
      toast.success('DS Analytics enabled for all clients');
      setShowConfirmModal(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to enable DS Analytics for all');
    },
  });

  // Disable all mutation (emergency rollback)
  const disableAllMutation = useMutation({
    mutationFn: () => api.post('/admin/ds-analytics/disable-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ds-analytics-clients'] });
      queryClient.invalidateQueries({ queryKey: ['ds-analytics-status'] });
      toast.success('DS Analytics disabled for all clients (emergency rollback)');
      setShowConfirmModal(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disable DS Analytics');
    },
  });

  const handleToggle = (clientId: string, currentlyEnabled: boolean) => {
    if (currentlyEnabled) {
      disableMutation.mutate(clientId);
    } else {
      enableMutation.mutate(clientId);
    }
  };

  const handleRefresh = () => {
    refetchStatus();
    refetchClients();
    toast.success('Refreshed analytics status');
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-500 mt-1">
            You need admin or operations manager privileges to access this page.
          </p>
        </div>
      </div>
    );
  }

  const serviceHealthy = status?.service?.healthy ?? false;
  const rollout = status?.rollout;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Engine Settings</h1>
          <p className="text-gray-500 mt-1">
            Manage DS Analytics service rollout and feature flags
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="btn-secondary"
          disabled={loadingStatus || loadingClients}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${(loadingStatus || loadingClients) ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Service Health Banner */}
      <div
        className={`rounded-lg p-4 border ${
          serviceHealthy
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}
      >
        <div className="flex items-center gap-3">
          {loadingStatus ? (
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          ) : serviceHealthy ? (
            <CheckCircle2 className="w-6 h-6 text-green-500" />
          ) : (
            <XCircle className="w-6 h-6 text-red-500" />
          )}
          <div>
            <h3 className={`font-semibold ${serviceHealthy ? 'text-green-800' : 'text-red-800'}`}>
              DS Analytics Service: {serviceHealthy ? 'Healthy' : 'Unavailable'}
            </h3>
            <p className={`text-sm ${serviceHealthy ? 'text-green-600' : 'text-red-600'}`}>
              {status?.service?.url || 'http://localhost:8000'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Clients</p>
              <p className="text-xl font-semibold text-gray-900">
                {loadingStatus ? '-' : rollout?.totalClients ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Zap className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">DS Analytics Enabled</p>
              <p className="text-xl font-semibold text-gray-900">
                {loadingStatus ? '-' : rollout?.enabled ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Server className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Using Legacy</p>
              <p className="text-xl font-semibold text-gray-900">
                {loadingStatus ? '-' : rollout?.disabled ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Rollout %</p>
              <p className="text-xl font-semibold text-gray-900">
                {loadingStatus ? '-' : `${rollout?.percentEnabled ?? 0}%`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Batch Actions */}
      <div className="card">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-gray-900">Batch Operations</h2>
          <p className="text-sm text-gray-500 mt-1">
            Enable or disable DS Analytics for all clients at once
          </p>
        </div>
        <div className="p-4 flex gap-3">
          <button
            onClick={() => setShowConfirmModal('enable-all')}
            disabled={!serviceHealthy || enableAllMutation.isPending}
            className="btn-primary"
          >
            {enableAllMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ToggleRight className="w-4 h-4 mr-2" />
            )}
            Enable All Clients
          </button>
          <button
            onClick={() => setShowConfirmModal('disable-all')}
            disabled={disableAllMutation.isPending}
            className="btn-secondary text-red-600 hover:bg-red-50"
          >
            {disableAllMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <AlertTriangle className="w-4 h-4 mr-2" />
            )}
            Emergency Rollback
          </button>
        </div>
      </div>

      {/* Clients Table */}
      <div className="card">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-gray-900">Client Analytics Status</h2>
          <p className="text-sm text-gray-500 mt-1">
            Toggle DS Analytics per client
          </p>
        </div>
        <div className="overflow-x-auto">
          {loadingClients ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Products
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Calculated
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    DS Analytics
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {clients?.data?.map((client) => (
                  <tr key={client.clientId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-gray-900">
                        {client.clientName}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-gray-500 text-sm">
                        {client.clientCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-gray-900">
                        {client.productCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={client.calculatedProducts > 0 ? 'text-green-600' : 'text-gray-400'}>
                        {client.calculatedProducts}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          client.dsAnalyticsEnabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {client.dsAnalyticsEnabled ? 'Advanced' : 'Legacy'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleToggle(client.clientId, client.dsAnalyticsEnabled)}
                        disabled={
                          enableMutation.isPending ||
                          disableMutation.isPending ||
                          (!serviceHealthy && !client.dsAnalyticsEnabled)
                        }
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                          client.dsAnalyticsEnabled ? 'bg-primary-600' : 'bg-gray-200'
                        } ${
                          (!serviceHealthy && !client.dsAnalyticsEnabled)
                            ? 'opacity-50 cursor-not-allowed'
                            : ''
                        }`}
                        role="switch"
                        aria-checked={client.dsAnalyticsEnabled}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            client.dsAnalyticsEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
                {(!clients?.data || clients.data.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No clients found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowConfirmModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                {showConfirmModal === 'enable-all' ? (
                  <div className="p-2 bg-green-100 rounded-full">
                    <Zap className="w-6 h-6 text-green-600" />
                  </div>
                ) : (
                  <div className="p-2 bg-red-100 rounded-full">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                )}
                <h2 className="text-lg font-semibold text-gray-900">
                  {showConfirmModal === 'enable-all'
                    ? 'Enable DS Analytics for All?'
                    : 'Emergency Rollback?'}
                </h2>
              </div>

              <p className="text-gray-600 mb-6">
                {showConfirmModal === 'enable-all'
                  ? `This will enable the advanced DS Analytics engine for all ${rollout?.totalClients || 0} clients. Products will be calculated using the Python data science service.`
                  : `This will immediately disable DS Analytics for all clients and fall back to the legacy TypeScript calculations. Use this only in case of service issues.`}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(null)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    showConfirmModal === 'enable-all'
                      ? enableAllMutation.mutate()
                      : disableAllMutation.mutate()
                  }
                  disabled={enableAllMutation.isPending || disableAllMutation.isPending}
                  className={`flex-1 ${
                    showConfirmModal === 'enable-all'
                      ? 'btn-primary'
                      : 'btn-primary bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {(enableAllMutation.isPending || disableAllMutation.isPending) ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : showConfirmModal === 'enable-all' ? (
                    'Enable All'
                  ) : (
                    'Disable All'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
