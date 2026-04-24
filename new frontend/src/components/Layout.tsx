import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../state/auth";

interface LayoutProps {
  title: string;
  subtitle: string;
  notificationUnreadCount?: number;
  pendingRequestCount?: number;
  children: ReactNode;
}

function notificationRouteForRole(role?: string | null) {
  if (role === "employee") return "/employee/notifications";
  if (role === "driver") return "/driver/notifications";
  if (role === "admin") return "/admin/notifications";
  return "/";
}

export function AppLayout({
  title,
  subtitle,
  notificationUnreadCount = 0,
  pendingRequestCount = 0,
  children,
}: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const notificationRoute = notificationRouteForRole(user?.role);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">VP</div>
          <div>
            <h1>Van Pooling</h1>
            <span className="tenant-badge">{user?.company_name || "Corporate Mobility"}</span>
          </div>
        </div>

        <nav className="nav-links">
          {user?.role === "employee" && (
            <>
              <p className="nav-section-title">Employee</p>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/employee">
                Ride Desk
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/employee/history"
              >
                Ride History
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/employee/addresses"
              >
                Saved Locations
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/employee/schedule"
              >
                Recurring Rides
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/employee/passes">
                Passes
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to={notificationRoute}>
                Notifications
                {notificationUnreadCount > 0 ? (
                  <span className="nav-count-badge" aria-label="New notifications">
                    {notificationUnreadCount}
                  </span>
                ) : null}
              </NavLink>
            </>
          )}

          {user?.role === "driver" && (
            <>
              <p className="nav-section-title">Driver</p>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/driver">
                Driver Console
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/driver/operations"
              >
                Trip Operations
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/driver/schedule">
                Shifts
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/driver/vehicle-checks"
              >
                Vehicle Checks
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to={notificationRoute}>
                Notifications
                {notificationUnreadCount > 0 ? (
                  <span className="nav-count-badge" aria-label="New notifications">
                    {notificationUnreadCount}
                  </span>
                ) : null}
              </NavLink>
            </>
          )}

          {user?.role === "admin" && (
            <>
              <p className="nav-section-title">Admin</p>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/admin">
                Operations
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/admin/fleet"
              >
                Fleet
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/admin/trips"
              >
                Trips
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/admin/requests"
              >
                Requests
                {pendingRequestCount > 0 ? (
                  <span className="nav-dot" aria-label="Pending requests" />
                ) : null}
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/admin/policy"
              >
                Policy
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/admin/users"
              >
                Users
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/admin/analytics"
              >
                Analytics
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/admin/zones"
              >
                Zones
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/admin/billing"
              >
                Billing
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to={notificationRoute}>
                Notifications
                {notificationUnreadCount > 0 ? (
                  <span className="nav-count-badge" aria-label="New notifications">
                    {notificationUnreadCount}
                  </span>
                ) : null}
              </NavLink>
            </>
          )}

          {user && (
            <>
              <p className="nav-section-title">Account</p>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/profile">
                Profile
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/help">
                Help
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{user?.name}</strong>
            <span>
              {user?.role}
              {user?.role === "admin" && user?.admin_scope ? ` - ${user.admin_scope}` : ""}
            </span>
          </div>
          {user?.role === "driver" && (
            <button
              className="secondary-button sos-button"
              onClick={() => navigate("/help")}
              type="button"
            >
              SOS / Report Issue
            </button>
          )}
          <button className="ghost-button" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="page-header">
          <div>
            <p className="eyebrow">Live Operations</p>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="page-header-actions" aria-label="Workspace status">
            <span className="header-status-pill">
              <span className="header-status-dot" />
              Live workspace
            </span>
            <span className="header-scope-pill">{user?.role || "workspace"}</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
