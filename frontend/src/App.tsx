import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { useAuth } from "./state/auth";
import type { UserProfile } from "./lib/types";
import { SwissLandingPage as AuthPage, defaultRoute } from "./pages/SwissLandingPage";
import { AdminAnalyticsPage } from "./pages/admin/AnalyticsPage";
import { AdminBillingPage } from "./pages/admin/BillingPage";
import { AdminFleetPage } from "./pages/admin/FleetPage";
import { AdminNotificationsPage } from "./pages/admin/NotificationsPage";
import { AdminOverviewPage } from "./pages/admin/OverviewPage";
import { AdminPolicyPage } from "./pages/admin/PolicyPage";
import { AdminRequestsPage } from "./pages/admin/RequestsPage";
import { AdminTripsPage } from "./pages/admin/TripsPage";
import { AdminUsersPage } from "./pages/admin/UsersPage";
import { AdminZonesPage } from "./pages/admin/ZonesPage";
import { HelpPage } from "./pages/common/HelpPage";
import { ProfilePage } from "./pages/common/ProfilePage";
import { DriverDashboardPage } from "./pages/driver/DashboardPage";
import { DriverNotificationsPage } from "./pages/driver/NotificationsPage";
import { DriverOperationsPage } from "./pages/driver/OperationsPage";
import { DriverSchedulePage } from "./pages/driver/SchedulePage";
import { DriverVehicleChecksPage } from "./pages/driver/VehicleChecksPage";
import { EmployeeAddressesPage } from "./pages/employee/AddressesPage";
import { EmployeeDashboardPage } from "./pages/employee/DashboardPage";
import { EmployeeHistoryPage } from "./pages/employee/HistoryPage";
import { EmployeeNotificationsPage } from "./pages/employee/NotificationsPage";
import { EmployeePassesPage } from "./pages/employee/PassesPage";
import { EmployeeSchedulePage } from "./pages/employee/SchedulePage";
import { PublicInfoPage } from "./pages/public/PublicInfoPage";
import { PUBLIC_ROUTE_CONFIG } from "./pages/public/content";

function AuthenticatedRoute() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function RoleRoute({ role }: { role: UserProfile["role"] }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (user.role !== role) {
    return <Navigate to={defaultRoute(user)} replace />;
  }
  return <Outlet />;
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
      {PUBLIC_ROUTE_CONFIG.map((publicRoute) => (
        <Route
          key={publicRoute.path}
          path={publicRoute.path}
          element={<PublicInfoPage pageKey={publicRoute.pageKey} />}
        />
      ))}
      <Route element={<AuthenticatedRoute />}>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/help" element={<HelpPage />} />
      </Route>

      <Route path="/employee" element={<RoleRoute role="employee" />}>
        <Route index element={<EmployeeDashboardPage />} />
        <Route path="history" element={<EmployeeHistoryPage />} />
        <Route path="notifications" element={<EmployeeNotificationsPage />} />
        <Route path="addresses" element={<EmployeeAddressesPage />} />
        <Route path="passes" element={<EmployeePassesPage />} />
        <Route path="schedule" element={<EmployeeSchedulePage />} />
      </Route>

      <Route path="/driver" element={<RoleRoute role="driver" />}>
        <Route index element={<DriverDashboardPage />} />
        <Route path="operations" element={<DriverOperationsPage />} />
        <Route path="notifications" element={<DriverNotificationsPage />} />
        <Route path="schedule" element={<DriverSchedulePage />} />
        <Route path="vehicle-checks" element={<DriverVehicleChecksPage />} />
      </Route>

      <Route path="/admin" element={<RoleRoute role="admin" />}>
        <Route index element={<AdminOverviewPage />} />
        <Route path="fleet" element={<AdminFleetPage />} />
        <Route path="trips" element={<AdminTripsPage />} />
        <Route path="requests" element={<AdminRequestsPage />} />
        <Route path="policy" element={<AdminPolicyPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="zones" element={<AdminZonesPage />} />
        <Route path="billing" element={<AdminBillingPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
