import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ChevronLeft, Upload, Download, Settings, Package, MapPin, MessageSquare, Activity, CheckSquare, ShoppingCart, X, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/api/client';
import type { ClientWithStats, ProductWithMetrics } from '@inventory/shared';
import { STATUS_COLORS, STATUS_ICONS } from '@inventory/shared';
import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { UsageTierBadge } from '@/components/ui';
import { fadeInUp } from '@/lib/animations';
import { CommentThread } from '@/components/CommentThread';
import { ActivityFeed } from '@/components/ActivityFeed';
import { TodoList } from '@/components/TodoList';
import { ImportModal } from '@/components/ImportModal';
import toast from 'react-hot-toast';

type ItemTypeTab = 'evergreen' | 'event' | 'completed';
type SectionTab = 'products' | 'comments' | 'activity' | 'tasks';

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<ItemTypeTab>('evergreen');
  const [sectionTab, setSectionTab] = useState<SectionTab>('products');
  const [search, setSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Detect ?import=true query param and open modal automatically
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('import') === 'true') {
      setShowImportModal(true);
      // Clean up URL after opening modal
      window.history.replaceState({}, '', `/clients/${clientId}`);
    }
  }, [location.search, clientId]);

  // Fetch client
  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => api.get<ClientWithStats>(`/clients/${clientId}`),
    enabled: !!clientId,
  });

  // Fetch products
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', clientId, activeTab, search],
    queryFn: () =>
      api.get<{
        data: ProductWithMetrics[];
        meta: { statusCounts: Record<string, number> };
      }>(`/clients/${clientId}/products`, {
        params: {
          type: activeTab,
          search: search || undefined,
        },
      }),
    enabled: !!clientId,
  });

  const products = productsData?.data || [];
  const statusCounts = productsData?.meta?.statusCounts || {};

  // Update client mutation
  const updateClientMutation = useMutation({
    mutationFn: async (data: { name: string; code: string }) => {
      return api.patch(`/clients/${clientId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client updated successfully');
      setShowSettingsModal(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update client');
    },
  });

  // Delete client mutation
  const deleteClientMutation = useMutation({
    mutationFn: async () => {
      return api.delete(`/clients/${clientId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client deleted successfully');
      navigate('/clients');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete client');
    },
  });

  // Handle import success - invalidate queries to refresh data
  const handleImportSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['products', clientId] });
  };

  // Open settings modal and populate form
  const openSettingsModal = () => {
    if (client) {
      setEditName(client.name);
      setEditCode(client.code);
    }
    setShowSettingsModal(true);
  };

  // Handle update client
  const handleUpdateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editCode.trim()) {
      toast.error('Name and code are required');
      return;
    }
    updateClientMutation.mutate({ name: editName.trim(), code: editCode.trim().toUpperCase() });
  };

  // Handle delete client
  const handleDeleteClient = () => {
    deleteClientMutation.mutate();
  };

  const handleExport = async () => {
    try {
      // Use the products data we already have
      if (!products || products.length === 0) {
        toast.error('No data to export');
        return;
      }

      // Create CSV content
      const headers = ['Product ID', 'Name', 'Status', 'Stock (Packs)', 'Stock (Units)', 'Reorder Point', 'Weeks Remaining'];
      const rows = products.map(p => [
        p.productId,
        p.name,
        p.status.level,
        p.currentStockPacks,
        p.currentStockUnits,
        p.reorderPointPacks,
        p.status.weeksRemaining === 999 ? '' : p.status.weeksRemaining
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${client?.code || 'export'}-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Export downloaded');
    } catch {
      toast.error('Failed to export data');
    }
  };

  if (clientLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-96 w-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium text-gray-900">Client not found</h2>
        <Link to="/clients" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
          Back to clients
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/clients"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <p className="text-gray-500">{client.code}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/clients/${clientId}/locations`}
            className="btn-secondary btn-sm"
          >
            <MapPin className="w-4 h-4 mr-2" />
            Locations
          </Link>
          <button className="btn-secondary btn-sm" onClick={() => setShowImportModal(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </button>
          <button className="btn-secondary btn-sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
          <button className="btn-ghost btn-sm" onClick={openSettingsModal}>
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stock Health Overview */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Stock Health</h2>
        <div className="flex items-center gap-4">
          <StatusPill
            label="Critical"
            count={statusCounts.critical || 0}
            color={STATUS_COLORS.critical}
          />
          <StatusPill
            label="Low"
            count={statusCounts.low || 0}
            color={STATUS_COLORS.low}
          />
          <StatusPill
            label="Watch"
            count={statusCounts.watch || 0}
            color={STATUS_COLORS.watch}
          />
          <StatusPill
            label="Healthy"
            count={statusCounts.healthy || 0}
            color={STATUS_COLORS.healthy}
          />
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setSectionTab('products')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
            sectionTab === 'products'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <Package className="w-4 h-4" />
          Products
        </button>
        <button
          onClick={() => setSectionTab('comments')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
            sectionTab === 'comments'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <MessageSquare className="w-4 h-4" />
          Comments
        </button>
        <button
          onClick={() => setSectionTab('activity')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
            sectionTab === 'activity'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <Activity className="w-4 h-4" />
          Activity
        </button>
        <button
          onClick={() => setSectionTab('tasks')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
            sectionTab === 'tasks'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <CheckSquare className="w-4 h-4" />
          Tasks
        </button>
      </div>

      {/* Section Content */}
      {sectionTab === 'products' && (
        <>
          {/* Tabs and Search */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {(['evergreen', 'event', 'completed'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={clsx(
                    'px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize',
                    activeTab === tab
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="input w-64"
            />
          </div>

          {/* Products Table */}
          <div className="card overflow-hidden">
            {productsLoading ? (
              <div className="p-8 text-center text-gray-500">Loading products...</div>
            ) : products.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-12 h-12 mx-auto text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  No products found
                </h3>
                <p className="mt-2 text-gray-500">
                  {search
                    ? 'Try adjusting your search terms'
                    : `No ${activeTab} products for this client`}
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Product ID</th>
                      <th>Name</th>
                      <th>Stock</th>
                      <th>Usage</th>
                      <th>On Order</th>
                      <th>Weeks Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <ProductRow key={product.id} product={product} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {sectionTab === 'comments' && clientId && (
        <CommentThread
          entityType="client"
          entityId={clientId}
          title="Client Notes & Comments"
        />
      )}

      {sectionTab === 'activity' && clientId && (
        <ActivityFeed
          clientId={clientId}
          title="Client Activity"
          showFilters={true}
          limit={50}
        />
      )}

      {sectionTab === 'tasks' && clientId && (
        <TodoList
          clientId={clientId}
          title="Client Tasks"
          showCreateButton={true}
        />
      )}

      {/* Import Modal */}
      <ImportModal
        clientId={clientId!}
        clientName={client?.name}
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
      />

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowSettingsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Client Settings</h2>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Modal Content */}
              <form onSubmit={handleUpdateClient} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Enter client name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Code
                  </label>
                  <input
                    type="text"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono uppercase"
                    placeholder="e.g., ACME"
                    maxLength={10}
                  />
                </div>

                <div className="flex justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettingsModal(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Client
                  </button>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowSettingsModal(false)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateClientMutation.isPending}
                      className="btn-primary"
                    >
                      {updateClientMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Warning Header */}
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Delete Client?</h2>
                <p className="text-gray-600 mb-2">
                  Are you sure you want to delete <strong>{client?.name}</strong>?
                </p>
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  This action cannot be undone. All products, inventory data, orders, and history associated with this client will be permanently deleted.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 p-4 border-t border-gray-200">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteClient}
                  disabled={deleteClientMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  {deleteClientMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Client
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatusPill({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 rounded-lg"
      style={{ backgroundColor: `${color}15` }}
    >
      <div
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="font-medium" style={{ color }}>
        {count}
      </span>
      <span className="text-gray-600">{label}</span>
    </div>
  );
}

function ProductRow({ product }: { product: ProductWithMetrics }) {
  const status = product.status;
  const stockPercent = status.percentOfReorderPoint;

  return (
    <tr className="cursor-pointer">
      <td>
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: status.color }}
          />
          <span className="text-xs font-medium uppercase text-gray-500">
            {STATUS_ICONS[status.level]} {status.level}
          </span>
        </div>
      </td>
      <td>
        <span className="font-mono text-sm">{product.productId}</span>
      </td>
      <td>
        <span className="font-medium">{product.name}</span>
      </td>
      <td>
        <div>
          <div className="text-sm">
            {product.currentStockPacks} pks ({product.currentStockUnits} units)
          </div>
          <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, stockPercent)}%`,
                backgroundColor: status.color,
              }}
            />
          </div>
        </div>
      </td>
      <td>
        <UsageTierBadge
          tier={(product as any).usageCalculationTier}
          confidence={(product as any).usageConfidence}
          monthlyUsage={(product as any).monthlyUsagePacks}
          showValue={true}
          compact={false}
        />
      </td>
      <td>
        {(product as any).hasOnOrder ? (
          <div className="group relative">
            <div className="flex items-center gap-1.5 text-blue-600">
              <ShoppingCart className="w-4 h-4" />
              <span className="font-medium text-sm">{(product as any).onOrderPacks} pks</span>
            </div>
            {/* Tooltip on hover showing order details */}
            {(product as any).pendingOrders && (product as any).pendingOrders.length > 0 && (
              <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded-lg py-2 px-3 -top-2 left-1/2 -translate-x-1/2 -translate-y-full w-48 shadow-lg">
                <p className="font-semibold mb-1">
                  {(product as any).pendingOrders.length} pending order{(product as any).pendingOrders.length > 1 ? 's' : ''}
                </p>
                {(product as any).pendingOrders.slice(0, 3).map((order: any) => (
                  <div key={order.orderId} className="flex justify-between text-gray-300">
                    <span className="capitalize">{order.status}</span>
                    <span>{order.quantityPacks} pks</span>
                  </div>
                ))}
                {(product as any).pendingOrders.length > 3 && (
                  <p className="text-gray-400 mt-1">+{(product as any).pendingOrders.length - 3} more...</p>
                )}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-4 border-transparent border-t-gray-900" />
              </div>
            )}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td>
        <span
          className={clsx(
            'font-medium',
            status.weeksRemaining < 2 && 'text-red-600',
            status.weeksRemaining >= 2 && status.weeksRemaining < 4 && 'text-amber-600',
            status.weeksRemaining >= 4 && 'text-gray-900'
          )}
        >
          {status.weeksRemaining === 999 ? '—' : `${status.weeksRemaining}w`}
        </span>
      </td>
    </tr>
  );
}
