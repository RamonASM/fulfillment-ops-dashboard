import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart, Minus, Plus, Trash2, Loader2, Search, Filter, AlertTriangle, Package, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { portalApi } from '@/api/client';
import toast from 'react-hot-toast';
import { ProductOrderCard, type ProductForOrder } from '@/components/ProductOrderCard';
import { LocationSelector } from '@/components/LocationSelector';
import { fadeInUp, staggerContainer, staggerItem } from '@/lib/animations';

interface CartItem {
  productId: string;
  product: ProductForOrder;
  quantity: number;
}

interface ProductsResponse {
  data: ProductForOrder[];
  meta: {
    total: number;
    statusCounts: Record<string, number>;
  };
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All Products' },
  { value: 'needs_reorder', label: 'Needs Reorder', color: 'text-amber-600' },
  { value: 'critical', label: 'Critical', color: 'text-red-600' },
  { value: 'low', label: 'Low', color: 'text-amber-600' },
  { value: 'healthy', label: 'Healthy', color: 'text-emerald-600' },
];

export default function OrderRequest() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>('cards');

  // Pre-selected products from navigation state
  const preSelectedIds = (location.state as { productIds?: string[] })?.productIds || [];

  // Fetch all products with Phase 13 usage tier fields
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['portal', 'products', 'for-order'],
    queryFn: () => portalApi.get<ProductsResponse>('/products'),
  });

  const products = productsData?.data || [];
  const statusCounts = productsData?.meta?.statusCounts || {};

  // Add pre-selected products to cart on load
  useEffect(() => {
    if (preSelectedIds.length > 0 && products.length > 0 && cart.length === 0) {
      const selectedProducts = products.filter((p) => preSelectedIds.includes(p.id));
      const initialCart = selectedProducts.map((p) => ({
        productId: p.id,
        product: p,
        quantity: p.suggestedOrderQty || 1,
      }));
      setCart(initialCart);
    }
  }, [preSelectedIds, products, cart.length]);

  // Filter products
  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Text search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((p) =>
        p.name.toLowerCase().includes(query) ||
        p.productId.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter === 'needs_reorder') {
      filtered = filtered.filter((p) => ['critical', 'low', 'stockout'].includes(p.status));
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    // Sort by status priority (critical first, then low, etc.)
    const statusPriority: Record<string, number> = {
      stockout: 0,
      critical: 1,
      low: 2,
      watch: 3,
      healthy: 4,
    };

    return filtered.sort((a, b) =>
      (statusPriority[a.status] ?? 5) - (statusPriority[b.status] ?? 5)
    );
  }, [products, searchQuery, statusFilter]);

  // Products that need reordering
  const needsReorderCount = products.filter((p) =>
    ['critical', 'low', 'stockout'].includes(p.status)
  ).length;

  // Submit order mutation
  const submitOrder = useMutation({
    mutationFn: (data: { items: Array<{ productId: string; quantity: number }>; notes: string; locationId?: string | null }) =>
      portalApi.post('/orders/request', data),
    onSuccess: () => {
      toast.success('Order request submitted successfully!');
      queryClient.invalidateQueries({ queryKey: ['portal'] });
      navigate('/orders');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit order');
    },
  });

  const addToCart = (product: ProductForOrder) => {
    const existing = cart.find((item) => item.productId === product.id);
    if (existing) {
      updateQuantity(product.id, existing.quantity + 1);
    } else {
      setCart([...cart, { productId: product.id, product, quantity: product.suggestedOrderQty || 1 }]);
      toast.success(`${product.name} added to cart`);
    }
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity < 1) {
      removeFromCart(productId);
      return;
    }
    setCart(cart.map((item) =>
      item.productId === productId ? { ...item, quantity } : item
    ));
  };

  const removeFromCart = (productId: string) => {
    const item = cart.find((i) => i.productId === productId);
    setCart(cart.filter((item) => item.productId !== productId));
    if (item) {
      toast.success(`${item.product.name} removed from cart`);
    }
  };

  const addAllNeedingReorder = () => {
    const needsReorder = products.filter(
      (p) => ['critical', 'low', 'stockout'].includes(p.status) && !cart.find((c) => c.productId === p.id)
    );
    if (needsReorder.length === 0) {
      toast.error('All items needing reorder are already in cart');
      return;
    }
    const newItems = needsReorder.map((p) => ({
      productId: p.id,
      product: p,
      quantity: p.suggestedOrderQty || 1,
    }));
    setCart([...cart, ...newItems]);
    toast.success(`Added ${newItems.length} items to cart`);
  };

  const handleSubmit = () => {
    if (cart.length === 0) {
      toast.error('Please add at least one product to your order');
      return;
    }

    submitOrder.mutate({
      items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      notes,
      locationId,
    });
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalUnits = cart.reduce((sum, item) => sum + item.quantity * item.product.packSize, 0);

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
          <h1 className="text-2xl font-bold text-gray-900">New Order Request</h1>
          <p className="text-gray-500 mt-1">Select products and quantities for your reorder request</p>
        </div>
        {needsReorderCount > 0 && (
          <button
            onClick={addAllNeedingReorder}
            className="btn btn-outline text-amber-600 border-amber-300 hover:bg-amber-50"
          >
            <AlertTriangle className="w-4 h-4" />
            Add All {needsReorderCount} Low Stock Items
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Selection */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search and Filters */}
          <div className="card p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
                  {STATUS_FILTERS.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label} {filter.value !== 'all' && statusCounts[filter.value] ? `(${statusCounts[filter.value]})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* View Mode Toggle */}
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('cards')}
                  className={clsx(
                    'px-3 py-2 text-sm',
                    viewMode === 'cards' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  )}
                >
                  Cards
                </button>
                <button
                  onClick={() => setViewMode('compact')}
                  className={clsx(
                    'px-3 py-2 text-sm',
                    viewMode === 'compact' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  )}
                >
                  Compact
                </button>
              </div>
            </div>
          </div>

          {/* Products List */}
          <div className={clsx(
            viewMode === 'compact' && 'card p-4'
          )}>
            {productsLoading ? (
              <div className="card p-8 text-center text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                Loading products...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="card p-8 text-center text-gray-500">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-medium">No products found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className={clsx(
                  viewMode === 'cards' ? 'space-y-4' : 'space-y-2'
                )}
              >
                <AnimatePresence>
                  {filteredProducts.map((product) => {
                    const cartItem = cart.find((item) => item.productId === product.id);
                    return (
                      <motion.div
                        key={product.id}
                        variants={staggerItem}
                        layout
                      >
                        <ProductOrderCard
                          product={product}
                          inCart={!!cartItem}
                          quantity={cartItem?.quantity}
                          onAddToCart={addToCart}
                          compact={viewMode === 'compact'}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>

        {/* Cart Sidebar */}
        <div className="space-y-4">
          <div className="card p-4 sticky top-20">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
              <h2 className="font-semibold text-gray-900">Order Cart</h2>
              <span className="ml-auto bg-emerald-100 text-emerald-800 text-xs font-medium px-2 py-0.5 rounded-full">
                {totalItems} packs
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-medium">Your cart is empty</p>
                <p className="text-sm">Add products from the list</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                <AnimatePresence>
                  {cart.map((item) => (
                    <motion.div
                      key={item.productId}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate text-sm">{item.product.name}</p>
                        <p className="text-xs text-gray-500">
                          {item.product.productId} • {item.quantity * item.product.packSize} units
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0)}
                          className="w-12 text-center border border-gray-200 rounded py-1 text-sm"
                          min="1"
                        />
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Cart Summary */}
            {cart.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-500">Total Packs:</span>
                  <span className="font-medium text-gray-900">{totalItems}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Units:</span>
                  <span className="font-medium text-gray-900">{totalUnits.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Delivery Location */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  Delivery Location
                </div>
              </label>
              <LocationSelector
                value={locationId}
                onChange={setLocationId}
                placeholder="Select delivery location..."
              />
            </div>

            {/* Notes */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special instructions for this order..."
                rows={3}
                className="input resize-none"
              />
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={cart.length === 0 || submitOrder.isPending}
              className="btn btn-primary w-full mt-4"
            >
              {submitOrder.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  Submit Order Request
                </>
              )}
            </button>

            <p className="text-xs text-gray-500 text-center mt-3">
              Your request will be reviewed by your account manager
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
