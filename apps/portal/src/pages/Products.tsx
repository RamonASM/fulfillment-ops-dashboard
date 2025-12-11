import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, Filter, Plus, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';
import { portalApi } from '@/api/client';
import { useNavigate } from 'react-router-dom';
import { UsageTierBadge } from '@/components/ui';
import { fadeInUp } from '@/lib/animations';

interface PendingOrder {
  orderId: string;
  orderRequestId: string;
  status: string;
  quantityPacks: number;
  quantityUnits: number;
  createdAt: string;
  requestedBy?: string;
}

interface Product {
  id: string;
  productId: string;
  name: string;
  itemType: string;
  packSize: number;
  currentStockPacks: number;
  currentStockUnits: number;
  status: string;
  weeksRemaining: number;
  reorderPointPacks: number;
  // Phase 13 usage tier fields
  usageCalculationTier?: '12_month' | '6_month' | '3_month' | 'weekly' | null;
  usageConfidence?: 'high' | 'medium' | 'low' | null;
  monthlyUsagePacks?: number | null;
  // On-order tracking
  onOrderPacks?: number;
  onOrderUnits?: number;
  hasOnOrder?: boolean;
  pendingOrders?: PendingOrder[];
}

interface ProductsResponse {
  data: Product[];
  meta: {
    total: number;
    statusCounts: Record<string, number>;
  };
}

export default function Products() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['portal', 'products', { search, status: statusFilter }],
    queryFn: () =>
      portalApi.get<ProductsResponse>('/products', {
        params: {
          search,
          status: statusFilter !== 'all' ? statusFilter : '',
        },
      }),
  });

  const products = data?.data || [];
  const statusCounts = data?.meta?.statusCounts || {};

  const toggleProduct = (id: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedProducts(newSelected);
  };

  const selectAllLowStock = () => {
    const lowStockIds = products
      .filter((p) => ['critical', 'low', 'stockout'].includes(p.status))
      .map((p) => p.id);
    setSelectedProducts(new Set(lowStockIds));
  };

  const handleReorderSelected = () => {
    const productIds = Array.from(selectedProducts);
    navigate('/order/new', { state: { productIds } });
  };

  const statusColors: Record<string, string> = {
    healthy: 'badge-healthy',
    watch: 'badge-watch',
    low: 'badge-warning',
    critical: 'badge-critical',
    stockout: 'badge-stockout',
  };

  return (
    <motion.div
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Products</h1>
          <p className="text-text-secondary mt-1">Browse and manage your inventory</p>
        </div>
        {selectedProducts.size > 0 && (
          <button onClick={handleReorderSelected} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Reorder {selectedProducts.size} Items
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="input pl-10"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input w-auto"
            >
              <option value="all">All Status</option>
              <option value="stockout">Stockout ({statusCounts.stockout || 0})</option>
              <option value="critical">Critical ({statusCounts.critical || 0})</option>
              <option value="low">Low ({statusCounts.low || 0})</option>
              <option value="watch">Watch ({statusCounts.watch || 0})</option>
              <option value="healthy">Healthy ({statusCounts.healthy || 0})</option>
            </select>
          </div>

          {/* Quick Select */}
          <button
            onClick={selectAllLowStock}
            className="btn btn-outline"
          >
            Select Low Stock
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <input
                    type="checkbox"
                    checked={selectedProducts.size === products.length && products.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProducts(new Set(products.map((p) => p.id)));
                      } else {
                        setSelectedProducts(new Set());
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Product
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Current Stock
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Usage
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  On Order
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Runway
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                    Loading products...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p>No products found</p>
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr
                    key={product.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      selectedProducts.has(product.id) ? 'bg-emerald-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => toggleProduct(product.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.productId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-gray-600">{product.itemType}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-medium text-gray-900">
                        {product.currentStockUnits.toLocaleString()} units
                      </p>
                      <p className="text-sm text-gray-500">
                        {product.currentStockPacks} packs
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <UsageTierBadge
                        tier={product.usageCalculationTier}
                        confidence={product.usageConfidence}
                        monthlyUsage={product.monthlyUsagePacks}
                        showValue={true}
                        compact={true}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge ${statusColors[product.status] || 'badge-watch'}`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {product.hasOnOrder ? (
                        <div className="group relative">
                          <div className="flex items-center justify-center gap-1.5 text-blue-600">
                            <ShoppingCart className="w-4 h-4" />
                            <span className="font-medium">{product.onOrderPacks} pks</span>
                          </div>
                          {/* Tooltip on hover showing order details */}
                          {product.pendingOrders && product.pendingOrders.length > 0 && (
                            <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded-lg py-2 px-3 -top-2 left-1/2 -translate-x-1/2 -translate-y-full w-48 shadow-lg">
                              <p className="font-semibold mb-1">
                                {product.pendingOrders.length} pending order{product.pendingOrders.length > 1 ? 's' : ''}
                              </p>
                              {product.pendingOrders.slice(0, 3).map((order) => (
                                <div key={order.orderId} className="flex justify-between text-gray-300">
                                  <span className="capitalize">{order.status}</span>
                                  <span>{order.quantityPacks} pks</span>
                                </div>
                              ))}
                              {product.pendingOrders.length > 3 && (
                                <p className="text-gray-400 mt-1">+{product.pendingOrders.length - 3} more...</p>
                              )}
                              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-4 border-transparent border-t-gray-900" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${
                        product.weeksRemaining < 2 ? 'text-red-600' :
                        product.weeksRemaining < 4 ? 'text-amber-600' :
                        'text-gray-600'
                      }`}>
                        {product.weeksRemaining === 999 ? '∞' : `${product.weeksRemaining}w`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate('/order/new', { state: { productIds: [product.id] } })}
                        className="btn btn-sm btn-outline"
                      >
                        Reorder
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
