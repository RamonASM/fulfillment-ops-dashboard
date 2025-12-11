// =============================================================================
// ALERT BURNDOWN WIDGET (Phase 11)
// Chart showing alerts created vs resolved over time
// =============================================================================

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface AlertBurndownData {
  dates: string[];
  created: number[];
  resolved: number[];
  cumulative: number[];
}

interface AlertBurndownProps {
  data: AlertBurndownData;
  title?: string;
  height?: number;
}

export function AlertBurndown({
  data,
  title = 'Alert Burndown',
  height = 300,
}: AlertBurndownProps) {
  // Transform data for recharts
  const chartData = data.dates.map((date, index) => ({
    date,
    dateFormatted: format(parseISO(date), 'MMM d'),
    created: data.created[index],
    resolved: data.resolved[index],
    cumulative: data.cumulative[index],
    net: data.created[index] - data.resolved[index],
  }));

  // Calculate summary stats
  const totalCreated = data.created.reduce((sum, v) => sum + v, 0);
  const totalResolved = data.resolved.reduce((sum, v) => sum + v, 0);
  const resolutionRate = totalCreated > 0
    ? Math.round((totalResolved / totalCreated) * 100)
    : 0;
  const currentBacklog = data.cumulative[data.cumulative.length - 1] || 0;

  if (!data.dates || data.dates.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <p className="text-gray-500 text-center py-8">
          No alert data available
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-gray-500">Created:</span>{' '}
            <span className="font-medium text-gray-900">{totalCreated}</span>
          </div>
          <div>
            <span className="text-gray-500">Resolved:</span>{' '}
            <span className="font-medium text-emerald-600">{totalResolved}</span>
          </div>
          <div>
            <span className="text-gray-500">Resolution Rate:</span>{' '}
            <span className={`font-medium ${resolutionRate >= 80 ? 'text-emerald-600' : resolutionRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {resolutionRate}%
            </span>
          </div>
          <div>
            <span className="text-gray-500">Backlog:</span>{' '}
            <span className={`font-medium ${currentBacklog > 10 ? 'text-red-600' : currentBacklog > 5 ? 'text-amber-600' : 'text-gray-900'}`}>
              {currentBacklog}
            </span>
          </div>
        </div>
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="dateFormatted"
              tick={{ fontSize: 12, fill: '#6B7280' }}
              tickLine={false}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6B7280' }}
              tickLine={false}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  created: 'Created',
                  resolved: 'Resolved',
                  cumulative: 'Backlog',
                };
                return [value, labels[name] || name];
              }}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: '16px' }}
              formatter={(value) => {
                const labels: Record<string, string> = {
                  created: 'Created',
                  resolved: 'Resolved',
                  cumulative: 'Backlog',
                };
                return labels[value] || value;
              }}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              fill="#FEE2E2"
              stroke="#EF4444"
              strokeWidth={2}
              fillOpacity={0.3}
            />
            <Line
              type="monotone"
              dataKey="created"
              stroke="#F59E0B"
              strokeWidth={2}
              dot={{ fill: '#F59E0B', r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="resolved"
              stroke="#10B981"
              strokeWidth={2}
              dot={{ fill: '#10B981', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default AlertBurndown;
