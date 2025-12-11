// =============================================================================
// ADMIN FEEDBACK ANALYTICS PAGE
// Dashboard for viewing client feedback and product ratings
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Star,
  TrendingUp,
  TrendingDown,
  ThumbsUp,
  MessageSquare,
  Package,
  Filter,
} from 'lucide-react';
import { useState } from 'react';
import { clsx } from 'clsx';
import { api } from '@/api/client';
import { fadeInUp, staggerContainer, staggerItem } from '@/lib/animations';

interface ClientOption {
  id: string;
  name: string;
  code: string;
}

interface FeedbackAnalytics {
  summary: {
    totalFeedback: number;
    avgQualityRating: number;
    avgDeliveryRating: number;
    avgValueRating: number;
    wouldReorderPercent: number;
  };
  ratingDistribution: {
    rating: number;
    count: number;
  }[];
  topRatedProducts: {
    productId: string;
    productCode: string;
    productName: string;
    avgRating: number;
    feedbackCount: number;
  }[];
  lowRatedProducts: {
    productId: string;
    productCode: string;
    productName: string;
    avgRating: number;
    feedbackCount: number;
  }[];
  recentFeedback: {
    id: string;
    product: {
      id: string;
      productId: string;
      name: string;
    };
    qualityRating: number;
    positiveComments: string | null;
    improvementSuggestions: string | null;
    submittedBy: {
      name: string;
    };
    createdAt: string;
  }[];
}

interface Recommendation {
  id: string;
  productId: string;
  name: string;
  avgQualityRating: number;
  feedbackCount: number;
  popularityScore: number;
  reason: string;
}

export default function FeedbackAnalytics() {
  const [selectedClient, setSelectedClient] = useState<string>('');

  // Fetch clients
  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => api.get<{ data: ClientOption[] }>('/clients'),
  });

  // Fetch analytics for selected client
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['feedback-analytics', selectedClient],
    queryFn: () =>
      api.get<FeedbackAnalytics>(`/feedback/client/${selectedClient}/analytics`),
    enabled: !!selectedClient,
  });

  // Fetch recommendations
  const { data: recommendationsData } = useQuery({
    queryKey: ['recommendations', selectedClient],
    queryFn: () =>
      api.get<{ data: Recommendation[] }>(
        `/feedback/recommendations/${selectedClient}`,
        { params: { type: 'top_rated', limit: '5' } }
      ),
    enabled: !!selectedClient,
  });

  const clients = clientsData?.data || [];
  const analytics = analyticsData;
  const recommendations = recommendationsData?.data || [];

  return (
    <motion.div
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            Feedback Analytics
          </h1>
          <p className="text-text-secondary mt-1">
            View and analyze product feedback from clients
          </p>
        </div>
      </div>

      {/* Client Filter */}
      <div className="flex items-center gap-4">
        <Filter className="w-5 h-5 text-gray-400" />
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="input"
        >
          <option value="">Select a client...</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name} ({client.code})
            </option>
          ))}
        </select>
      </div>

      {!selectedClient ? (
        <div className="card p-12 text-center">
          <MessageSquare className="w-12 h-12 mx-auto text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Select a Client
          </h3>
          <p className="mt-2 text-gray-500">
            Choose a client to view their feedback analytics
          </p>
        </div>
      ) : analyticsLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card p-6">
                <div className="skeleton h-4 w-20 mb-2" />
                <div className="skeleton h-8 w-16" />
              </div>
            ))}
          </div>
        </div>
      ) : !analytics ? (
        <div className="card p-12 text-center">
          <Star className="w-12 h-12 mx-auto text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No Feedback Yet
          </h3>
          <p className="mt-2 text-gray-500">
            This client hasn't received any product feedback yet
          </p>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <motion.div
            className="grid grid-cols-1 md:grid-cols-4 gap-4"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={staggerItem} className="card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Feedback</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analytics.summary.totalFeedback}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Avg Quality</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-gray-900">
                      {analytics.summary.avgQualityRating.toFixed(1)}
                    </p>
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                  </div>
                </div>
                <div className="p-3 bg-amber-100 rounded-lg">
                  <Star className="w-5 h-5 text-amber-600" />
                </div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Avg Delivery</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-gray-900">
                      {analytics.summary.avgDeliveryRating?.toFixed(1) || '--'}
                    </p>
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                  </div>
                </div>
                <div className="p-3 bg-green-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Would Reorder</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analytics.summary.wouldReorderPercent.toFixed(0)}%
                  </p>
                </div>
                <div className="p-3 bg-purple-100 rounded-lg">
                  <ThumbsUp className="w-5 h-5 text-purple-600" />
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Rating Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">
                  Rating Distribution
                </h3>
              </div>
              <div className="p-4">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const count =
                    analytics.ratingDistribution.find((r) => r.rating === rating)
                      ?.count || 0;
                  const total = analytics.summary.totalFeedback;
                  const percent = total > 0 ? (count / total) * 100 : 0;

                  return (
                    <div key={rating} className="flex items-center gap-3 mb-3">
                      <div className="flex items-center gap-1 w-12">
                        <span className="text-sm text-gray-600">{rating}</span>
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      </div>
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-500 w-10 text-right">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recommendations */}
            <div className="card">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Top Rated Products</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {recommendations.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No recommendations available
                  </div>
                ) : (
                  recommendations.map((product) => (
                    <div key={product.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <Package className="w-4 h-4 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {product.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {product.productId}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">
                              {product.avgQualityRating.toFixed(1)}
                            </span>
                            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                          </div>
                          <p className="text-xs text-gray-500">
                            {product.feedbackCount} reviews
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Top and Low Rated */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Rated */}
            <div className="card">
              <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <h3 className="font-semibold text-gray-900">Top Performers</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {analytics.topRatedProducts.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No data available
                  </div>
                ) : (
                  analytics.topRatedProducts.map((product) => (
                    <div key={product.productId} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {product.productName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {product.productCode}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-green-600">
                            {product.avgRating.toFixed(1)}
                          </span>
                          <Star className="w-4 h-4 fill-green-500 text-green-500" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Needs Improvement */}
            <div className="card">
              <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <h3 className="font-semibold text-gray-900">Needs Improvement</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {analytics.lowRatedProducts.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No products with low ratings
                  </div>
                ) : (
                  analytics.lowRatedProducts.map((product) => (
                    <div key={product.productId} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {product.productName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {product.productCode}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-red-600">
                            {product.avgRating.toFixed(1)}
                          </span>
                          <Star className="w-4 h-4 fill-red-500 text-red-500" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Recent Feedback */}
          <div className="card">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Recent Feedback</h3>
            </div>
            <motion.div
              className="divide-y divide-gray-100"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {analytics.recentFeedback.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No recent feedback
                </div>
              ) : (
                analytics.recentFeedback.map((feedback) => (
                  <motion.div
                    key={feedback.id}
                    variants={staggerItem}
                    className="p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-900">
                          {feedback.product.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          by {feedback.submittedBy.name}
                        </p>
                      </div>
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
                    </div>
                    {feedback.positiveComments && (
                      <p className="text-sm text-gray-600 mb-1">
                        <span className="text-green-600">+</span>{' '}
                        {feedback.positiveComments}
                      </p>
                    )}
                    {feedback.improvementSuggestions && (
                      <p className="text-sm text-gray-600">
                        <span className="text-amber-600">!</span>{' '}
                        {feedback.improvementSuggestions}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(feedback.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </motion.div>
                ))
              )}
            </motion.div>
          </div>
        </>
      )}
    </motion.div>
  );
}
