import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { usePortalAuthStore } from "@/stores/auth.store";
import { api } from "@/api/client";
import PortalLayout from "@/components/PortalLayout";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Orders from "@/pages/Orders";
import OrderRequest from "@/pages/OrderRequest";
import Alerts from "@/pages/Alerts";
import Settings from "@/pages/Settings";
import Reports from "@/pages/Reports";
import Analytics from "@/pages/Analytics";
import Feedback from "@/pages/Feedback";
import Help from "@/pages/Help";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = usePortalAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = usePortalAuthStore();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated } = usePortalAuthStore();

  // Refresh CSRF token on app initialization if user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      api.refreshCsrfToken();
    }
  }, [isAuthenticated]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <ResetPassword />
          </PublicRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <PortalLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="orders" element={<Orders />} />
        <Route path="order/new" element={<OrderRequest />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="reports" element={<Reports />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="help" element={<Help />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
