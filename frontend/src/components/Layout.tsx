import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

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
  const notificationRoute = notificationRouteForRole(user?.role);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">VP</div>
          <div>
            <h1>Van Pooling</h1>
            <p>{user?.company_name || "Corporate Mobility"}</p>
          </div>
        </div>

        <nav className="nav-links">
          {user?.role === "employee" && (
            <>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/employee">
                Ride Desk
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/employee/history"
              >
                Ride History
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to={notificationRoute}>
                Notifications
                {notificationUnreadCount > 0 ? <span className="nav-dot" aria-label="New notifications" /> : null}
              </NavLink>
            </>
          )}
          {user?.role === "driver" && (
            <>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to="/driver">
                Driver Console
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                to="/driver/operations"
              >
                Trip Operations
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to={notificationRoute}>
                Notifications
                {notificationUnreadCount > 0 ? <span className="nav-dot" aria-label="New notifications" /> : null}
              </NavLink>
            </>
          )}
          {user?.role === "admin" && (
            <>
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
              <NavLink className={({ isActive }) => (isActive ? "active" : "")} to={notificationRoute}>
                Notifications
                {notificationUnreadCount > 0 ? <span className="nav-dot" aria-label="New notifications" /> : null}
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{user?.name}</strong>
            <span>
              {user?.role}
              {user?.role === "admin" && user?.admin_scope ? ` · ${user.admin_scope}` : ""}
            </span>
          </div>
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
        </header>
        {children}
      </main>
    </div>
  );
}
