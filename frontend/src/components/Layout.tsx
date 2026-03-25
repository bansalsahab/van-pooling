import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { useAuth } from "../state/auth";

interface LayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AppLayout({ title, subtitle, children }: LayoutProps) {
  const { user, logout } = useAuth();

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
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{user?.name}</strong>
            <span>{user?.role}</span>
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
