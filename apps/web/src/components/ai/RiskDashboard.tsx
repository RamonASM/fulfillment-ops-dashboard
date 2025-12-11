import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { AlertTriangle, TrendingUp, Clock, Activity } from 'lucide-react';
import toast from 'react-hot-toast';

interface RiskScore {
  productId: string;
  score: number;
  factors: Array<{
    name: string;
    weight: number;
    value: number;
    contribution: number;
    description: string;
  }>;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  calculatedAt: string;
  productName: string;
  clientName: string;
}

interface RiskData {
  data: RiskScore[];
}

const riskLevelConfig = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-800',
    icon: AlertTriangle,
  },
  high: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    badge: 'bg-orange-100 text-orange-800',
    icon: TrendingUp,
  },
  moderate: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    badge: 'bg-yellow-100 text-yellow-800',
    icon: Clock,
  },
  low: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    badge: 'bg-green-100 text-green-800',
    icon: Activity,
  },
};

export function RiskDashboard() {
  const { data, isLoading, error } = useQuery<RiskData, Error>({
    queryKey: ['ai', 'risk', 'top-risky'],
    queryFn: () => api.get<RiskData>('/ai/risk/top-risky?limit=10'),
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    meta: {
      errorMessage: 'Failed to load risk data',
    },
  });

  // Show toast on error
  useEffect(() => {
    if (error) {
      toast.error(error.message || 'Failed to load risk data');
    }
  }, [error]);

  if (isLoading) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Risk Overview</h2>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-20 bg-gray-200 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Risk Overview</h2>
        <div className="text-center py-8 text-gray-500">
          Unable to load risk data. Please try again later.
        </div>
      </div>
    );
  }

  const riskProducts = data?.data || [];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Risk Overview</h2>
        <span className="text-sm text-gray-500">
          {riskProducts.length} products at elevated risk
        </span>
      </div>

      {riskProducts.length === 0 ? (
        <div className="text-center py-8">
          <Activity className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-600">All products are at low risk</p>
          <p className="text-sm text-gray-500">Keep up the great work!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {riskProducts.map((product) => {
            const config = riskLevelConfig[product.riskLevel];
            const IconComponent = config.icon;

            return (
              <div
                key={product.productId}
                className={`p-4 rounded-lg border ${config.bg} ${config.border}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${config.badge}`}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {product.productName}
                      </h3>
                      <p className="text-sm text-gray-600">{product.clientName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${config.text}`}>
                      {product.score}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${config.badge}`}>
                      {product.riskLevel.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Risk factors */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.factors
                    .filter((f) => f.value >= 50)
                    .slice(0, 3)
                    .map((factor) => (
                      <span
                        key={factor.name}
                        className="text-xs bg-white/60 px-2 py-1 rounded text-gray-700"
                        title={factor.description}
                      >
                        {factor.name}: {factor.value}%
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RiskDashboard;
