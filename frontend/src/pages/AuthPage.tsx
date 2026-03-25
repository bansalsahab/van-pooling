import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../state/auth";
import type { UserProfile } from "../lib/types";

function defaultRoute(user: UserProfile) {
  if (user.role === "employee") return "/employee";
  if (user.role === "driver") return "/driver";
  return "/admin";
}

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, user } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    company_domain: "",
    company_name: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate(defaultRoute(user), { replace: true });
    }
  }, [user, navigate, location.pathname]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone || undefined,
          company_domain: form.company_domain,
          company_name: form.company_name || undefined,
        });
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="hero-panel">
        <p className="eyebrow">Demand-Responsive Commuting</p>
        <h1>Move employees, drivers, and operators through one shared system.</h1>
        <p className="hero-copy">
          Book pooled rides, dispatch active vans, and monitor live service readiness
          from a single control surface.
        </p>
        <div className="hero-grid">
          <div className="metric-card accent">
            <span>Employee</span>
            <strong>Request and track pooled rides</strong>
          </div>
          <div className="metric-card">
            <span>Driver</span>
            <strong>Run pickups, dropoffs, and status updates</strong>
          </div>
          <div className="metric-card">
            <span>Admin</span>
            <strong>Watch vans, trips, and team demand live</strong>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="segment-control">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
            type="button"
          >
            Sign In
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
            type="button"
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              Full name
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Your full name"
                required
              />
            </label>
          )}

          <label>
            Work email
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="you@company.com"
                required
              />
            </label>

          <label>
            Password
              <input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="Enter your password"
                required
              />
            </label>

          {mode === "register" && (
            <>
              <label>
                Phone
                <input
                  value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
                  placeholder="+1 555 000 0000"
                />
              </label>

              <label>
                Company domain
                <input
                  value={form.company_domain}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      company_domain: event.target.value,
                    }))
                  }
                  placeholder="company.com"
                  required
                />
              </label>

              <label>
                Company name for new tenant
                <input
                  value={form.company_name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      company_name: event.target.value,
                    }))
                  }
                  placeholder="Your company name"
                />
              </label>
            </>
          )}

          {error && <div className="error-banner">{error}</div>}

          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Working..." : mode === "login" ? "Enter Workspace" : "Create Account"}
          </button>
        </form>
      </section>
    </div>
  );
}

export { defaultRoute };
