// =============================================================================
// CUSTOM DATA INSIGHTS WIDGET
// Dashboard widget showing insights from custom fields imported with products
// =============================================================================

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Database,
  DollarSign,
  Building2,
  TrendingUp,
  BarChart3,
  PieChart,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { api } from '@/api/client';
import { clsx } from 'clsx';

// =============================================================================
// TYPES
// =============================================================================

interface CustomFieldStats {
  fieldName: string;
  displayName: string;
  dataType: string;
  category: string | null;
  productCount: number;
  nonNullCount: number;
  uniqueValues?: number;
  numericStats?: {
    min: number;
    max: number;
    avg: number;
    sum: number;
  };
}


interface CustomFieldDefinition {
  id: string;
  normalizedName: string;
  displayName: string;
  dataType: string;
  category: string | null;
  isDisplayed: boolean;
  isPinned: boolean;
  displayOrder: number;
  aggregationType: string | null;
  formatPattern: string | null;
}

interface CustomDataInsightsWidgetProps {
  clientId: string;
  className?: string;
}

// =============================================================================
// CATEGORY ICONS
// =============================================================================

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  financial: DollarSign,
  vendor: Building2,
  logistics: TrendingUp,
  classification: BarChart3,
  default: Database,
};

function getCategoryIcon(category: string | null) {
  return categoryIcons[category || 'default'] || Database;
}

// =============================================================================
// VALUE FORMATTERS
// =============================================================================

function formatValue(value: number, fieldName: string): string {
  // Currency fields
  if (fieldName.toLowerCase().includes('cost') ||
      fieldName.toLowerCase().includes('price') ||
      fieldName.toLowerCase().includes('value')) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  // Percentage fields
  if (fieldName.toLowerCase().includes('percent') ||
      fieldName.toLowerCase().includes('rate')) {
    return `${value.toFixed(1)}%`;
  }

  // Default number formatting
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

// =============================================================================
// STAT CARD COMPONENT
// =============================================================================

function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  color = 'blue',
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    purple: 'bg-purple-50 text-purple-700',
  };

  return (
    <div className={clsx('rounded-lg p-4', colorClasses[color])}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 opacity-70" />
        <span className="text-sm font-medium opacity-70">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtext && (
        <p className="text-xs mt-1 opacity-60">{subtext}</p>
      )}
    </div>
  );
}

// =============================================================================
// DISTRIBUTION BAR COMPONENT
// =============================================================================

function DistributionBar({
  items,
  total,
}: {
  items: Array<{ value: string; count: number }>;
  total: number;
}) {
  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-rose-500',
    'bg-cyan-500',
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
        {items.slice(0, 6).map((item, index) => {
          const percent = (item.count / total) * 100;
          return (
            <div
              key={item.value}
              className={clsx(colors[index % colors.length], 'transition-all')}
              style={{ width: `${percent}%` }}
              title={`${item.value}: ${item.count} (${percent.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {items.slice(0, 6).map((item, index) => (
          <div key={item.value} className="flex items-center gap-1">
            <div className={clsx('w-2 h-2 rounded-full', colors[index % colors.length])} />
            <span className="text-gray-600">{item.value}</span>
            <span className="text-gray-400">({item.count})</span>
          </div>
        ))}
        {items.length > 6 && (
          <span className="text-gray-400">+{items.length - 6} more</span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN WIDGET COMPONENT
// =============================================================================

export function CustomDataInsightsWidget({ clientId, className }: CustomDataInsightsWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch custom field definitions
  const { data: fieldsData, isLoading: fieldsLoading } = useQuery({
    queryKey: ['custom-fields', clientId],
    queryFn: async () => {
      const response = await api.get<{ data: CustomFieldDefinition[] }>(`/clients/${clientId}/custom-fields`);
      return response.data;
    },
    enabled: !!clientId,
  });

  // Fetch custom field stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['custom-field-stats', clientId],
    queryFn: async () => {
      const response = await api.get<{ data: CustomFieldStats[] }>(`/clients/${clientId}/custom-field-stats`);
      return response.data;
    },
    enabled: !!clientId,
  });

  const isLoading = fieldsLoading || statsLoading;
  const fields = fieldsData || [];
  const stats = statsData || [];

  // No custom fields imported yet
  if (!isLoading && fields.length === 0) {
    return (
      <div className={clsx('bg-white rounded-xl border border-gray-200 p-6', className)}>
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-5 w-5 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Custom Data Insights</h3>
        </div>
        <div className="text-center py-8">
          <Database className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            No custom data available yet.
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Import files with additional columns (cost, vendor, etc.) to see insights here.
          </p>
        </div>
      </div>
    );
  }

  // Find key metrics from stats
  const inventoryValueField = stats.find(s =>
    s.fieldName === 'totalValue' || s.fieldName === 'inventoryValue'
  );
  const unitCostField = stats.find(s => s.fieldName === 'unitCost');
  const vendorField = stats.find(s => s.fieldName === 'vendorName');
  const leadTimeField = stats.find(s => s.fieldName === 'leadTimeDays');

  // Calculate total inventory value if we have unit cost
  const totalInventoryValue = inventoryValueField?.numericStats?.sum ||
    (unitCostField?.numericStats?.sum || 0);

  // Show loading state
  if (isLoading) {
    return (
      <div className={clsx('bg-white rounded-xl border border-gray-200 p-6', className)}>
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-5 w-5 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Custom Data Insights</h3>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('bg-white rounded-xl border border-gray-200', className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-500" />
            <h3 className="font-semibold text-gray-900">Custom Data Insights</h3>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {fields.length} fields
            </span>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {totalInventoryValue > 0 && (
            <StatCard
              label="Total Inventory Value"
              value={formatValue(totalInventoryValue, 'totalValue')}
              subtext={`${stats.find(s => s.numericStats)?.productCount || 0} products`}
              icon={DollarSign}
              color="green"
            />
          )}
          {unitCostField?.numericStats && (
            <StatCard
              label="Avg Unit Cost"
              value={formatValue(unitCostField.numericStats.avg, 'unitCost')}
              subtext={`Range: ${formatValue(unitCostField.numericStats.min, 'unitCost')} - ${formatValue(unitCostField.numericStats.max, 'unitCost')}`}
              icon={DollarSign}
              color="blue"
            />
          )}
          {vendorField && (
            <StatCard
              label="Vendors"
              value={String(vendorField.uniqueValues || 0)}
              subtext={`${vendorField.nonNullCount} products with vendor`}
              icon={Building2}
              color="purple"
            />
          )}
          {leadTimeField?.numericStats && (
            <StatCard
              label="Avg Lead Time"
              value={`${leadTimeField.numericStats.avg.toFixed(0)} days`}
              subtext={`Range: ${leadTimeField.numericStats.min}-${leadTimeField.numericStats.max} days`}
              icon={TrendingUp}
              color="amber"
            />
          )}
        </div>
      </div>

      {/* Expanded Section */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-4 space-y-6">
          {/* Vendor Distribution */}
          {vendorField && vendorField.uniqueValues && vendorField.uniqueValues <= 20 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <PieChart className="h-4 w-4" />
                Vendor Distribution
              </h4>
              <VendorDistribution clientId={clientId} />
            </div>
          )}

          {/* All Custom Fields Table */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              All Custom Fields
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Field</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Type</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Coverage</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Values</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Aggregates</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((stat) => {
                    const Icon = getCategoryIcon(stat.category);
                    const coverage = stat.productCount > 0
                      ? Math.round((stat.nonNullCount / stat.productCount) * 100)
                      : 0;

                    return (
                      <tr key={stat.fieldName} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-gray-900">{stat.displayName}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {stat.dataType}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${coverage}%` }}
                              />
                            </div>
                            <span className="text-gray-600 w-10 text-right">{coverage}%</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {stat.uniqueValues?.toLocaleString() || '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {stat.numericStats ? (
                            <span title={`Sum: ${formatValue(stat.numericStats.sum, stat.fieldName)}`}>
                              Avg: {formatValue(stat.numericStats.avg, stat.fieldName)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// VENDOR DISTRIBUTION SUB-COMPONENT
// =============================================================================

type VendorDistributionItem = { value: string; count: number; percentage: number };

function VendorDistribution({ clientId }: { clientId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['custom-field-distribution', clientId, 'vendorName'],
    queryFn: async () => {
      const response = await api.get<{ data: VendorDistributionItem[] }>(`/clients/${clientId}/custom-field-distribution/vendorName`);
      return response.data;
    },
    enabled: !!clientId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-2">
        No vendor data available
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <DistributionBar items={data} total={total} />
  );
}

export default CustomDataInsightsWidget;
