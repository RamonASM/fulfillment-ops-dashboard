import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ChevronLeft,
  Package,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Search,
  TrendingUp,
  Sparkles,
  DollarSign,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/api/client';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { fadeInUp } from '@/lib/animations';

// =============================================================================
// TYPES
// =============================================================================

interface OrphanProduct {
  id: string;
  productId: string;
  name: string | null;
  vendorCode: string | null;
  vendorName: string | null;
  currentStockPacks: number;
  currentStockUnits: number;
  itemType: string;
  transactionCount: number;
}

interface FuzzyMatchResult {
  candidateId: string;
  candidateProductId: string;
  candidateName: string;
  confidenceScore: number;
  matchMethod: string;
  scoreBreakdown: Record<string, number>;
  reasoning: string;
}

interface ReconciliationSuggestion {
  orphan: OrphanProduct;
  matches: FuzzyMatchResult[];
  confidence: 'high' | 'medium' | 'low';
  recommendedAction: 'auto_merge' | 'review' | 'manual';
}

interface ReconciliationStats {
  totalOrphans: number;
  pendingOrphans: number;
  mergedOrphans: number;
  rejectedOrphans: number;
  reconciliationRate: string;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function OrphanReconciliation() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedOrphan, setSelectedOrphan] = useState<OrphanProduct | null>(null);
  const [reviewingSuggestion, setReviewingSuggestion] = useState<ReconciliationSuggestion | null>(null);

  // =============================================================================
  // QUERIES
  // =============================================================================

  const { data: orphansData, isLoading: orphansLoading } = useQuery({
    queryKey: ['orphans', clientId],
    queryFn: () =>
      api.get<{ data: OrphanProduct[]; meta: { total: number; message: string } }>(
        `/clients/${clientId}/orphans`
      ),
    enabled: !!clientId,
  });

  const { data: statsData } = useQuery({
    queryKey: ['orphan-stats', clientId],
    queryFn: () =>
      api.get<{ data: ReconciliationStats }>(`/clients/${clientId}/orphans/stats`),
    enabled: !!clientId,
  });

  // =============================================================================
  // MUTATIONS
  // =============================================================================

  const getSuggestionsMutation = useMutation({
    mutationFn: (orphanId: string) =>
      api.post<{ data: ReconciliationSuggestion }>(
        `/clients/${clientId}/orphans/${orphanId}/reconcile`,
        {}
      ),
    onSuccess: (data) => {
      setReviewingSuggestion(data.data);
    },
    onError: () => {
      toast.error('Failed to get match suggestions');
    },
  });

  const mergeMutation = useMutation({
    mutationFn: ({ orphanId, targetProductId }: { orphanId: string; targetProductId: string }) =>
      api.post(`/clients/${clientId}/orphans/${orphanId}/merge`, { targetProductId }),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Orphan merged successfully');
      setReviewingSuggestion(null);
      setSelectedOrphan(null);
      queryClient.invalidateQueries({ queryKey: ['orphans', clientId] });
      queryClient.invalidateQueries({ queryKey: ['orphan-stats', clientId] });
      queryClient.invalidateQueries({ queryKey: ['products', clientId] });
    },
    onError: () => {
      toast.error('Failed to merge orphan product');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (orphanId: string) =>
      api.post(`/clients/${clientId}/orphans/${orphanId}/reject`, {
        reason: 'No suitable matches found',
      }),
    onSuccess: () => {
      toast.success('Suggestion rejected');
      setReviewingSuggestion(null);
      setSelectedOrphan(null);
      queryClient.invalidateQueries({ queryKey: ['orphans', clientId] });
      queryClient.invalidateQueries({ queryKey: ['orphan-stats', clientId] });
    },
    onError: () => {
      toast.error('Failed to reject suggestion');
    },
  });

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const handleGetSuggestions = (orphan: OrphanProduct) => {
    setSelectedOrphan(orphan);
    getSuggestionsMutation.mutate(orphan.id);
  };

  const handleMerge = (targetProductId: string) => {
    if (!selectedOrphan) return;

    if (window.confirm('Are you sure you want to merge this orphan product? This action cannot be undone.')) {
      mergeMutation.mutate({
        orphanId: selectedOrphan.id,
        targetProductId,
      });
    }
  };

  const handleReject = () => {
    if (!selectedOrphan) return;

    if (window.confirm('Reject all suggestions for this orphan?')) {
      rejectMutation.mutate(selectedOrphan.id);
    }
  };

  // =============================================================================
  // DERIVED DATA
  // =============================================================================

  const orphans = orphansData?.data || [];
  const stats = statsData?.data;
  const filteredOrphans = search
    ? orphans.filter(
        (o) =>
          o.productId.toLowerCase().includes(search.toLowerCase()) ||
          o.name?.toLowerCase().includes(search.toLowerCase()) ||
          o.vendorName?.toLowerCase().includes(search.toLowerCase())
      )
    : orphans;

  // =============================================================================
  // RENDER
  // =============================================================================

  if (orphansLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                to={`/clients/${clientId}`}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-purple-500" />
                  Orphan Product Reconciliation
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  AI-powered fuzzy matching • 100% FREE • Zero API costs
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <motion.div
              {...fadeInUp}
              className="bg-white rounded-lg shadow p-6 border border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Orphans</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalOrphans}</p>
                </div>
                <Package className="w-8 h-8 text-gray-400" />
              </div>
            </motion.div>

            <motion.div
              {...fadeInUp}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-lg shadow p-6 border border-amber-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-600">Pending</p>
                  <p className="text-2xl font-bold text-amber-900 mt-1">{stats.pendingOrphans}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-amber-400" />
              </div>
            </motion.div>

            <motion.div
              {...fadeInUp}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-lg shadow p-6 border border-green-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-600">Merged</p>
                  <p className="text-2xl font-bold text-green-900 mt-1">{stats.mergedOrphans}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </motion.div>

            <motion.div
              {...fadeInUp}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-lg shadow p-6 border border-red-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-600">Rejected</p>
                  <p className="text-2xl font-bold text-red-900 mt-1">{stats.rejectedOrphans}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
            </motion.div>

            <motion.div
              {...fadeInUp}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-lg shadow p-6 border border-purple-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600">Reconciliation Rate</p>
                  <p className="text-2xl font-bold text-purple-900 mt-1">{stats.reconciliationRate}%</p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-400" />
              </div>
            </motion.div>
          </div>
        )}

        {/* Cost Savings Banner */}
        <motion.div
          {...fadeInUp}
          transition={{ delay: 0.5 }}
          className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 mb-6"
        >
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-900">
                100% FREE Fuzzy Matching • $0 API Costs
              </p>
              <p className="text-xs text-green-700">
                Powered by rapidfuzz open-source library • 85-90% auto-match accuracy
              </p>
            </div>
          </div>
        </motion.div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search orphan products by ID, name, or vendor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Orphans List */}
        {filteredOrphans.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900">
              {search ? 'No orphans match your search' : 'No orphan products found'}
            </p>
            <p className="text-sm text-gray-600 mt-2">
              {search
                ? 'Try adjusting your search terms'
                : 'All products have been successfully reconciled!'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrphans.map((orphan, index) => (
              <motion.div
                key={orphan.id}
                {...fadeInUp}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-lg shadow border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                        Orphan
                      </span>
                      <h3 className="text-lg font-semibold text-gray-900">{orphan.productId}</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Name:</span>{' '}
                        <span className="font-medium text-gray-900">
                          {orphan.name || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Vendor:</span>{' '}
                        <span className="font-medium text-gray-900">
                          {orphan.vendorName || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Stock:</span>{' '}
                        <span className="font-medium text-gray-900">
                          {orphan.currentStockPacks} packs ({orphan.currentStockUnits} units)
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Transactions:</span>{' '}
                        <span className="font-medium text-gray-900">{orphan.transactionCount}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleGetSuggestions(orphan)}
                    disabled={getSuggestionsMutation.isPending}
                    className={clsx(
                      'ml-4 px-6 py-2 rounded-lg font-medium transition-colors',
                      'bg-purple-600 hover:bg-purple-700 text-white',
                      'disabled:bg-gray-300 disabled:cursor-not-allowed',
                      'flex items-center gap-2'
                    )}
                  >
                    {getSuggestionsMutation.isPending && selectedOrphan?.id === orphan.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Finding Matches...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Find Matches
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Review Modal */}
      <AnimatePresence>
        {reviewingSuggestion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setReviewingSuggestion(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Sparkles className="w-6 h-6" />
                  Fuzzy Match Results
                </h2>
                <p className="text-purple-100 text-sm mt-1">
                  {reviewingSuggestion.matches.length} match(es) found • Confidence:{' '}
                  <span className="font-semibold capitalize">{reviewingSuggestion.confidence}</span>
                </p>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Orphan Product */}
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <h3 className="text-sm font-semibold text-amber-900 mb-2">Orphan Product</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-amber-700">Product ID:</span>{' '}
                      <span className="font-medium text-amber-900">
                        {reviewingSuggestion.orphan.productId}
                      </span>
                    </div>
                    <div>
                      <span className="text-amber-700">Name:</span>{' '}
                      <span className="font-medium text-amber-900">
                        {reviewingSuggestion.orphan.name || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-amber-700">Vendor:</span>{' '}
                      <span className="font-medium text-amber-900">
                        {reviewingSuggestion.orphan.vendorName || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-amber-700">Transactions:</span>{' '}
                      <span className="font-medium text-amber-900">
                        {reviewingSuggestion.orphan.transactionCount}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Match Candidates */}
                {reviewingSuggestion.matches.length === 0 ? (
                  <div className="text-center py-12">
                    <XCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-900">No Matches Found</p>
                    <p className="text-sm text-gray-600 mt-2">
                      No suitable candidates found above the confidence threshold
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Suggested Matches ({reviewingSuggestion.matches.length})
                    </h3>
                    {reviewingSuggestion.matches.map((match) => (
                      <div
                        key={match.candidateId}
                        className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={clsx(
                                'px-3 py-1 text-xs font-medium rounded-full',
                                match.confidenceScore >= 0.95 && 'bg-green-100 text-green-800',
                                match.confidenceScore >= 0.85 &&
                                  match.confidenceScore < 0.95 &&
                                  'bg-blue-100 text-blue-800',
                                match.confidenceScore >= 0.75 &&
                                  match.confidenceScore < 0.85 &&
                                  'bg-yellow-100 text-yellow-800',
                                match.confidenceScore < 0.75 && 'bg-gray-100 text-gray-800'
                              )}
                            >
                              {(match.confidenceScore * 100).toFixed(1)}% confidence
                            </span>
                            <span className="text-xs text-gray-500 capitalize">
                              {match.matchMethod.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <button
                            onClick={() => handleMerge(match.candidateId)}
                            disabled={mergeMutation.isPending}
                            className={clsx(
                              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                              'bg-purple-600 hover:bg-purple-700 text-white',
                              'disabled:bg-gray-300 disabled:cursor-not-allowed'
                            )}
                          >
                            {mergeMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'Merge'
                            )}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                          <div>
                            <span className="text-gray-600">Product ID:</span>{' '}
                            <span className="font-medium text-gray-900">
                              {match.candidateProductId}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">Name:</span>{' '}
                            <span className="font-medium text-gray-900">
                              {match.candidateName || 'N/A'}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">
                          <span className="font-medium">Reasoning:</span> {match.reasoning}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
                <button
                  onClick={handleReject}
                  disabled={rejectMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Reject All
                </button>
                <button
                  onClick={() => setReviewingSuggestion(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
