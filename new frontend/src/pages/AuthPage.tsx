import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { api } from "../lib/api";
import type { UserProfile } from "../lib/types";
import { useAuth } from "../state/auth";
import { LANDING_FOOTER_COLUMNS, PUBLIC_SOCIAL_LINKS } from "./public/content";

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
    cardDescription: "Book commute trips and follow your assigned van in realtime.",
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
    cardDescription: "Open the driver console and execute assigned route operations.",
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
    cardDescription: "Run dispatch control from one command center for your company.",
    formTitle: "Admin access",
    formDescription:
      "Sign in to oversee the fleet, trips, live demand, and company operations.",
    loginEmailLabel: "Admin email",
    loginEmailPlaceholder: "admin@company.com",
    loginButton: "Enter Command Center",
    registerButton: "Create Admin Workspace",
  },
};

const TRUSTED_TEAMS = [
  "Acme Mobility",
  "Northstar Labs",
  "Orbit Tech",
  "Bluepeak Systems",
];

const PROBLEM_CARDS = [
  {
    icon: "clock",
    title: "Fixed routes, empty seats",
    description: "Scheduled shuttles run whether 2 or 20 people need them.",
  },
  {
    icon: "visibility",
    title: "No realtime visibility",
    description:
      "Employees do not know when the van will arrive. Admins do not know where it is.",
  },
  {
    icon: "manual",
    title: "Manual dispatch overload",
    description:
      "Operations teams spend hours coordinating what software should handle automatically.",
  },
];

const HOW_IT_WORKS = [
  {
    role: "EMPLOYEE",
    title: "Request",
    description:
      "Employee opens the app, requests a ride to campus, and the system groups nearby commuters.",
  },
  {
    role: "SYSTEM",
    title: "Match and optimize",
    description:
      "Matcher assigns the nearest van, optimizes pickup sequence, and notifies the driver instantly.",
  },
  {
    role: "ADMIN",
    title: "Supervise and intervene",
    description:
      "Ops team monitors the fleet map, gets delay alerts, and can reassign trips in one tap.",
  },
];

const ROLE_FEATURES = [
  {
    key: "employee",
    role: "Employee",
    title: "Rider experience",
    emphasized: false,
    badge: "",
    features: [
      "Book immediate or scheduled rides",
      "Live van tracking on map",
      "Realtime ETA notifications",
      "Ride history and receipts",
      "Cancel before pickup",
    ],
  },
  {
    key: "driver",
    role: "Driver",
    title: "Execution console",
    emphasized: false,
    badge: "",
    features: [
      "Optimized pickup sequence",
      "Turn-by-turn stop navigation",
      "One-tap pickup and dropoff confirmation",
      "Exception reporting for no-show and delay",
      "Live location sharing",
    ],
  },
  {
    key: "admin",
    role: "Admin",
    title: "Operations command",
    emphasized: true,
    badge: "For fleet admins",
    features: [
      "Live fleet operations map",
      "Demand heatmap by time and zone",
      "Manual dispatch and reassignment",
      "Stale van and delay alerts",
      "Cost-per-ride analytics and exports",
    ],
  },
];

const PRICING_PLANS = [
  {
    name: "Starter",
    highlighted: false,
    details: "Up to 2 vans, 50 employees, basic pooling, email support",
    cta: "Get Started",
    features: [
      "Basic dispatch board",
      "Realtime rider updates",
      "Email-only support",
      "Weekly usage export",
    ],
  },
  {
    name: "Growth",
    highlighted: true,
    details: "Up to 10 vans, 500 employees, scheduled rides, SSO, analytics",
    cta: "Get Started",
    features: [
      "Scheduled ride automation",
      "Enterprise SSO support",
      "Advanced demand analytics",
      "Priority support desk",
    ],
  },
  {
    name: "Enterprise",
    highlighted: false,
    details: "Unlimited vans, custom SLA, dedicated support, API access, white-label",
    cta: "Contact Sales",
    features: [
      "Custom SLA + onboarding",
      "API and integrations",
      "White-label workspace",
      "Dedicated success manager",
    ],
  },
];

const FAQ_ITEMS = [
  {
    question: "How is this different from a fixed shuttle system?",
    answer:
      "Fixed routes run regardless of demand; Van Pooling matches live demand to live capacity in minutes.",
  },
  {
    question: "Can employees use this without installing an app?",
    answer:
      "Yes. Riders can request, track, and manage trips from a secure browser workflow.",
  },
  {
    question: "How does the matching engine decide who rides together?",
    answer:
      "It scores nearby vans by pickup distance, destination overlap, detour cost, and live readiness.",
  },
  {
    question: "Is our employee data kept private from other companies?",
    answer:
      "Yes. Every query and event is tenant-scoped, so one company never sees another company's data.",
  },
  {
    question: "What happens if a van breaks down mid-route?",
    answer:
      "Ops gets an immediate alert and can reassign riders while notifying employees and drivers in realtime.",
  },
  {
    question: "Can we integrate with our existing HR system?",
    answer:
      "Yes. Enterprise plans support identity and provisioning integrations with existing HR and IT systems.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "We replaced static shuttle spreadsheets with one live board and cut commute confusion in two weeks.",
    name: "Ariana Moore",
    role: "Head of Facilities",
    company: "Acme Corp",
  },
  {
    quote:
      "Dispatch finally works with live demand instead of guesswork. Our team handles more riders with fewer manual calls.",
    name: "Rahul Menon",
    role: "Mobility Operations Lead",
    company: "Northstar Labs",
  },
  {
    quote:
      "Driver adherence improved because pickups, alerts, and ETAs are all in one place with clear next actions.",
    name: "Daniel Shaw",
    role: "Fleet Program Manager",
    company: "Orbit Tech",
  },
];

const SECURITY_BADGES = [
  "SOC 2 In Progress",
  "GDPR Ready",
  "Data Encrypted at Rest",
  "Multi-tenant Isolated",
];

const LANDING_SECTIONS = [
  "features",
  "how-it-works",
  "platform-preview",
  "pricing",
  "contact",
] as const;

function RoleGlyph({ role }: { role: UserProfile["role"] }) {
  if (role === "employee") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="8.2" r="3.2" />
        <path d="M5.5 19.2c.7-3 3.2-4.8 6.5-4.8s5.8 1.8 6.5 4.8" />
      </svg>
    );
  }
  if (role === "driver") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="5.8" />
        <circle cx="12" cy="12" r="1.8" />
        <path d="M12 6.2v3.2M12 14.6v3.2M6.2 12h3.2M14.6 12h3.2" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="4.5" y="4.5" width="6.2" height="6.2" rx="1.1" />
      <rect x="13.3" y="4.5" width="6.2" height="6.2" rx="1.1" />
      <rect x="4.5" y="13.3" width="6.2" height="6.2" rx="1.1" />
      <rect x="13.3" y="13.3" width="6.2" height="6.2" rx="1.1" />
    </svg>
  );
}

function ProblemGlyph({ kind }: { kind: "clock" | "visibility" | "manual" }) {
  if (kind === "clock") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.8v4.7l3 1.9" />
      </svg>
    );
  }
  if (kind === "visibility") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M3.3 12c2-3.4 5.2-5.2 8.7-5.2s6.7 1.8 8.7 5.2c-2 3.4-5.2 5.2-8.7 5.2S5.3 15.4 3.3 12Z" />
        <path d="M4.8 19.2 19.2 4.8" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="8" cy="8" r="2.8" />
      <path d="M3.9 19.2c.5-2.5 2.5-4.3 5.1-4.3s4.6 1.8 5.1 4.3" />
      <path d="M16.3 7.3h3.8M16.3 12h3.8M16.3 16.7h3.8" />
    </svg>
  );
}

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, user } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [selectedRole, setSelectedRole] = useState<UserProfile["role"]>("employee");
  const [authOpen, setAuthOpen] = useState(false);
  const [navbarScrolled, setNavbarScrolled] = useState(false);
  const [activeSection, setActiveSection] =
    useState<(typeof LANDING_SECTIONS)[number]>("features");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [liveTrips, setLiveTrips] = useState(24);
  const [previewHeatmapOn, setPreviewHeatmapOn] = useState(true);
  const [statsVisible, setStatsVisible] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [pageLoadProgress, setPageLoadProgress] = useState(0);
  const [pageLoadDone, setPageLoadDone] = useState(false);
  const [stats, setStats] = useState({
    waitMinutes: 0,
    emptySeatReduction: 0,
    roles: 0,
    uptime: 0,
  });
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

  const selectedRoleContent = ROLE_CONTENT[selectedRole];

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

  useEffect(() => {
    const handleScroll = () => {
      setNavbarScrolled(window.scrollY > 80);
      setShowBackToTop(window.scrollY > 400);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const hasWindow = typeof window !== "undefined";
    if (!hasWindow) return;
    const start = performance.now();
    const durationMs = 900;
    let rafId = 0;
    const tick = (timestamp: number) => {
      const progress = Math.min((timestamp - start) / durationMs, 1);
      setPageLoadProgress(progress * 100);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        window.setTimeout(() => setPageLoadDone(true), 260);
      }
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }
    const sectionNodes = LANDING_SECTIONS.map((id) => document.getElementById(id)).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
    if (!sectionNodes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id as (typeof LANDING_SECTIONS)[number];
            setActiveSection(id);
          }
        });
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: 0.2 },
    );
    sectionNodes.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLiveTrips((current) => {
        if (current >= 26) return 22;
        return current + 1;
      });
    }, 1600);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".reveal-on-scroll"));
    if (!nodes.length) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const target = document.getElementById("stats-section");
    if (!target) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setStatsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setStatsVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.35 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!statsVisible) return;
    let animationFrameId = 0;
    const start = performance.now();
    const durationMs = 1500;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      setStats({
        waitMinutes: 8 * progress,
        emptySeatReduction: 40 * progress,
        roles: 3 * progress,
        uptime: 99.5 * progress,
      });
      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(animate);
      }
    };
    animationFrameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [statsVisible]);

  function openAuth(role?: UserProfile["role"], nextMode: "login" | "register" = "login") {
    if (role) setSelectedRole(role);
    setMode(nextMode);
    setMobileMenuOpen(false);
    setError(null);
    setEnterpriseError(null);
    setAuthOpen(true);
  }

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
    <div className="landing-root">
      <div
        className={`landing-page-loader ${pageLoadDone ? "done" : ""}`}
        style={{ width: `${pageLoadProgress}%` }}
      />
      <header className={`landing-navbar ${navbarScrolled ? "is-scrolled" : ""}`}>
        <a className="landing-brand" href="#top">
          <span className="landing-brand-icon">VP</span>
          <span className="landing-brand-name">Van Pooling Platform</span>
        </a>
        <nav className="landing-nav-links">
          <a
            className={activeSection === "features" ? "active" : ""}
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
          >
            Features
          </a>
          <a
            className={activeSection === "how-it-works" ? "active" : ""}
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
          >
            How it Works
          </a>
          <a
            className={activeSection === "platform-preview" ? "active" : ""}
            href="#platform-preview"
            onClick={() => setMobileMenuOpen(false)}
          >
            For Companies
          </a>
          <a
            className={activeSection === "pricing" ? "active" : ""}
            href="#pricing"
            onClick={() => setMobileMenuOpen(false)}
          >
            Pricing
          </a>
          <a
            className={activeSection === "contact" ? "active" : ""}
            href="#contact"
            onClick={() => setMobileMenuOpen(false)}
          >
            Contact
          </a>
        </nav>
        <div className="landing-nav-ctas">
          <a className="ghost-button" href="#final-cta">
            Request Demo
          </a>
          <button
            className="primary-button"
            onClick={() => openAuth(selectedRole, "login")}
            type="button"
          >
            Sign In
          </button>
          <button
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle menu"
            className={`landing-menu-toggle ${mobileMenuOpen ? "open" : ""}`}
            onClick={() => setMobileMenuOpen((value) => !value)}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>
      <div className={`landing-mobile-menu ${mobileMenuOpen ? "open" : ""}`}>
        <a href="#features" onClick={() => setMobileMenuOpen(false)}>
          Features
        </a>
        <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>
          How it Works
        </a>
        <a href="#platform-preview" onClick={() => setMobileMenuOpen(false)}>
          For Companies
        </a>
        <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>
          Pricing
        </a>
        <a href="#contact" onClick={() => setMobileMenuOpen(false)}>
          Contact
        </a>
      </div>

      <main id="top">
        <section className="landing-hero">
          <div className="landing-hero-copy reveal-on-scroll">
            <p className="eyebrow">Demand-responsive commuting</p>
            <h1 className="landing-headline">
              Move <span className="headline-word delay-1">employees</span>,{" "}
              <span className="headline-word delay-2">drivers</span>, and{" "}
              <span className="headline-word delay-3">operators</span> through one shared system.
            </h1>
            <p className="hero-copy">
              Replace fixed shuttle schedules with demand-responsive pooling. One platform for every
              role in your fleet.
            </p>
            <div className="landing-hero-actions">
              <button
                className="primary-button"
                onClick={() => openAuth("employee", "register")}
                type="button"
              >
                Get Started Free
              </button>
              <a className="secondary-button" href="#platform-preview">
                Watch 2-min Demo
              </a>
            </div>
            <div className="landing-trust-row">
              <span>Trusted by teams at</span>
              {TRUSTED_TEAMS.map((team) => (
                <span className="trust-pill" key={team}>
                  {team}
                </span>
              ))}
            </div>
            <div className="landing-role-cards">
              {(Object.entries(ROLE_CONTENT) as Array<
                [UserProfile["role"], (typeof ROLE_CONTENT)[UserProfile["role"]]]
              >).map(([role, content]) => (
                <button
                  className={`landing-role-card role-${role} ${role === "admin" ? "admin" : ""} ${
                    selectedRole === role ? "active" : ""
                  } reveal-on-scroll stagger-item`}
                  key={role}
                  onClick={() => openAuth(role, "login")}
                  style={
                    {
                      "--stagger-index": String(Object.keys(ROLE_CONTENT).indexOf(role)),
                    } as React.CSSProperties
                  }
                  type="button"
                >
                  <div className="landing-role-header">
                    <span className="role-card-icon">
                      <RoleGlyph role={role} />
                    </span>
                    <span>{content.eyebrow}</span>
                  </div>
                  <strong>{content.cardTitle}</strong>
                  <p>{content.cardDescription}</p>
                  <span className="role-card-cta">Open {content.eyebrow} portal -&gt;</span>
                </button>
              ))}
            </div>
          </div>

          <div className="landing-hero-visual reveal-on-scroll">
            <article className="ops-browser">
              <div className="ops-browser-top">
                <span className="browser-dot" />
                <span className="browser-dot" />
                <span className="browser-dot" />
                <span className="browser-title">Operations command preview</span>
              </div>
              <div className="ops-browser-content">
                <div className="ops-mini-map">
                  <div className="map-heatmap" />
                  <div className="map-grid" />
                  <svg
                    aria-hidden="true"
                    className="map-routes"
                    fill="none"
                    viewBox="0 0 100 100"
                  >
                    <path className="route-path route-a" d="M22 72 C 30 52, 40 42, 58 36" />
                    <path className="route-path route-b" d="M32 19 C 44 22, 56 30, 76 40" />
                    <path className="route-path route-c" d="M58 64 C 66 54, 70 46, 76 40" />
                  </svg>
                  <span className="van-dot dot-a" />
                  <span className="van-dot dot-b" />
                  <span className="van-dot dot-c stale" />
                  <span className="van-dot dot-d" />
                  <div className="map-legend">
                    <span>Vans live</span>
                    <strong>14 online</strong>
                  </div>
                </div>
                <div className="ops-side-metrics">
                  <article>
                    <p>Live trips</p>
                    <strong>{liveTrips}</strong>
                  </article>
                  <article>
                    <p>Open alerts</p>
                    <strong>3</strong>
                  </article>
                  <article>
                    <p>Demand index</p>
                    <strong>1.26</strong>
                  </article>
                </div>
              </div>
            </article>
            <div className="hero-login-hint">
              <p className="muted-copy">
                Use role cards or the Sign In button to open your workspace login.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-section reveal-on-scroll" id="problem">
          <div className="section-title-wrap">
            <p className="eyebrow">Problem statement</p>
            <h2>The old way is broken</h2>
          </div>
          <div className="landing-card-grid three">
            {PROBLEM_CARDS.map((card, index) => (
              <article
                className="landing-card problem-card reveal-on-scroll stagger-item"
                key={card.title}
                style={{ "--stagger-index": String(index) } as React.CSSProperties}
              >
                <span className="problem-icon">
                  <ProblemGlyph kind={card.icon as "clock" | "visibility" | "manual"} />
                </span>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section reveal-on-scroll" id="how-it-works">
          <div className="section-title-wrap">
            <p className="eyebrow">How it works</p>
            <h2>One loop connecting demand, dispatch, and execution</h2>
          </div>
          <div className="how-it-works-grid">
            {HOW_IT_WORKS.map((step, index) => (
              <article
                className="how-step reveal-on-scroll stagger-item"
                key={step.title}
                style={{ "--stagger-index": String(index) } as React.CSSProperties}
              >
                <span className="how-role">{step.role}</span>
                <div className="how-badge">{index + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section demo-section reveal-on-scroll" id="demo">
          <div className="section-title-wrap">
            <p className="eyebrow">Product demo</p>
            <h2>Watch one ride move from request to dispatch in seconds</h2>
          </div>
          <article className="demo-frame">
            <div className="demo-lane">
              <div
                className="demo-node reveal-on-scroll stagger-item"
                style={{ "--stagger-index": "0" } as React.CSSProperties}
              >
                <span>1</span>
                <strong>Employee requests ride</strong>
                <p>Pickup and destination are added instantly.</p>
              </div>
              <div
                className="demo-node reveal-on-scroll stagger-item"
                style={{ "--stagger-index": "1" } as React.CSSProperties}
              >
                <span>2</span>
                <strong>Matcher builds trip</strong>
                <p>Nearest eligible van receives optimized stop order.</p>
              </div>
              <div
                className="demo-node reveal-on-scroll stagger-item"
                style={{ "--stagger-index": "2" } as React.CSSProperties}
              >
                <span>3</span>
                <strong>Driver accepts and moves</strong>
                <p>Admin and rider both see live progress updates.</p>
              </div>
            </div>
            <div className="demo-map">
              <div className="demo-map-heat" />
              <span className="demo-ping start">Request</span>
              <span className="demo-ping middle">Matched</span>
              <span className="demo-ping end">Driver en route</span>
              <div className="demo-route" />
            </div>
          </article>
        </section>

        <section className="landing-section reveal-on-scroll" id="features">
          <div className="section-title-wrap">
            <p className="eyebrow">Role capabilities</p>
            <h2>Built for every person in your transport operation</h2>
          </div>
          <div className="landing-card-grid three role-feature-grid">
            {ROLE_FEATURES.map((role, index) => (
              <article
                className={`landing-card role-feature-card reveal-on-scroll stagger-item ${
                  role.emphasized ? "highlight" : ""
                }`}
                key={role.role}
                style={{ "--stagger-index": String(index) } as React.CSSProperties}
              >
                {role.badge ? <span className="role-feature-badge">{role.badge}</span> : null}
                <span className="eyebrow">{role.role}</span>
                <h3>{role.title}</h3>
                <ul>
                  {role.features.map((feature) => (
                    <li key={feature}>
                      <span className={`feature-check ${role.key}`} aria-hidden="true">
                        &#10003;
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section
          className="landing-section platform-preview reveal-on-scroll"
          id="platform-preview"
        >
          <div className="section-title-wrap">
            <p className="eyebrow">Live platform preview</p>
            <h2>The operations view your team has been missing</h2>
          </div>
          <article className="preview-browser-frame">
            <div className="preview-browser-top">
              <span className="browser-dot" />
              <span className="browser-dot" />
              <span className="browser-dot" />
              <span className="preview-url">app.vanpooling.io/admin/live-ops</span>
            </div>
            <div className="preview-frame">
              <div className="preview-map-pane">
                <div className="preview-map-grid" />
                <div className={`preview-heatmap ${previewHeatmapOn ? "active" : ""}`} />
                <span className="preview-van enroute">Van 1</span>
                <span className="preview-van idle">Van 2</span>
                <span className="preview-van stale">Van 3</span>
                <span className="preview-van enroute second">Van 4</span>
                <button
                  className="secondary-button preview-toggle"
                  onClick={() => setPreviewHeatmapOn((value) => !value)}
                  type="button"
                >
                  Demand heatmap: {previewHeatmapOn ? "On" : "Off"}
                </button>
                <div className="preview-status-legend">
                  <span>
                    <i className="status-dot active" />
                    Active
                  </span>
                  <span>
                    <i className="status-dot idle" />
                    Idle
                  </span>
                  <span>
                    <i className="status-dot stale" />
                    Stale
                  </span>
                </div>
              </div>
              <div className="preview-side-pane">
                <section className="preview-list">
                  <h3>Active trips</h3>
                  <article>
                    <strong>Trip TR-2041</strong>
                    <p>4 riders onboard</p>
                  </article>
                  <article>
                    <strong>Trip TR-2053</strong>
                    <p>2 pickups pending</p>
                  </article>
                </section>
                <section className="preview-alert stale-pulse">
                  <p className="eyebrow">Alert</p>
                  <strong>Van #3 - stale GPS</strong>
                  <p>Last seen 4 min ago</p>
                </section>
              </div>
            </div>
          </article>
          <div className="section-inline-cta">
            <a className="primary-button" href="#final-cta">
              See full demo
            </a>
          </div>
        </section>

        <section className="landing-section stats-section reveal-on-scroll" id="stats-section">
          <div className="landing-card-grid four">
            <article className="landing-card stat-card wait">
              <strong>&lt; {stats.waitMinutes.toFixed(1)} min</strong>
              <p>average employee wait time</p>
            </article>
            <article className="landing-card stat-card efficiency">
              <strong>{stats.emptySeatReduction.toFixed(0)}%</strong>
              <p>reduction in empty seats</p>
            </article>
            <article className="landing-card stat-card roles">
              <strong>{stats.roles.toFixed(0)} roles</strong>
              <p>one platform, low coordination overhead</p>
            </article>
            <article className="landing-card stat-card uptime">
              <strong>{stats.uptime.toFixed(1)}%</strong>
              <p>platform uptime target</p>
            </article>
          </div>
        </section>

        <section className="landing-section reveal-on-scroll" id="pricing">
          <div className="section-title-wrap">
            <p className="eyebrow">Pricing</p>
            <h2>Plans for every fleet maturity stage</h2>
          </div>
          <div className="landing-card-grid three pricing-grid">
            {PRICING_PLANS.map((plan, index) => (
              <article
                className={`landing-card pricing-card reveal-on-scroll stagger-item ${
                  plan.highlighted ? "highlight growth" : ""
                }`}
                key={plan.name}
                style={{ "--stagger-index": String(index) } as React.CSSProperties}
              >
                {plan.highlighted && <span className="pricing-tag">Most Popular</span>}
                <h3>{plan.name}</h3>
                <p>{plan.details}</p>
                <ul className="pricing-feature-list">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <span aria-hidden="true">&#10003;</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={plan.highlighted ? "primary-button" : "secondary-button"}
                  type="button"
                >
                  {plan.cta}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section testimonial-section reveal-on-scroll" id="testimonials">
          <div className="section-title-wrap">
            <p className="eyebrow">Testimonials</p>
            <h2>Trusted by real operations teams</h2>
          </div>
          <div className="landing-card-grid three">
            {TESTIMONIALS.map((item, index) => (
              <article
                className="landing-card testimonial-card reveal-on-scroll stagger-item"
                key={item.name}
                style={{ "--stagger-index": String(index) } as React.CSSProperties}
              >
                <p className="testimonial-quote">"{item.quote}"</p>
                <strong>{item.name}</strong>
                <span>
                  {item.role}, {item.company}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section reveal-on-scroll" id="faq">
          <div className="section-title-wrap">
            <p className="eyebrow">FAQ</p>
            <h2>Answers for operations, IT, and mobility teams</h2>
          </div>
          <div className="faq-list">
            {FAQ_ITEMS.map((item, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <article className={`faq-item ${isOpen ? "open" : ""}`} key={item.question}>
                  <button
                    className="faq-question"
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    type="button"
                  >
                    <span>{item.question}</span>
                    <span>{isOpen ? "-" : "+"}</span>
                  </button>
                  <div className={`faq-answer-wrap ${isOpen ? "open" : ""}`}>
                    <p className="faq-answer">{item.answer}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

      </main>

      <footer className="landing-footer" id="contact">
        <section className="final-cta reveal-on-scroll" id="final-cta">
          <div className="cta-route-lines" />
          <div className="cta-content">
            <h2>Ready to replace your shuttle schedule?</h2>
            <div className="landing-hero-actions">
              <Link className="primary-button" to="/contact">
                Request a Demo
              </Link>
              <Link className="secondary-button" to="/contact">
                Talk to Sales
              </Link>
            </div>
          </div>
        </section>
        <section className="landing-security-bar reveal-on-scroll">
          {SECURITY_BADGES.map((badge) => (
            <span className="security-pill" key={badge}>
              {badge}
            </span>
          ))}
        </section>
        <div className="footer-top">
          <div className="footer-brand-block">
            <div className="landing-brand">
              <span className="landing-brand-icon">VP</span>
              <span className="landing-brand-name">Van Pooling Platform</span>
            </div>
            <p>
              Demand-responsive commuter operations for employees, drivers, and fleet admins.
            </p>
            <div className="footer-socials">
              {PUBLIC_SOCIAL_LINKS.map((social) => (
                <Link key={social.path} to={social.path}>
                  {social.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="footer-link-grid">
            {LANDING_FOOTER_COLUMNS.map((column) => (
              <div key={column.heading}>
                <h4>{column.heading}</h4>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.path}>
                      <Link to={link.path}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="footer-bottom">
          <span>(c) {new Date().getFullYear()} Van Pooling Platform. All rights reserved.</span>
          <span className="status-pill">SOC 2 Type II - In Progress</span>
        </div>
      </footer>

      <button
        className={`back-to-top ${showBackToTop ? "visible" : ""}`}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        type="button"
      >
        ^
      </button>

      {authOpen && (
        <div
          className="auth-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setAuthOpen(false);
            }
          }}
          role="presentation"
        >
          <section
            className={`auth-modal-panel auth-card-${selectedRole}`}
            role="dialog"
            aria-modal="true"
            aria-label="Workspace Sign In"
          >
            <button className="auth-modal-close" onClick={() => setAuthOpen(false)} type="button">
              Close
            </button>

            <div className="auth-role-header">
              <p className="eyebrow">{selectedRoleContent.eyebrow} Portal</p>
              <h2>{selectedRoleContent.formTitle}</h2>
              <p className="muted-copy">{selectedRoleContent.formDescription}</p>
            </div>

            <div className="landing-modal-role-grid">
              {(Object.entries(ROLE_CONTENT) as Array<
                [UserProfile["role"], (typeof ROLE_CONTENT)[UserProfile["role"]]]
              >).map(([role, content]) => (
                <button
                  className={`landing-modal-role ${selectedRole === role ? "active" : ""}`}
                  key={role}
                  onClick={() => {
                    setSelectedRole(role);
                    setMode("login");
                    setError(null);
                  }}
                  type="button"
                >
                  <span>{content.eyebrow}</span>
                </button>
              ))}
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
                Drivers are provisioned by admins. Use the driver card to sign in only with a
                driver account.
              </div>
            )}

            {selectedRole === "admin" && mode === "register" && (
              <div className="helper-box">
                Admin registration is only for bootstrapping a new company workspace. Existing
                company admin accounts should be created from the admin console.
              </div>
            )}

            <section className="helper-box">
              <p className="eyebrow">Enterprise SSO</p>
              <p className="muted-copy">
                Use your company domain to start SAML or OIDC sign-in when enterprise identity is
                enabled.
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
      )}
    </div>
  );
}

export { defaultRoute };
