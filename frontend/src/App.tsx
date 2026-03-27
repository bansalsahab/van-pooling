import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./state/auth";
import type { UserProfile } from "./lib/types";
import { AuthPage, defaultRoute } from "./pages/AuthPage";
import {
  EmployeeDashboard,
  EmployeeHistoryPage,
  EmployeeNotificationsPage,
} from "./pages/EmployeePage";
import { DriverDashboard, DriverNotificationsPage } from "./pages/DriverPage";
import { AdminDashboard, AdminNotificationsPage } from "./pages/AdminPage";

function ProtectedRoute({
  role,
  children,
}: {
  role: UserProfile["role"];
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (user.role !== role) {
    return <Navigate to={defaultRoute(user)} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="center-screen">Loading workspace...</div>;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={user ? <Navigate to={defaultRoute(user)} replace /> : <AuthPage />}
      />
      <Route
        path="/employee"
        element={
          <ProtectedRoute role="employee">
            <EmployeeDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee/history"
        element={
          <ProtectedRoute role="employee">
            <EmployeeHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee/notifications"
        element={
          <ProtectedRoute role="employee">
            <EmployeeNotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/driver"
        element={
          <ProtectedRoute role="driver">
            <DriverDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/driver/operations"
        element={
          <ProtectedRoute role="driver">
            <DriverDashboard operationsOnly />
          </ProtectedRoute>
        }
      />
      <Route
        path="/driver/notifications"
        element={
          <ProtectedRoute role="driver">
            <DriverNotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/fleet"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboard section="fleet" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/trips"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboard section="trips" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/notifications"
        element={
          <ProtectedRoute role="admin">
            <AdminNotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
