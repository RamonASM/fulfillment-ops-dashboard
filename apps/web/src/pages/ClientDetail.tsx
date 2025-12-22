// =============================================================================
// CLIENT DETAIL PAGE
// Main page for viewing and managing a single client
// Refactored to use extracted components for maintainability
// =============================================================================

import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  ChevronLeft,
  Upload,
  Download,
  Settings,
  Package,
  MapPin,
  MessageSquare,
  Activity,
  CheckSquare,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import { api } from "@/api/client";
import type { ClientWithStats, ProductWithMetrics } from "@inventory/shared";
import { STATUS_COLORS } from "@inventory/shared";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { fadeInUp } from "@/lib/animations";
import { CommentThread } from "@/components/CommentThread";
import { ActivityFeed } from "@/components/ActivityFeed";
import { TodoList } from "@/components/TodoList";
import { ImportModal } from "@/components/ImportModal.lazy";
import { CustomDataInsightsWidget } from "@/components/widgets/CustomDataInsightsWidget";
import { ForecastModal } from "@/components/ForecastModal";
import { useAuthStore } from "@/stores/auth.store";
import toast from "react-hot-toast";

// Extracted components
import {
  ClientSettingsModal,
  DeleteConfirmModal,
  ProductTable,
  StatusPill,
  type ProductWithEnhancedMetrics,
} from "@/components/client";

// =============================================================================
// TYPES
// =============================================================================

type ItemTypeTab = "evergreen" | "event" | "completed";
type SectionTab = "products" | "comments" | "activity" | "tasks";

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // UI State
  const [activeTab, setActiveTab] = useState<ItemTypeTab>("evergreen");
  const [sectionTab, setSectionTab] = useState<SectionTab>("products");
  const [search, setSearch] = useState("");

  // Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showForecastModal, setShowForecastModal] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<ProductWithMetrics | null>(null);

  // Check if user can edit AI settings (admin or operations_manager only)
  const canEditAiSettings =
    user?.role === "admin" || user?.role === "operations_manager";

  // Detect ?import=true query param and open modal automatically
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("import") === "true") {
      setShowImportModal(true);
      // Clean up URL after opening modal
      window.history.replaceState({}, "", `/clients/${clientId}`);
    }
  }, [location.search, clientId]);

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  // Fetch client
  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.get<ClientWithStats>(`/clients/${clientId}`),
    enabled: !!clientId,
  });

  // Fetch products with item type counts in meta
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["products", clientId, activeTab, search],
    queryFn: () =>
      api.get<{
        data: ProductWithMetrics[];
        meta: {
          statusCounts: Record<string, number>;
          itemTypeCounts: Record<string, number>;
        };
      }>(`/clients/${clientId}/products`, {
        params: {
          type: activeTab,
          search: search || undefined,
          includeOrphans: "true",
        },
      }),
    enabled: !!clientId,
  });

  const products = (productsData?.data || []) as ProductWithEnhancedMetrics[];
  const statusCounts = productsData?.meta?.statusCounts || {};

  // Use itemTypeCounts from meta instead of separate query (efficient groupBy on server)
  const productCounts = productsData?.meta?.itemTypeCounts || null;

  // Smart default tab selection
  useEffect(() => {
    if (productsData && productsData.data.length === 0 && productCounts) {
      const tabsWithProducts = (
        Object.entries(productCounts) as [ItemTypeTab, number][]
      )
        .filter(([, count]) => count > 0)
        .map(([tab]) => tab);

      if (tabsWithProducts.length > 0 && !tabsWithProducts.includes(activeTab)) {
        setActiveTab(tabsWithProducts[0]);
      }
    }
  }, [productsData, productCounts, activeTab]);

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  // Delete client mutation
  const deleteClientMutation = useMutation({
    mutationFn: async () => {
      return api.delete(`/clients/${clientId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client deleted successfully");
      navigate("/clients");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete client");
    },
  });

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  const handleImportSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["products"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["imports"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["orders"], exact: false });
  };

  const handleExport = async () => {
    try {
      if (!products || products.length === 0) {
        toast.error("No data to export");
        return;
      }

      const headers = [
        "Product ID",
        "Name",
        "Status",
        "Stock (Packs)",
        "Stock (Units)",
        "Reorder Point",
        "Weeks Remaining",
      ];
      const rows = products.map((p) => [
        p.productId,
        p.name,
        p.status.level,
        p.currentStockPacks,
        p.currentStockUnits,
        p.reorderPointPacks,
        p.status.weeksRemaining === 999 ? "" : p.status.weeksRemaining,
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${client?.code || "export"}-${activeTab}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Export downloaded");
    } catch {
      toast.error("Failed to export data");
    }
  };

  const handleViewForecast = (product: ProductWithEnhancedMetrics) => {
    setSelectedProduct(product);
    setShowForecastModal(true);
  };

  // ==========================================================================
  // LOADING / ERROR STATES
  // ==========================================================================

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
        <Link
          to="/clients"
          className="text-primary-600 hover:text-primary-700 mt-2 inline-block"
        >
          Back to clients
        </Link>
      </div>
    );
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <motion.div
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/clients"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            aria-label="Back to clients"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <p className="text-gray-500">{client.code}</p>
          </div>
        </div>
        <nav className="flex items-center gap-2" aria-label="Client actions">
          <Link
            to={`/clients/${clientId}/analytics`}
            className="btn-primary btn-sm"
          >
            <TrendingUp className="w-4 h-4 mr-2" aria-hidden="true" />
            Analytics
          </Link>
          <Link
            to={`/clients/${clientId}/locations`}
            className="btn-secondary btn-sm"
          >
            <MapPin className="w-4 h-4 mr-2" aria-hidden="true" />
            Locations
          </Link>
          <button
            className="btn-secondary btn-sm"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
            Import
          </button>
          <button className="btn-secondary btn-sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" aria-hidden="true" />
            Export
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={() => setShowSettingsModal(true)}
            aria-label="Client settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </nav>
      </header>

      {/* Stock Health Overview */}
      <section className="card p-6" aria-labelledby="stock-health-heading">
        <h2 id="stock-health-heading" className="font-semibold text-gray-900 mb-4">
          Stock Health
        </h2>
        <div className="flex items-center gap-4" role="list">
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
      </section>

      {/* Custom Data Insights Widget */}
      {clientId && <CustomDataInsightsWidget clientId={clientId} />}

      {/* Section Tabs */}
      <nav
        className="flex items-center gap-4 border-b border-gray-200"
        role="tablist"
        aria-label="Client sections"
      >
        {[
          { id: "products", icon: Package, label: "Products" },
          { id: "comments", icon: MessageSquare, label: "Comments" },
          { id: "activity", icon: Activity, label: "Activity" },
          { id: "tasks", icon: CheckSquare, label: "Tasks" },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={sectionTab === id}
            aria-controls={`${id}-panel`}
            onClick={() => setSectionTab(id as SectionTab)}
            className={clsx(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
              sectionTab === id
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {/* Section Content */}
      <main>
        {sectionTab === "products" && (
          <div id="products-panel" role="tabpanel" aria-labelledby="products-tab">
            {/* Item Type Tabs and Search */}
            <div className="flex items-center justify-between mb-4">
              <div
                className="flex gap-1 p-1 bg-gray-100 rounded-lg"
                role="tablist"
                aria-label="Product types"
              >
                {(["evergreen", "event", "completed"] as const).map((tab) => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={activeTab === tab}
                    onClick={() => setActiveTab(tab)}
                    className={clsx(
                      "px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize",
                      activeTab === tab
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <label className="sr-only" htmlFor="product-search">
                Search products
              </label>
              <input
                id="product-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="input w-64"
              />
            </div>

            {/* Info Banner for Empty Tab */}
            {productsData?.data.length === 0 && productCounts && !search && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-blue-600" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        No {activeTab} products found
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Products available in other categories:
                        {(Object.entries(productCounts) as [ItemTypeTab, number][])
                          .filter(([tab, count]) => tab !== activeTab && count > 0)
                          .map(([tab, count]) => ` ${tab} (${count})`)
                          .join(", ") || " none"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {(Object.entries(productCounts) as [ItemTypeTab, number][])
                      .filter(([tab, count]) => tab !== activeTab && count > 0)
                      .map(([tab, count]) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 transition-colors capitalize"
                        >
                          View {tab} ({count})
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Products Table */}
            <ProductTable
              products={products}
              isLoading={productsLoading}
              search={search}
              activeTab={activeTab}
              onViewForecast={handleViewForecast}
            />
          </div>
        )}

        {sectionTab === "comments" && clientId && (
          <div id="comments-panel" role="tabpanel" aria-labelledby="comments-tab">
            <CommentThread
              entityType="client"
              entityId={clientId}
              title="Client Notes & Comments"
            />
          </div>
        )}

        {sectionTab === "activity" && clientId && (
          <div id="activity-panel" role="tabpanel" aria-labelledby="activity-tab">
            <ActivityFeed
              clientId={clientId}
              title="Client Activity"
              showFilters={true}
              limit={50}
            />
          </div>
        )}

        {sectionTab === "tasks" && clientId && (
          <div id="tasks-panel" role="tabpanel" aria-labelledby="tasks-tab">
            <TodoList
              clientId={clientId}
              title="Client Tasks"
              showCreateButton={true}
            />
          </div>
        )}
      </main>

      {/* Modals */}
      <ImportModal
        clientId={clientId!}
        clientName={client?.name}
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
      />

      {selectedProduct && (
        <ForecastModal
          isOpen={showForecastModal}
          onClose={() => {
            setShowForecastModal(false);
            setSelectedProduct(null);
          }}
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          currentStock={selectedProduct.currentStockUnits}
        />
      )}

      <ClientSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onDeleteClick={() => setShowDeleteConfirm(true)}
        clientId={clientId!}
        clientName={client.name}
        clientCode={client.code}
        canEditAiSettings={canEditAiSettings}
      />

      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => deleteClientMutation.mutate()}
        isDeleting={deleteClientMutation.isPending}
        title="Delete Client?"
        itemName={client.name}
        warningMessage="This action cannot be undone. All products, inventory data, orders, and history associated with this client will be permanently deleted."
      />
    </motion.div>
  );
}
