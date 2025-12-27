import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore, User } from "@/stores/auth.store";
import { AuthState } from "@inventory/shared/stores";
import { api } from "@/api/client";

type AuthStateUser = AuthState<User>;

// Layouts - keep eager loaded
import MainLayout from "@/components/layouts/MainLayout";
import AuthLayout from "@/components/layouts/AuthLayout";

// Core pages - eager loaded for fast initial navigation
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/auth/Login";
import Clients from "@/pages/Clients";
import Alerts from "@/pages/Alerts";

// Large pages - lazy loaded for better performance
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const Orders = lazy(() => import("@/pages/Orders"));

// Secondary pages - lazy loaded for smaller initial bundle
const ForgotPassword = lazy(() => import("@/pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const Reports = lazy(() => import("@/pages/Reports"));
const Settings = lazy(() => import("@/pages/Settings"));
const FeedbackAnalytics = lazy(() => import("@/pages/FeedbackAnalytics"));
const ClientLocations = lazy(() => import("@/pages/ClientLocations"));
const ClientAnalytics = lazy(() => import("@/pages/ClientAnalytics"));
const Imports = lazy(() => import("@/pages/Imports"));
const Help = lazy(() => import("@/pages/Help"));
const MLAnalytics = lazy(() => import("@/pages/MLAnalytics"));
const AnalyticsSettings = lazy(() => import("@/pages/admin/AnalyticsSettings"));
const OrphanReconciliation = lazy(() => import("@/pages/OrphanReconciliation"));

// Loading fallback for lazy-loaded pages
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
}

// Auth guard component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state: AuthStateUser) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state: AuthStateUser) => state.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const isAuthenticated = useAuthStore((state: AuthStateUser) => state.isAuthenticated);

  // Refresh CSRF token on app initialization if user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      api.refreshCsrfToken();
    }
  }, [isAuthenticated]);

  return (
    <Routes>
      {/* Auth routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AuthLayout>
              <Login />
            </AuthLayout>
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <AuthLayout>
              <Suspense fallback={<PageLoader />}>
                <ForgotPassword />
              </Suspense>
            </AuthLayout>
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <AuthLayout>
              <Suspense fallback={<PageLoader />}>
                <ResetPassword />
              </Suspense>
            </AuthLayout>
          </PublicRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:clientId" element={<Suspense fallback={<PageLoader />}><ClientDetail /></Suspense>} />
        <Route
          path="clients/:clientId/locations"
          element={<Suspense fallback={<PageLoader />}><ClientLocations /></Suspense>}
        />
        <Route
          path="clients/:clientId/analytics"
          element={<Suspense fallback={<PageLoader />}><ClientAnalytics /></Suspense>}
        />
        <Route
          path="clients/:clientId/orphans"
          element={<Suspense fallback={<PageLoader />}><OrphanReconciliation /></Suspense>}
        />
        <Route path="alerts" element={<Alerts />} />
        <Route path="orders" element={<Suspense fallback={<PageLoader />}><Orders /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<PageLoader />}><Reports /></Suspense>} />
        <Route path="ml-analytics" element={<Suspense fallback={<PageLoader />}><MLAnalytics /></Suspense>} />
        <Route path="feedback" element={<Suspense fallback={<PageLoader />}><FeedbackAnalytics /></Suspense>} />
        <Route path="imports" element={<Suspense fallback={<PageLoader />}><Imports /></Suspense>} />
        <Route path="help" element={<Suspense fallback={<PageLoader />}><Help /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
        <Route path="admin/analytics" element={<Suspense fallback={<PageLoader />}><AnalyticsSettings /></Suspense>} />
      </Route>

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
