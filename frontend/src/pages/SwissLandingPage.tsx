import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const AnimatedNumber = ({ value, suffix = "", prefix = "" }: { value: number, suffix?: string, prefix?: string }) => {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLHeadingElement>(null);
  const isDecimal = value % 1 !== 0;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimated) {
        setHasAnimated(true);
        const duration = 1500;
        const startTime = performance.now();
        const animate = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easeOut = 1 - Math.pow(1 - progress, 3);
          setCount(value * easeOut);
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            setCount(value);
          }
        };
        requestAnimationFrame(animate);
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, hasAnimated]);

  const displayValue = isDecimal ? count.toFixed(1) : Math.floor(count);

  return <h4 ref={ref}>{prefix}{displayValue}{suffix}</h4>;
};

import { api } from "../lib/api";
import type { UserProfile } from "../lib/types";
import { useAuth } from "../state/auth";
import "./swiss-landing.css";

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

const publicAsset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

export function SwissLandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, user } = useAuth();

  // Auth Modal State
  const [mode, setMode] = useState<"login" | "register">("login");
  const [selectedRole, setSelectedRole] = useState<UserProfile["role"]>("employee");
  const [authOpen, setAuthOpen] = useState(false);
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
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Enterprise SSO State
  const [enterpriseDomain, setEnterpriseDomain] = useState("");
  const [enterpriseBusy, setEnterpriseBusy] = useState(false);
  const [enterpriseError, setEnterpriseError] = useState<string | null>(null);
  const [enterpriseResult, setEnterpriseResult] = useState<{
    configured: boolean;
    guidance: string;
    redirectUrl?: string | null;
    companyName?: string;
  } | null>(null);

  const cycleWords = ["Corporate", "Daily", "Campus", "Enterprise"];
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % cycleWords.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const philosophyRef = useRef<HTMLElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
      const totalScroll = document.documentElement.scrollTop;
      const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      setScrollProgress((totalScroll / windowHeight) * 100);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handlePhilosophyMouseMove = (e: React.MouseEvent) => {
    if (philosophyRef.current) {
      const rect = philosophyRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

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

  function openAuth(role?: UserProfile["role"], nextMode: "login" | "register" = "login") {
    if (role) setSelectedRole(role);
    setMode(nextMode);
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
          company_name: selectedRole === "admin" ? form.company_name || undefined : undefined,
          requested_role: selectedRole,
        });
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Authentication failed.");
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
      setEnterpriseError(ssoError instanceof Error ? ssoError.message : "Could not start enterprise SSO.");
    } finally {
      setEnterpriseBusy(false);
    }
  }

  return (
    <div className="swiss-landing">
      <div className="scroll-progress-bar" style={{ width: `${scrollProgress}%` }}></div>
      {/* Navigation */}
      <header className="swiss-nav">
        <div className="swiss-brand">VP Platform</div>
        <nav className="swiss-nav-links">
          <a href="#philosophy">Infrastructure</a>
          <a href="#live-ops">Live Ops</a>
          <a href="#showcase">Ecosystem</a>
          <a href="#services">Portals</a>
        </nav>
        <div className="swiss-nav-right">
          <a href="#" aria-label="Download App" style={{ color: '#111111', display: 'flex', alignItems: 'center', textDecoration: 'none' }} title="Download Mobile App">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
          <button className="swiss-nav-btn" onClick={() => openAuth("employee", "login")}>
            Sign In
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="swiss-hero new-hero">
        <h1 className="hero-antigravity-text">
          {"Demand-responsive commuter operations for employees, drivers, and fleet admins.".split(" ").map((word, index) => (
            <span key={index} className="word-reveal" style={{ animationDelay: `${index * 0.2}s` }}>
              {word}&nbsp;
            </span>
          ))}
        </h1>
        <div className="hero-antigravity-actions">
          <a href="#" className="brutal-btn dark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download App
          </a>
          <a href="#philosophy" className="brutal-btn light">
            Explore platform
          </a>
        </div>
        <div className="trust-strip">
          <span className="trust-label">Trusted by teams at</span>
          {["Acme Mobility", "Northstar Labs", "Orbit Tech", "Bluepeak Systems"].map((team) => (
            <span className="trust-pill" key={team}>{team}</span>
          ))}
        </div>
      </section>

      {/* Philosophy / Narrative Section */}
      <section className="swiss-philosophy" id="philosophy" ref={philosophyRef} onMouseMove={handlePhilosophyMouseMove}>
        <div className="cursor-glow" style={{ left: mousePos.x, top: mousePos.y }}></div>
        <div className="hairline-divider"></div>
        <h2 className="philosophy-quote">
          Re-engineering the <span className="italic-serif cycling-word" key={wordIndex}>{cycleWords[wordIndex]}</span> Commute infrastructure.
        </h2>

        <div className="philosophy-grid">
          <div className="philosophy-col">
            <h3 className="clash-font">Smart Matching</h3>
            <p>
              Demand-responsive algorithms group employees into optimal van routes, ensuring that every seat is utilized and transit waste is minimized.
            </p>
          </div>
          <div className="philosophy-col">
            <h3 className="clash-font">Live Tracking</h3>
            <p>
              Real-time visibility into van locations, ETAs, and passenger manifests. Complete transparency for both employees waiting and dispatchers monitoring.
            </p>
          </div>
          <div className="philosophy-col">
            <h3 className="clash-font">Command Center</h3>
            <p>
              Centralized control over fleet operations. Administrators can monitor live demand, direct drivers, and manage corporate transit billing with pinpoint accuracy.
            </p>
          </div>
        </div>
      </section>

      {/* Metrics Section */}
      <section className="swiss-metrics">
        <div className="metric-box">
          <AnimatedNumber prefix="< " value={8} suffix="m" />
          <p>Average employee wait time, down from 25m on fixed routes.</p>
        </div>
        <div className="metric-box">
          <AnimatedNumber value={40} suffix="%" />
          <p>Reduction in empty seats across the daily fleet operation.</p>
        </div>
        <div className="metric-box">
          <AnimatedNumber value={3} />
          <p>Distinct operational roles managed in one unified platform.</p>
        </div>
        <div className="metric-box">
          <AnimatedNumber value={99.9} suffix="%" />
          <p>Uptime target for core routing and dispatching infrastructure.</p>
        </div>
      </section>

      {/* Marquee Section */}
      <div className="swiss-marquee">
        <div className="marquee-content">
          {[...Array(8)].map((_, i) => (
            <span key={i}>
              DEMAND RESPONSIVE &nbsp;&middot;&nbsp; REAL-TIME DISPATCH &nbsp;&middot;&nbsp; FLEET OPTIMISATION &nbsp;&middot;&nbsp; ZERO EMPTY SEATS &nbsp;&middot;&nbsp; LIVE GPS TRACKING &nbsp;&middot;&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* Problem Statement Section */}
      <section className="swiss-problem">
        <p className="section-eyebrow">Problem</p>
        <h2 className="section-heading">The Old Way Is Broken</h2>
        <div className="problem-grid">
          <div className="problem-card">
            <div className="problem-icon">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 7.8v4.7l3 1.9" /></svg>
            </div>
            <h3>Fixed routes, empty seats</h3>
            <p>Scheduled shuttles run whether 2 or 20 people need them. Companies pay for capacity they never use.</p>
          </div>
          <div className="problem-card">
            <div className="problem-icon">
              <svg viewBox="0 0 24 24"><path d="M3.3 12c2-3.4 5.2-5.2 8.7-5.2s6.7 1.8 8.7 5.2c-2 3.4-5.2 5.2-8.7 5.2S5.3 15.4 3.3 12Z" /><path d="M4.8 19.2 19.2 4.8" /></svg>
            </div>
            <h3>No realtime visibility</h3>
            <p>Employees don't know when the van will arrive. Admins don't know where it is. Everyone is guessing.</p>
          </div>
          <div className="problem-card">
            <div className="problem-icon">
              <svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="2.8" /><path d="M3.9 19.2c.5-2.5 2.5-4.3 5.1-4.3s4.6 1.8 5.1 4.3" /><path d="M16.3 7.3h3.8M16.3 12h3.8M16.3 16.7h3.8" /></svg>
            </div>
            <h3>Manual dispatch overload</h3>
            <p>Operations teams spend hours coordinating what software should handle automatically.</p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="swiss-how-it-works">
        <p className="section-eyebrow">How It Works</p>
        <h2 className="section-heading">Three Steps to Smarter Commutes</h2>
        <div className="how-it-works-grid">
          <div className="hiw-step">
            <span className="hiw-role-badge">Employee</span>
            <h3>Request</h3>
            <p>Employee opens the app, requests a ride to campus, and the system groups nearby commuters into optimal routes.</p>
          </div>
          <div className="hiw-step">
            <span className="hiw-role-badge">System</span>
            <h3>Match & Optimize</h3>
            <p>The matcher assigns the nearest van, optimizes the pickup sequence, and notifies the driver instantly.</p>
          </div>
          <div className="hiw-step">
            <span className="hiw-role-badge">Admin</span>
            <h3>Supervise & Intervene</h3>
            <p>Ops team monitors the fleet map, gets delay alerts, and can reassign trips in one tap when needed.</p>
          </div>
        </div>
      </section>

      {/* Map Animation Section */}
      <section className="swiss-map-section" id="live-ops">
        <div className="map-header">
          <h2 className="clash-font">Live Operations Matrix</h2>
          <div className="live-pulse">
            <span className="pulse-dot"></span> LIVE
          </div>
        </div>
        <div className="map-container">
          <svg viewBox="0 0 1000 500" className="map-svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(30,30,30,0.05)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Routes */}
            <path id="route-1" d="M 100 250 L 300 250 L 400 150 L 600 150 L 700 350 L 900 350" className="map-path" fill="none" stroke="#1e1e1e" strokeWidth="2" />
            <path id="route-2" d="M 200 400 L 400 400 L 500 250 L 700 250 L 800 100" className="map-path delay-1" fill="none" stroke="#1e1e1e" strokeWidth="2" />

            {/* Nodes */}
            <circle cx="100" cy="250" className="map-node" />
            <circle cx="300" cy="250" className="map-node" />
            <circle cx="400" cy="150" className="map-node" />
            <circle cx="600" cy="150" className="map-node" />
            <circle cx="700" cy="350" className="map-node" />
            <circle cx="900" cy="350" className="map-node" />

            <circle cx="200" cy="400" className="map-node delay-1" />
            <circle cx="400" cy="400" className="map-node delay-1" />
            <circle cx="500" cy="250" className="map-node delay-1" />
            <circle cx="700" cy="250" className="map-node delay-1" />
            <circle cx="800" cy="100" className="map-node delay-1" />

            {/* Ping Rings */}
            <circle cx="400" cy="150" r="4" fill="none" stroke="#111111" strokeWidth="1">
              <animate attributeName="r" values="4; 24" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1; 0" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="700" cy="250" r="4" fill="none" stroke="#111111" strokeWidth="1">
              <animate attributeName="r" values="4; 24" dur="2.5s" begin="1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1; 0" dur="2.5s" begin="1s" repeatCount="indefinite" />
            </circle>
            <circle cx="600" cy="150" r="4" fill="none" stroke="#111111" strokeWidth="1">
              <animate attributeName="r" values="4; 24" dur="3s" begin="0.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1; 0" dur="3s" begin="0.5s" repeatCount="indefinite" />
            </circle>

            {/* Animated Vans */}
            <circle r="4" fill="#111111">
              <animateMotion dur="4s" repeatCount="indefinite">
                <mpath href="#route-1" />
              </animateMotion>
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="4s" repeatCount="indefinite" />
            </circle>
            <circle r="4" fill="#111111">
              <animateMotion dur="5s" repeatCount="indefinite" begin="2s">
                <mpath href="#route-2" />
              </animateMotion>
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="5s" begin="2s" repeatCount="indefinite" />
            </circle>
            <circle r="4" fill="#111111">
              <animateMotion dur="4.5s" repeatCount="indefinite" begin="1s">
                <mpath href="#route-1" />
              </animateMotion>
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="4.5s" begin="1s" repeatCount="indefinite" />
            </circle>
          </svg>
        </div>
      </section>

      {/* Asymmetrical Showcase Grid */}
      <section className="swiss-showcase" id="showcase">
        <div className="showcase-grid">
          <div className="showcase-item showcase-large-rect" style={{ transform: `translateY(${scrollY * 0.02}px)` }}>
            <img src={publicAsset("images/editorial_office.png")} alt="Editorial Office" />
          </div>
          <div className="showcase-item showcase-pill-vert" style={{ transform: `translateY(${scrollY * 0.04}px)` }}>
            <img src={publicAsset("images/abstract_architecture.png")} alt="Intelligent Routing" />
            <div className="pill-overlay">Intelligent<br/>Routing</div>
          </div>
          <div className="showcase-item showcase-circle" style={{ transform: `translateY(${scrollY * 0.05}px)` }}>
            <img src={publicAsset("images/van_pooling.png")} alt="Premium Transport Van" />
          </div>
          <div className="showcase-item showcase-wide-rect" style={{ transform: `translateY(${scrollY * 0.03}px)` }}>
            <img src={publicAsset("images/modern_fleet.png")} alt="Modern Fleet" />
          </div>
        </div>
      </section>

      {/* Bespoke Service Cards */}
      <section className="swiss-services" id="services">
        <div className="services-grid">
          <div className="service-card">
            <div className="service-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h3 className="clash-font">Employee Portal</h3>
            <p>A stripped-back, high-contrast interface for requesting rides. No visual noise, just immediate utility.</p>
            <a href="#" className="service-cta" onClick={(e) => { e.preventDefault(); openAuth("employee", "login"); }}>
              Enter Portal
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          <div className="service-card">
            <div className="service-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="clash-font">Driver Execution</h3>
            <p>The driver console relies on brutalist typography to convey stops and statuses instantly, minimizing cognitive load.</p>
            <a href="#" className="service-cta" onClick={(e) => { e.preventDefault(); openAuth("driver", "login"); }}>
              Enter Console
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          <div className="service-card">
            <div className="service-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <h3 className="clash-font">Admin Command</h3>
            <p>An overarching view of the fleet's movement. Data is presented with typographic hierarchy over raw visualization.</p>
            <a href="#" className="service-cta" onClick={(e) => { e.preventDefault(); openAuth("admin", "login"); }}>
              Enter Command
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="swiss-pricing" id="pricing">
        <p className="section-eyebrow">Pricing</p>
        <h2 className="section-heading">Plans That Scale With Your Fleet</h2>
        <div className="pricing-grid">
          <div className="pricing-card">
            <h3>Starter</h3>
            <p className="pricing-details">Up to 2 vans, 50 employees, basic pooling, email support</p>
            <ul>
              <li>Basic dispatch board</li>
              <li>Realtime rider updates</li>
              <li>Email-only support</li>
              <li>Weekly usage export</li>
            </ul>
            <button className="pricing-cta" onClick={() => openAuth("employee", "register")}>Get Started</button>
          </div>
          <div className="pricing-card highlighted">
            <span className="pricing-badge">Most Popular</span>
            <h3>Growth</h3>
            <p className="pricing-details">Up to 10 vans, 500 employees, scheduled rides, SSO, analytics</p>
            <ul>
              <li>Scheduled ride automation</li>
              <li>Enterprise SSO support</li>
              <li>Advanced demand analytics</li>
              <li>Priority support desk</li>
            </ul>
            <button className="pricing-cta" onClick={() => openAuth("admin", "register")}>Get Started</button>
          </div>
          <div className="pricing-card">
            <h3>Enterprise</h3>
            <p className="pricing-details">Unlimited vans, custom SLA, dedicated support, API access</p>
            <ul>
              <li>Custom SLA + onboarding</li>
              <li>API and integrations</li>
              <li>White-label workspace</li>
              <li>Dedicated success manager</li>
            </ul>
            <button className="pricing-cta" onClick={() => openAuth("admin", "login")}>Contact Sales</button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="swiss-faq">
        <p className="section-eyebrow">Questions</p>
        <h2 className="section-heading">Frequently Asked</h2>
        <div className="faq-list">
          {[
            { q: "How is this different from a fixed shuttle system?", a: "Fixed routes run regardless of demand. Van Pooling matches live demand to live capacity in minutes, so every seat is used and every ride is needed." },
            { q: "Can employees use this without installing an app?", a: "Yes. Riders can request, track, and manage trips from a secure browser workflow — no native app required." },
            { q: "How does the matching engine decide who rides together?", a: "It scores nearby vans by pickup distance, destination overlap, detour cost, and live readiness to find the most efficient groupings." },
            { q: "Is our employee data kept private from other companies?", a: "Absolutely. Every query and event is tenant-scoped, so one company never sees another company's data. Full multi-tenant isolation." },
            { q: "What happens if a van breaks down mid-route?", a: "Ops gets an immediate alert and can reassign riders to another van while notifying employees and drivers in realtime." },
            { q: "Can we integrate with our existing HR system?", a: "Yes. Enterprise plans support identity and provisioning integrations with existing HR and IT systems via API." },
          ].map((item, index) => (
            <div className={`faq-item ${openFaqIndex === index ? 'open' : ''}`} key={index}>
              <button className="faq-question" onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}>
                <span>{item.q}</span>
                <span className="faq-toggle">+</span>
              </button>
              <div className="faq-answer">
                <p>{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Editorial Closer */}
      <section className="editorial-closer">
        <div className="hairline-divider"></div>
        <h2 className="closer-text">Move your people. Intelligently.</h2>
        <div className="closer-actions">
          <a href="#" className="brutal-btn dark" onClick={(e) => { e.preventDefault(); openAuth("employee", "register"); }}>Get Started Free</a>
          <a href="#pricing" className="brutal-btn light">View Pricing</a>
        </div>
        <div className="hairline-divider" style={{ marginTop: '40px' }}></div>
      </section>

      {/* Footer */}
      <footer className="swiss-footer">
        <div className="footer-grid">
          <div className="footer-col" style={{ gridColumn: 'span 1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{ background: '#f2f2f2', color: '#111111', width: '36px', height: '36px', borderRadius: '0px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '14px', fontFamily: 'Satoshi' }}>VP</div>
              <span className="swiss-brand" style={{color: '#f6f6f6', marginBottom: 0, fontSize: '20px', textTransform: 'capitalize', letterSpacing: 'normal'}}>Van Pooling Platform</span>
            </div>
            <p>Demand-responsive commuter infrastructure for corporate transit operations.</p>
            <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" style={{ opacity: 0.8 }}>LinkedIn</a>
              <a href="https://x.com" target="_blank" rel="noopener noreferrer" style={{ opacity: 0.8 }}>X</a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" style={{ opacity: 0.8 }}>GitHub</a>
            </div>
          </div>
          <div className="footer-col">
            <h4>Platform</h4>
            <ul>
              <li><a href="#" onClick={(e) => { e.preventDefault(); openAuth("employee", "login"); }}>Employee Portal</a></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); openAuth("driver", "login"); }}>Driver Console</a></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); openAuth("admin", "login"); }}>Admin Command</a></li>
              <li><a href="#">Download App</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Resources</h4>
            <ul>
              <li><a href="#philosophy">How It Works</a></li>
              <li><a href="#live-ops">Live Operations</a></li>
              <li><a href="#showcase">Fleet Ecosystem</a></li>
              <li><a href="#">System Status</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <ul>
              <li><a href="#">About</a></li>
              <li><a href="#">Careers</a></li>
              <li><a href="#">Contact</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <ul>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
              <li><a href="#">Security</a></li>
              <li><a href="#">GDPR</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} Van Pooling Platform. All rights reserved.</span>
          <span>Built for intelligent corporate transit.</span>
        </div>
      </footer>

      {/* Auth Modal (Using existing app modal design classes so the logic remains exactly the same) */}
      {authOpen && (
        <div className="auth-modal-wrapper" onClick={(e) => { if (e.target === e.currentTarget) setAuthOpen(false); }}>
          <div className="auth-modal-content">
            <button className="ghost-button" style={{float: 'right', marginBottom: '16px'}} onClick={() => setAuthOpen(false)}>
              Close
            </button>
            <div className="auth-role-header">
              <p className="eyebrow">{selectedRoleContent.eyebrow} Portal</p>
              <h2>{selectedRoleContent.formTitle}</h2>
              <p className="muted-copy">{selectedRoleContent.formDescription}</p>
            </div>

            <div style={{display: 'flex', gap: '8px', marginBottom: '24px', marginTop: '16px'}}>
              {(Object.entries(ROLE_CONTENT) as Array<[UserProfile["role"], (typeof ROLE_CONTENT)[UserProfile["role"]]]>).map(([role, content]) => (
                <button
                  key={role}
                  className={`ghost-button ${selectedRole === role ? 'active' : ''}`}
                  style={{flex: 1, borderColor: selectedRole === role ? '#f2f2f2' : ''}}
                  onClick={() => { setSelectedRole(role); setMode("login"); setError(null); }}
                >
                  {content.eyebrow}
                </button>
              ))}
            </div>

            <div className="segment-control" style={{marginBottom: '24px'}}>
              <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign In</button>
              <button className={mode === "register" ? "active" : ""} disabled={selectedRole === "driver"} onClick={() => setMode("register")}>
                {selectedRole === "driver" ? "Admin setup only" : "Register"}
              </button>
            </div>

            {selectedRole === "driver" && (
              <div className="helper-box" style={{marginBottom: '24px'}}>
                Drivers are provisioned by admins. Use the driver card to sign in only with a driver account.
              </div>
            )}

            {selectedRole === "admin" && mode === "register" && (
              <div className="helper-box" style={{marginBottom: '24px'}}>
                Admin registration is only for bootstrapping a new company workspace. Existing company admin accounts should be created from the admin console.
              </div>
            )}

            <section className="helper-box" style={{marginBottom: '24px'}}>
              <p className="eyebrow">Enterprise SSO</p>
              <form className="stack compact" onSubmit={handleEnterpriseStart}>
                <label>
                  Company domain
                  <input value={enterpriseDomain} onChange={(e) => setEnterpriseDomain(e.target.value)} placeholder="company.com" required />
                </label>
                <button className="secondary-button" disabled={enterpriseBusy} type="submit">
                  {enterpriseBusy ? "Checking..." : "Continue with enterprise SSO"}
                </button>
              </form>
              {enterpriseError && <div className="error-banner">{enterpriseError}</div>}
              {enterpriseResult && (
                <div className="stack compact" style={{marginTop: '12px'}}>
                  <p className="muted-copy">
                    {enterpriseResult.companyName ? `${enterpriseResult.companyName}: ` : ""}
                    {enterpriseResult.guidance}
                  </p>
                  {enterpriseResult.configured && enterpriseResult.redirectUrl && (
                    <a className="text-link" href={enterpriseResult.redirectUrl} rel="noreferrer" target="_blank" style={{color: '#f2f2f2', textDecoration: 'underline'}}>
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
                  <input value={form.name} onChange={(e) => setForm(c => ({ ...c, name: e.target.value }))} placeholder="Your full name" required />
                </label>
              )}
              <label>
                {mode === "login" ? selectedRoleContent.loginEmailLabel : "Work email"}
                <input type="email" value={form.email} onChange={(e) => setForm(c => ({ ...c, email: e.target.value }))} placeholder={mode === "login" ? selectedRoleContent.loginEmailPlaceholder : "you@company.com"} required />
              </label>
              <label>
                Password
                <input type="password" value={form.password} onChange={(e) => setForm(c => ({ ...c, password: e.target.value }))} placeholder="Enter your password" required />
              </label>

              {mode === "register" && (
                <>
                  <label>
                    Phone
                    <input value={form.phone} onChange={(e) => setForm(c => ({ ...c, phone: e.target.value }))} placeholder="+1 555 000 0000" />
                  </label>
                  <label>
                    {selectedRole === "admin" ? "New company domain" : "Company domain"}
                    <input value={form.company_domain} onChange={(e) => setForm(c => ({ ...c, company_domain: e.target.value }))} placeholder="company.com" required />
                  </label>
                  {selectedRole === "admin" && (
                    <label>
                      Company name for new tenant
                      <input value={form.company_name} onChange={(e) => setForm(c => ({ ...c, company_name: e.target.value }))} placeholder="Your company name" />
                    </label>
                  )}
                </>
              )}

              {error && <div className="error-banner" style={{color: '#ff6b83', marginTop: '12px'}}>{error}</div>}

              <button className="primary-button" disabled={busy} type="submit" style={{marginTop: '16px'}}>
                {busy ? "Working..." : mode === "login" ? selectedRoleContent.loginButton : selectedRoleContent.registerButton}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export { defaultRoute };
