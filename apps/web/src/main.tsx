import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@inventory/ui';
import App from './App';
import './index.css';

// =============================================================================
// TANSTACK QUERY CONFIGURATION
// Optimized caching strategy for different data types
// =============================================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default: 5 minutes stale time for most data
      staleTime: 1000 * 60 * 5,
      // Cache for 30 minutes before garbage collection
      gcTime: 1000 * 60 * 30,
      // Retry failed requests twice with exponential backoff
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Don't refetch on window focus (reduces unnecessary requests)
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect automatically
      refetchOnReconnect: 'always',
    },
    mutations: {
      // Retry mutations once on network errors
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider variant="admin">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1F2937',
                color: '#F9FAFB',
                borderRadius: '8px',
              },
              success: {
                iconTheme: {
                  primary: '#10B981',
                  secondary: '#F9FAFB',
                },
              },
              error: {
                iconTheme: {
                  primary: '#DC2626',
                  secondary: '#F9FAFB',
                },
              },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
