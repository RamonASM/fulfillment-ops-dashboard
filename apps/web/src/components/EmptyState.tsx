/**
 * EmptyState Components - Re-export from shared UI library
 *
 * This file re-exports the shared empty state components for backward compatibility.
 * New code should import directly from '@inventory/ui'.
 */

// Re-export all empty state components from shared UI
export {
  EmptyState,
  NoAlertsEmpty,
  NoSearchResultsEmpty,
  NoClientsEmpty,
  NoDataEmpty,
  LoadingEmpty,
  ErrorEmpty,
} from '@inventory/ui';

// Import base component for wrapping with Link
import { NoProductsEmpty as SharedNoProductsEmpty } from '@inventory/ui';
import { Link } from 'react-router-dom';
import { ReactNode } from 'react';

// Wrapper type for Link component
type LinkComponent = React.ComponentType<{ to: string; className?: string; children: ReactNode }>;

export function NoProductsEmpty({ clientId }: { clientId?: string }) {
  return (
    <SharedNoProductsEmpty clientId={clientId} LinkComponent={Link as LinkComponent} />
  );
}
