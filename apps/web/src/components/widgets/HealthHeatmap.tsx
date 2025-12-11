// =============================================================================
// HEALTH HEATMAP WIDGET (Phase 11)
// Grid visualization of product health by client
// =============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface ProductCell {
  id: string;
  name: string;
  status: string;
  weeksRemaining: number | null;
}

interface ClientRow {
  id: string;
  name: string;
  products: ProductCell[];
}

interface HealthHeatmapProps {
  data: {
    clients: ClientRow[];
  };
  maxProductsPerRow?: number;
  onProductClick?: (productId: string, clientId: string) => void;
}

const statusColors: Record<string, string> = {
  HEALTHY: 'bg-emerald-500 hover:bg-emerald-600',
  WATCH: 'bg-blue-500 hover:bg-blue-600',
  LOW: 'bg-amber-500 hover:bg-amber-600',
  CRITICAL: 'bg-red-500 hover:bg-red-600',
  STOCKOUT: 'bg-red-900 hover:bg-red-950',
};

const statusLabels: Record<string, string> = {
  HEALTHY: 'Healthy',
  WATCH: 'Watch',
  LOW: 'Low',
  CRITICAL: 'Critical',
  STOCKOUT: 'Stockout',
};

function ProductTooltip({ product }: { product: ProductCell }) {
  return (
    <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap pointer-events-none">
      <p className="font-medium">{product.name}</p>
      <p className="text-gray-300">
        Status: {statusLabels[product.status] || product.status}
      </p>
      {product.weeksRemaining !== null && (
        <p className="text-gray-300">
          {product.weeksRemaining} weeks remaining
        </p>
      )}
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
        <div className="border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  );
}

function ProductCell({
  product,
  onClick,
}: {
  product: ProductCell;
  onClick?: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        onClick={onClick}
        className={`w-4 h-4 rounded-sm ${statusColors[product.status] || 'bg-gray-400'} transition-colors`}
        title={product.name}
      />
      {showTooltip && <ProductTooltip product={product} />}
    </div>
  );
}

export function HealthHeatmap({
  data,
  maxProductsPerRow = 20,
  onProductClick,
}: HealthHeatmapProps) {
  const navigate = useNavigate();

  const handleProductClick = (productId: string, clientId: string) => {
    if (onProductClick) {
      onProductClick(productId, clientId);
    } else {
      navigate(`/clients/${clientId}`);
    }
  };

  if (!data.clients || data.clients.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Inventory Health Heatmap
        </h3>
        <p className="text-gray-500 text-center py-8">
          No data available
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Inventory Health Heatmap
        </h3>
        <div className="flex items-center gap-4">
          {Object.entries(statusLabels).map(([status, label]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${statusColors[status]}`} />
              <span className="text-xs text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {data.clients.map((client) => {
          // Sort products by status severity
          const sortedProducts = [...client.products].sort((a, b) => {
            const order = ['STOCKOUT', 'CRITICAL', 'LOW', 'WATCH', 'HEALTHY'];
            return order.indexOf(a.status) - order.indexOf(b.status);
          });

          // Calculate status summary
          const statusCounts = client.products.reduce((acc, p) => {
            acc[p.status] = (acc[p.status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          const criticalCount = (statusCounts.CRITICAL || 0) + (statusCounts.STOCKOUT || 0);

          return (
            <div key={client.id} className="flex items-center gap-3">
              <div
                className="w-32 flex-shrink-0 cursor-pointer hover:text-blue-600"
                onClick={() => navigate(`/clients/${client.id}`)}
              >
                <p className="text-sm font-medium text-gray-900 truncate">
                  {client.name}
                </p>
                <p className="text-xs text-gray-500">
                  {client.products.length} products
                  {criticalCount > 0 && (
                    <span className="text-red-600 ml-1">
                      ({criticalCount} critical)
                    </span>
                  )}
                </p>
              </div>

              <div className="flex-1 flex flex-wrap gap-1">
                {sortedProducts.slice(0, maxProductsPerRow).map((product) => (
                  <ProductCell
                    key={product.id}
                    product={product}
                    onClick={() => handleProductClick(product.id, client.id)}
                  />
                ))}
                {sortedProducts.length > maxProductsPerRow && (
                  <span className="text-xs text-gray-400 self-center ml-1">
                    +{sortedProducts.length - maxProductsPerRow} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HealthHeatmap;
