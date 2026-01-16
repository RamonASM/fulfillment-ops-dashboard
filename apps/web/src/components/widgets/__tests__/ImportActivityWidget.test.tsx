/**
 * ImportActivityWidget Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ImportActivityWidget } from '../ImportActivityWidget';

// Mock the API client module at the correct path
vi.mock('../../../api/client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [
          {
            id: '1',
            clientId: 'client-1',
            filename: 'inventory.csv',
            importType: 'inventory',
            status: 'completed',
            rowCount: 100,
            processedCount: 100,
            errorCount: 0,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            client: { name: 'Test Client', code: 'TC' },
            user: { name: 'Test User' },
          },
        ],
      },
    }),
  },
}));

// Create a test query client
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  });
}

// Test wrapper with all required providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe('ImportActivityWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the widget title', async () => {
    render(
      <TestWrapper>
        <ImportActivityWidget />
      </TestWrapper>
    );

    expect(screen.getByText('Import Activity')).toBeInTheDocument();
  });

  it('displays loading skeleton initially', () => {
    render(
      <TestWrapper>
        <ImportActivityWidget />
      </TestWrapper>
    );

    // Loading state should show animated skeleton
    const loadingElement = document.querySelector('.animate-pulse');
    expect(loadingElement).toBeInTheDocument();
  });

  it('renders the Upload icon', () => {
    render(
      <TestWrapper>
        <ImportActivityWidget />
      </TestWrapper>
    );

    // Check for SVG icon in the header (uses text-primary-600)
    const svgIcon = document.querySelector('svg.lucide-upload');
    expect(svgIcon).toBeInTheDocument();
  });

  it('renders navigation link to imports page', async () => {
    render(
      <TestWrapper>
        <ImportActivityWidget />
      </TestWrapper>
    );

    // Should have a link to imports page
    const link = document.querySelector('a[href="/imports"]');
    expect(link).toBeInTheDocument();
  });

  it('accepts clientId prop', () => {
    render(
      <TestWrapper>
        <ImportActivityWidget clientId="test-client-id" />
      </TestWrapper>
    );

    expect(screen.getByText('Import Activity')).toBeInTheDocument();
  });

  it('accepts showClientName prop', () => {
    render(
      <TestWrapper>
        <ImportActivityWidget showClientName={true} />
      </TestWrapper>
    );

    expect(screen.getByText('Import Activity')).toBeInTheDocument();
  });

  it('accepts limit prop', () => {
    render(
      <TestWrapper>
        <ImportActivityWidget limit={5} />
      </TestWrapper>
    );

    expect(screen.getByText('Import Activity')).toBeInTheDocument();
  });

  it('accepts className prop', () => {
    const { container } = render(
      <TestWrapper>
        <ImportActivityWidget className="custom-class" />
      </TestWrapper>
    );

    const widget = container.querySelector('.custom-class');
    expect(widget).toBeInTheDocument();
  });
});
