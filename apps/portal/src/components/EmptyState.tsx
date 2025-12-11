import { ReactNode } from 'react';
import { LucideIcon, Package, FileQuestion, Search, Bell, ShoppingCart } from 'lucide-react';
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
            className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
          >
            {action.label}
          </button>
        )
      )}

      {children}
    </div>
  );
}

export function NoProductsEmpty() {
  return (
    <EmptyState
      icon={Package}
      title="No products available"
      description="Your inventory catalog will appear here once products are added."
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

export function NoOrdersEmpty() {
  return (
    <EmptyState
      icon={ShoppingCart}
      title="No orders yet"
      description="Your order history will appear here."
      action={{
        label: 'Browse Products',
        href: '/products',
      }}
    />
  );
}

export function LoadingEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
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
