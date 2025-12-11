// =============================================================================
// PORTAL FEEDBACK PAGE
// Submit and view product feedback from client portal
// =============================================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Star, Package, Check, Clock, ChevronRight, X } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { usePortalAuthStore } from '@/stores/auth.store';
import { directApi } from '@/api/client';
import FeedbackForm, { type FeedbackData } from '@/components/FeedbackForm';
import { fadeInUp, staggerContainer, staggerItem } from '@/lib/animations';

interface PendingProduct {
  id: string;
  productId: string;
  name: string;
  currentStockPacks: number;
  packSize: number;
  lastOrderDate: string | null;
  hasExistingFeedback: boolean;
}

interface ExistingFeedback {
  id: string;
  product: {
    id: string;
    productId: string;
    name: string;
  };
  qualityRating: number;
  deliveryRating: number | null;
  valueRating: number | null;
  wouldReorder: boolean | null;
  positiveComments: string | null;
  createdAt: string;
}

export default function Feedback() {
  const { user } = usePortalAuthStore();
  const queryClient = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState<PendingProduct | null>(null);

  // Fetch pending products for feedback
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-feedback', user?.clientId],
    queryFn: () =>
      directApi.get<{ data: PendingProduct[] }>('/api/feedback/pending', {
        params: { clientId: user?.clientId || '' },
      }),
    enabled: !!user?.clientId,
  });

  // Fetch submitted feedback
  const { data: submittedData, isLoading: submittedLoading } = useQuery({
    queryKey: ['submitted-feedback', user?.clientId],
    queryFn: () =>
      directApi.get<{ data: ExistingFeedback[]; meta: { total: number } }>(
        `/api/feedback/client/${user?.clientId}`,
        { params: { limit: '20' } }
      ),
    enabled: !!user?.clientId,
  });

  // Submit feedback mutation
  const submitMutation = useMutation({
    mutationFn: (data: FeedbackData) => directApi.post<unknown>('/api/feedback', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-feedback'] });
      queryClient.invalidateQueries({ queryKey: ['submitted-feedback'] });
      setSelectedProduct(null);
      toast.success('Feedback submitted successfully!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit feedback');
    },
  });

  const pendingProducts = pendingData?.data || [];
  const submittedFeedback = submittedData?.data || [];

  return (
    <motion.div
      className="space-y-8"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Product Feedback</h1>
        <p className="text-gray-500 mt-1">
          Share your experience with products to help us improve our service
        </p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Feedback</p>
              <p className="text-xl font-bold text-gray-900">
                {pendingProducts.filter((p) => !p.hasExistingFeedback).length}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Submitted</p>
              <p className="text-xl font-bold text-gray-900">
                {submittedFeedback.length}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Star className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg Rating</p>
              <p className="text-xl font-bold text-gray-900">
                {submittedFeedback.length > 0
                  ? (
                      submittedFeedback.reduce((acc, f) => acc + f.qualityRating, 0) /
                      submittedFeedback.length
                    ).toFixed(1)
                  : '--'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Form Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setSelectedProduct(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Submit Feedback
                </h2>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <FeedbackForm
                productId={selectedProduct.id}
                productName={`${selectedProduct.productId} - ${selectedProduct.name}`}
                onSubmit={async (data) => {
                  await submitMutation.mutateAsync(data);
                }}
                onCancel={() => setSelectedProduct(null)}
                isSubmitting={submitMutation.isPending}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending Feedback Section */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Products Awaiting Feedback
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Help us improve by sharing your experience with these products
          </p>
        </div>

        {pendingLoading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : pendingProducts.filter((p) => !p.hasExistingFeedback).length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-gray-300" />
            <p className="mt-4 text-gray-500">
              No products pending feedback. Check back after your next order!
            </p>
          </div>
        ) : (
          <motion.div
            className="divide-y divide-gray-100"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {pendingProducts
              .filter((p) => !p.hasExistingFeedback)
              .map((product) => (
                <motion.div
                  key={product.id}
                  variants={staggerItem}
                  className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <Package className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {product.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          SKU: {product.productId}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </motion.div>
              ))}
          </motion.div>
        )}
      </div>

      {/* Submitted Feedback Section */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Check className="w-5 h-5 text-green-500" />
            Your Feedback History
          </h2>
        </div>

        {submittedLoading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : submittedFeedback.length === 0 ? (
          <div className="p-8 text-center">
            <Star className="w-12 h-12 mx-auto text-gray-300" />
            <p className="mt-4 text-gray-500">
              You haven't submitted any feedback yet
            </p>
          </div>
        ) : (
          <motion.div
            className="divide-y divide-gray-100"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {submittedFeedback.map((feedback) => (
              <motion.div
                key={feedback.id}
                variants={staggerItem}
                className="p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {feedback.product.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      SKU: {feedback.product.productId}
                    </p>
                    {feedback.positiveComments && (
                      <p className="text-sm text-gray-600 mt-2 italic">
                        "{feedback.positiveComments}"
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={clsx(
                            'w-4 h-4',
                            star <= feedback.qualityRating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-gray-200'
                          )}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(feedback.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
