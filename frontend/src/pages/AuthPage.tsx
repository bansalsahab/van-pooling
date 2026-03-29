import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { UserProfile } from "../lib/types";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

function defaultRoute(user: UserProfile) {
  if (user.role === "employee") return "/employee";
  if (user.role === "driver") return "/driver";
  return "/admin";
}

const ROLE_CONTENT: Record<
  UserProfile["role"],
  {
    eyebrow: string;
    cardTitle: string;
    cardDescription: string;
    formTitle: string;
    formDescription: string;
    loginEmailLabel: string;
    loginEmailPlaceholder: string;
    loginButton: string;
    registerButton: string;
  }
> = {
  employee: {
    eyebrow: "Employee",
    cardTitle: "Request and track pooled rides",
    cardDescription: "Book commute trips, monitor live vans, and stay updated on your ride.",
    formTitle: "Employee access",
    formDescription:
      "Sign in to request pooled rides, follow live vehicle updates, and manage your commute.",
    loginEmailLabel: "Employee email",
    loginEmailPlaceholder: "employee@company.com",
    loginButton: "Enter Employee Desk",
    registerButton: "Create Employee Account",
  },
  driver: {
    eyebrow: "Driver",
    cardTitle: "Run pickups, dropoffs, and status updates",
    cardDescription: "Open the driver console, share location, and complete assigned routes.",
    formTitle: "Driver access",
    formDescription:
      "Sign in to start trips, push vehicle location, and manage rider pickups.",
    loginEmailLabel: "Driver email",
    loginEmailPlaceholder: "driver@company.com",
    loginButton: "Enter Driver Console",
    registerButton: "Create Workspace Account",
  },
  admin: {
    eyebrow: "Admin",
    cardTitle: "Watch vans, trips, and team demand live",
    cardDescription:
      "Use the operations view to manage fleet readiness, trips, and dispatch.",
    formTitle: "Admin access",
    formDescription:
      "Sign in to oversee the fleet, trips, live demand, and company operations.",
    loginEmailLabel: "Admin email",
    loginEmailPlaceholder: "admin@company.com",
    loginButton: "Enter Command Center",
    registerButton: "Create Admin Workspace",
  },
};

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, user } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [selectedRole, setSelectedRole] = useState<UserProfile["role"]>("employee");
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
  const [enterpriseDomain, setEnterpriseDomain] = useState("");
  const [enterpriseBusy, setEnterpriseBusy] = useState(false);
  const [enterpriseError, setEnterpriseError] = useState<string | null>(null);
  const [enterpriseResult, setEnterpriseResult] = useState<{
    configured: boolean;
    guidance: string;
    redirectUrl?: string | null;
    companyName?: string;
  } | null>(null);

  useEffect(() => {
    if (user) {
      navigate(defaultRoute(user), { replace: true });
    }
  }, [user, navigate, location.pathname]);

  useEffect(() => {
    if (selectedRole === "driver" && mode === "register") {
      setMode("login");
    }
  }, [mode, selectedRole]);

  const selectedRoleContent = ROLE_CONTENT[selectedRole];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(form.email, form.password, selectedRole);
      } else {
        await register({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone || undefined,
          company_domain: form.company_domain,
          company_name:
            selectedRole === "admin" ? form.company_name || undefined : undefined,
          requested_role: selectedRole,
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

  async function handleEnterpriseStart(event: React.FormEvent) {
    event.preventDefault();
    setEnterpriseBusy(true);
    setEnterpriseError(null);
    setEnterpriseResult(null);
    try {
      const response = await api.startEnterpriseSso({
        company_domain: enterpriseDomain,
        requested_role: selectedRole,
        relay_state: `portal:${selectedRole}`,
      });
      setEnterpriseResult({
        configured: response.configured,
        guidance: response.guidance,
        redirectUrl: response.redirect_url,
        companyName: response.company_name,
      });
    } catch (ssoError) {
      setEnterpriseError(
        ssoError instanceof Error ? ssoError.message : "Could not start enterprise SSO.",
      );
    } finally {
      setEnterpriseBusy(false);
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
          {(Object.entries(ROLE_CONTENT) as Array<
            [UserProfile["role"], (typeof ROLE_CONTENT)[UserProfile["role"]]]
          >).map(([role, content]) => (
            <button
              className={`metric-card role-card ${selectedRole === role ? "selected" : ""}`}
              key={role}
              onClick={() => {
                setSelectedRole(role);
                setMode("login");
                setError(null);
              }}
              type="button"
            >
              <span>{content.eyebrow}</span>
              <strong>{content.cardTitle}</strong>
              <p>{content.cardDescription}</p>
            </button>
          ))}
        </div>
      </section>

      <section className={`auth-card auth-card-${selectedRole}`}>
        <div className="auth-role-header">
          <p className="eyebrow">{selectedRoleContent.eyebrow} Portal</p>
          <h2>{selectedRoleContent.formTitle}</h2>
          <p className="muted-copy">{selectedRoleContent.formDescription}</p>
        </div>

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
            disabled={selectedRole === "driver"}
            onClick={() => setMode("register")}
            type="button"
          >
            {selectedRole === "driver" ? "Admin setup only" : "Register"}
          </button>
        </div>

        {selectedRole === "driver" && (
          <div className="helper-box">
            Drivers are provisioned by admins. Use the driver card to sign in only with a driver
            account.
          </div>
        )}

        {selectedRole === "admin" && mode === "register" && (
          <div className="helper-box">
            Admin registration is only for bootstrapping a new company workspace. Existing company
            admin accounts should be created from the admin console.
          </div>
        )}

        <section className="helper-box">
          <p className="eyebrow">Enterprise SSO</p>
          <p className="muted-copy">
            Use your company domain to start SAML/OIDC sign-in when enterprise identity is enabled.
          </p>
          <form className="stack compact" onSubmit={handleEnterpriseStart}>
            <label>
              Company domain
              <input
                value={enterpriseDomain}
                onChange={(event) => setEnterpriseDomain(event.target.value)}
                placeholder="company.com"
                required
              />
            </label>
            <button className="secondary-button" disabled={enterpriseBusy} type="submit">
              {enterpriseBusy ? "Checking..." : "Continue with enterprise SSO"}
            </button>
          </form>
          {enterpriseError && <div className="error-banner">{enterpriseError}</div>}
          {enterpriseResult && (
            <div className="stack compact">
              <p className="muted-copy">
                {enterpriseResult.companyName ? `${enterpriseResult.companyName}: ` : ""}
                {enterpriseResult.guidance}
              </p>
              {enterpriseResult.configured && enterpriseResult.redirectUrl && (
                <a
                  className="text-link"
                  href={enterpriseResult.redirectUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open enterprise identity provider
                </a>
              )}
            </div>
          )}
        </section>

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
            {mode === "login" ? selectedRoleContent.loginEmailLabel : "Work email"}
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder={
                mode === "login"
                  ? selectedRoleContent.loginEmailPlaceholder
                  : "you@company.com"
              }
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
                {selectedRole === "admin" ? "New company domain" : "Company domain"}
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

              {selectedRole === "admin" && (
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
              )}
            </>
          )}

          {error && <div className="error-banner">{error}</div>}

          <button className="primary-button" disabled={busy} type="submit">
            {busy
              ? "Working..."
              : mode === "login"
                ? selectedRoleContent.loginButton
                : selectedRoleContent.registerButton}
          </button>
        </form>
      </section>
    </div>
  );
}

export { defaultRoute };
