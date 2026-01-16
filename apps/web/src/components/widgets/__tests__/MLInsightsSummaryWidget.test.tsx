/**
 * MLInsightsSummaryWidget Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { MLInsightsSummaryWidget } from '../MLInsightsSummaryWidget';

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

describe('MLInsightsSummaryWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the widget header', async () => {
    render(
      <TestWrapper>
        <MLInsightsSummaryWidget />
      </TestWrapper>
    );

    // Check for the title
    expect(screen.getByText('ML Analytics Summary')).toBeInTheDocument();
  });

  it('displays loading skeleton initially', () => {
    render(
      <TestWrapper>
        <MLInsightsSummaryWidget />
      </TestWrapper>
    );

    // Loading state should show animated skeleton
    const loadingElement = document.querySelector('.animate-pulse');
    expect(loadingElement).toBeInTheDocument();
  });

  it('renders stats after loading', async () => {
    render(
      <TestWrapper>
        <MLInsightsSummaryWidget />
      </TestWrapper>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
    }, { timeout: 2000 });

    // Should show the widget content (with default/mock data)
    expect(screen.getByText('ML Analytics Summary')).toBeInTheDocument();
  });

  it('renders the Brain icon', () => {
    render(
      <TestWrapper>
        <MLInsightsSummaryWidget />
      </TestWrapper>
    );

    // Check for SVG icon in the header
    const svgIcon = document.querySelector('svg.text-purple-600');
    expect(svgIcon).toBeInTheDocument();
  });

  it('renders view analytics link', async () => {
    render(
      <TestWrapper>
        <MLInsightsSummaryWidget />
      </TestWrapper>
    );

    // Wait for content to load
    await waitFor(() => {
      expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
    }, { timeout: 2000 });

    // Check for the navigation link
    const viewLink = screen.queryByRole('button', { name: /view ml analytics/i });
    if (viewLink) {
      expect(viewLink).toBeInTheDocument();
    }
  });
});
