import { ReactNode } from 'react';
import { LucideIcon, FileQuestion, Package, Bell, Search, BarChart3, Users, ShoppingCart } from 'lucide-react';
import { useTheme } from '../theme/index.js';

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
  /** Optional: Pass Link component from react-router-dom for routing support */
  LinkComponent?: React.ComponentType<{ to: string; className?: string; children: ReactNode }>;
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  children,
  LinkComponent,
}: EmptyStateProps) {
  const { classes } = useTheme();

  const buttonClasses = `inline-flex items-center px-4 py-2 ${classes.bgPrimary} text-white rounded-lg ${classes.bgPrimaryHover} transition-colors text-sm font-medium`;

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
        action.href && LinkComponent ? (
          <LinkComponent to={action.href} className={buttonClasses}>
            {action.label}
          </LinkComponent>
        ) : action.href ? (
          <a href={action.href} className={buttonClasses}>
            {action.label}
          </a>
        ) : (
          <button onClick={action.onClick} className={buttonClasses}>
            {action.label}
          </button>
        )
      )}

      {children}
    </div>
  );
}

// Pre-configured empty states
export function NoProductsEmpty({
  clientId,
  LinkComponent,
}: {
  clientId?: string;
  LinkComponent?: React.ComponentType<{ to: string; className?: string; children: ReactNode }>;
}) {
  return (
    <EmptyState
      icon={Package}
      title="No products yet"
      description="Import your first inventory file to get started with tracking."
      action={{
        label: 'Import Products',
        href: clientId ? `/clients/${clientId}/import` : '/import',
      }}
      LinkComponent={LinkComponent}
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

export function NoOrdersEmpty({
  LinkComponent,
}: {
  LinkComponent?: React.ComponentType<{ to: string; className?: string; children: ReactNode }>;
}) {
  return (
    <EmptyState
      icon={ShoppingCart}
      title="No orders yet"
      description="Your order history will appear here."
      action={{
        label: 'Browse Products',
        href: '/products',
      }}
      LinkComponent={LinkComponent}
    />
  );
}

export function LoadingEmpty() {
  const { classes } = useTheme();

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className={`w-12 h-12 border-4 ${classes.spinnerBorder} ${classes.spinnerBorderTop} rounded-full animate-spin mb-4`} />
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
