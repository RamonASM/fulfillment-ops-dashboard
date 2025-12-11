import { ReactNode } from 'react';
import { LucideIcon, Package, FileQuestion, Search, Bell, Users, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>

      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>

      {description && (
        <p className="text-sm text-gray-500 max-w-sm mb-4">{description}</p>
      )}

      {action && (
        action.href ? (
          <Link
            to={action.href}
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            {action.label}
          </button>
        )
      )}

      {children}
    </div>
  );
}

// Pre-configured empty states
export function NoProductsEmpty({ clientId }: { clientId?: string }) {
  return (
    <EmptyState
      icon={Package}
      title="No products yet"
      description="Import your first inventory file to get started with tracking."
      action={{
        label: 'Import Products',
        href: clientId ? `/clients/${clientId}/import` : '/import',
      }}
    />
  );
}

export function NoAlertsEmpty() {
  return (
    <EmptyState
      icon={Bell}
      title="No alerts"
      description="You're all caught up! No inventory alerts at this time."
    />
  );
}

export function NoSearchResultsEmpty({ query }: { query: string }) {
  return (
    <EmptyState
      icon={Search}
      title="No results found"
      description={`No items match "${query}". Try a different search term.`}
    />
  );
}

export function NoClientsEmpty() {
  return (
    <EmptyState
      icon={Users}
      title="No clients assigned"
      description="You don't have any clients assigned to your account yet."
    />
  );
}

export function NoDataEmpty() {
  return (
    <EmptyState
      icon={BarChart3}
      title="No data available"
      description="There isn't enough data to display this view yet."
    />
  );
}

export function LoadingEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4" />
      <p className="text-sm text-gray-500">Loading...</p>
    </div>
  );
}

export function ErrorEmpty({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Something went wrong"
      description={message || 'Failed to load data. Please try again.'}
      action={onRetry ? { label: 'Try Again', onClick: onRetry } : undefined}
    />
  );
}
