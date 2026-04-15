export interface PublicLink {
  label: string;
  path: string;
}

export interface PublicFooterColumn {
  heading: string;
  links: PublicLink[];
}

export type PublicPageKey =
  | "features"
  | "pricing"
  | "changelog"
  | "roadmap"
  | "about"
  | "blog"
  | "careers"
  | "press"
  | "privacy"
  | "terms"
  | "security"
  | "gdpr"
  | "docs"
  | "status"
  | "contact"
  | "linkedin"
  | "x"
  | "github";

interface PublicPageSection {
  heading: string;
  body: string;
  bullets: string[];
}

interface PublicPageContent {
  eyebrow: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: PublicPageSection[];
  primaryCta: PublicLink;
}

export const PUBLIC_NAV_LINKS: PublicLink[] = [
  { label: "Features", path: "/features" },
  { label: "Pricing", path: "/pricing" },
  { label: "About", path: "/about" },
  { label: "Docs", path: "/docs" },
  { label: "Contact", path: "/contact" },
];

export const PUBLIC_SOCIAL_LINKS: PublicLink[] = [
  { label: "LinkedIn", path: "/linkedin" },
  { label: "X", path: "/x" },
  { label: "GitHub", path: "/github" },
];

export const LANDING_FOOTER_COLUMNS: PublicFooterColumn[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", path: "/features" },
      { label: "Pricing", path: "/pricing" },
      { label: "Changelog", path: "/changelog" },
      { label: "Roadmap", path: "/roadmap" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", path: "/about" },
      { label: "Blog", path: "/blog" },
      { label: "Careers", path: "/careers" },
      { label: "Press", path: "/press" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", path: "/privacy" },
      { label: "Terms", path: "/terms" },
      { label: "Security", path: "/security" },
      { label: "GDPR", path: "/gdpr" },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Docs", path: "/docs" },
      { label: "Status", path: "/status" },
      { label: "Contact", path: "/contact" },
    ],
  },
];

export const PUBLIC_ROUTE_CONFIG: Array<{ path: string; pageKey: PublicPageKey }> = [
  { path: "/features", pageKey: "features" },
  { path: "/pricing", pageKey: "pricing" },
  { path: "/changelog", pageKey: "changelog" },
  { path: "/roadmap", pageKey: "roadmap" },
  { path: "/about", pageKey: "about" },
  { path: "/blog", pageKey: "blog" },
  { path: "/careers", pageKey: "careers" },
  { path: "/press", pageKey: "press" },
  { path: "/privacy", pageKey: "privacy" },
  { path: "/terms", pageKey: "terms" },
  { path: "/security", pageKey: "security" },
  { path: "/gdpr", pageKey: "gdpr" },
  { path: "/docs", pageKey: "docs" },
  { path: "/status", pageKey: "status" },
  { path: "/contact", pageKey: "contact" },
  { path: "/linkedin", pageKey: "linkedin" },
  { path: "/x", pageKey: "x" },
  { path: "/github", pageKey: "github" },
];

const PUBLIC_PAGE_CONTENT: Record<PublicPageKey, PublicPageContent> = {
  features: {
    eyebrow: "Product",
    title: "Platform Features",
    subtitle:
      "A unified operations platform for employees, drivers, and fleet admins with live dispatch intelligence.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Employee workflow",
        body: "Commuters request rides, track vans, and receive realtime updates across the full ride lifecycle.",
        bullets: [
          "Instant and scheduled ride requests",
          "Live map tracking and ETA refresh",
          "Ride history, notifications, and status timeline",
        ],
      },
      {
        heading: "Driver execution",
        body: "Driver consoles prioritize next stops, OTP boarding checks, and operational exceptions.",
        bullets: [
          "Trip queue with action-driven state controls",
          "Live GPS heartbeat and stale-feed guardrails",
          "In-ride OTP verification before pickup confirmation",
        ],
      },
      {
        heading: "Admin command center",
        body: "Operations teams monitor demand, trips, vans, and alerts from one tenant-scoped control surface.",
        bullets: [
          "Realtime fleet and trip map overlays",
          "Demand pressure alerts and reassignment controls",
          "Policy, zones, users, and billing modules",
        ],
      },
    ],
    primaryCta: { label: "See Pricing", path: "/pricing" },
  },
  pricing: {
    eyebrow: "Commercial",
    title: "Pricing Overview",
    subtitle:
      "Plans scale from pilot fleets to enterprise commuter operations with configurable dispatch controls.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Starter",
        body: "Designed for early deployments validating pooled commute adoption with basic admin controls.",
        bullets: [
          "Up to 2 vans and 50 riders",
          "Core matching and realtime visibility",
          "Email support with guided onboarding",
        ],
      },
      {
        heading: "Growth",
        body: "For active ops teams requiring scheduled rides, analytics, and stronger identity controls.",
        bullets: [
          "Up to 10 vans and 500 riders",
          "Recurring rides, SSO, and advanced alerts",
          "Priority support and SLA reporting",
        ],
      },
      {
        heading: "Enterprise",
        body: "For multi-site fleets needing custom security, API integrations, and dedicated reliability support.",
        bullets: [
          "Unlimited vans and riders",
          "Custom uptime and incident response targets",
          "Dedicated success and technical account support",
        ],
      },
    ],
    primaryCta: { label: "Talk to Sales", path: "/contact" },
  },
  changelog: {
    eyebrow: "Product Updates",
    title: "Changelog",
    subtitle:
      "Track major releases and operational upgrades across dispatch, rider experience, and driver workflows.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Recent highlights",
        body: "Core improvements now include OTP boarding verification and stronger role-specific navigation.",
        bullets: [
          "Landing/footer links now route to dedicated pages",
          "Role-gated auth flows for employee, driver, and admin",
          "Improved map integration and live location handling",
        ],
      },
      {
        heading: "Operations updates",
        body: "Dispatch logic and recurring schedule behavior continue to align with state-machine requirements.",
        bullets: [
          "Scheduled dispatch worker recovery hardening",
          "Tenant-scoped event stream consistency updates",
          "Driver workflow instrumentation improvements",
        ],
      },
      {
        heading: "Road to v1",
        body: "Upcoming releases remain focused on production reliability and enterprise controls.",
        bullets: [
          "Notification reliability and audit expansion",
          "Expanded analytics slices and exports",
          "Tenant security hardening checkpoints",
        ],
      },
    ],
    primaryCta: { label: "View Roadmap", path: "/roadmap" },
  },
  roadmap: {
    eyebrow: "Forward Plan",
    title: "Roadmap",
    subtitle:
      "Delivery priorities are sequenced around reliability, dispatch quality, and enterprise readiness.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Stage 1: Core loop hardening",
        body: "Continue refining rider-driver-admin lifecycle transitions and realtime consistency.",
        bullets: [
          "End-to-end workflow gap audits",
          "State transition edge-case protections",
          "UI consistency across all role dashboards",
        ],
      },
      {
        heading: "Stage 2: Operations depth",
        body: "Expand scheduling, reassignment, and alert escalations with measurable performance targets.",
        bullets: [
          "Dispatch pressure tuning controls",
          "Exception automation and no-show handling",
          "Dashboard-level SLA monitor widgets",
        ],
      },
      {
        heading: "Stage 3: Intelligence and extensibility",
        body: "Add stronger AI-assisted operations recommendations and external integrations.",
        bullets: [
          "Actionable copilot risk summaries",
          "HR and identity integration toolkit",
          "API-first partner enablement",
        ],
      },
    ],
    primaryCta: { label: "Read Docs", path: "/docs" },
  },
  about: {
    eyebrow: "Company",
    title: "About Van Pooling Platform",
    subtitle:
      "We build demand-responsive commuter systems that reduce wait time, increase utilization, and simplify fleet operations.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Mission",
        body: "Replace static shuttle planning with adaptive, data-aware fleet operations for modern workplaces.",
        bullets: [
          "Shorter employee wait times",
          "Higher seat utilization and lower dead runs",
          "Shared visibility across every operational role",
        ],
      },
      {
        heading: "What we value",
        body: "Operational reliability, tenant privacy, and practical AI assistance are foundational to product decisions.",
        bullets: [
          "Transparent dispatch behavior",
          "Strong multi-tenant separation",
          "Advisory AI with human-controlled operations",
        ],
      },
      {
        heading: "Who we serve",
        body: "Corporate campuses, office parks, and mobility teams managing structured employee commute programs.",
        bullets: [
          "Facilities and operations leaders",
          "Fleet admins and dispatch coordinators",
          "Drivers and commuting employees",
        ],
      },
    ],
    primaryCta: { label: "Contact Team", path: "/contact" },
  },
  blog: {
    eyebrow: "Insights",
    title: "Blog",
    subtitle:
      "Dispatch strategy, fleet operations playbooks, and implementation learnings for commute mobility teams.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "What you will find",
        body: "Articles focus on practical operations outcomes, not abstract trend commentary.",
        bullets: [
          "Pooling strategy and demand shaping",
          "Driver workflow optimization tips",
          "Admin alert response runbooks",
        ],
      },
      {
        heading: "Publishing cadence",
        body: "We publish release notes and operations write-ups on major product milestones.",
        bullets: [
          "Product release highlights",
          "Implementation case studies",
          "Realtime reliability best practices",
        ],
      },
      {
        heading: "Newsletter",
        body: "Join the product updates list through support and receive rollout summaries.",
        bullets: [
          "Monthly release digest",
          "Security and compliance notices",
          "Roadmap spotlight updates",
        ],
      },
    ],
    primaryCta: { label: "Open Contact", path: "/contact" },
  },
  careers: {
    eyebrow: "Hiring",
    title: "Careers",
    subtitle:
      "Help build reliable commuter mobility systems where operations quality matters every single day.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "How we work",
        body: "We are product-led, operations-driven, and deeply focused on shipping practical outcomes.",
        bullets: [
          "Small, accountable squads",
          "Fast iteration with strong quality bars",
          "Direct collaboration with real operators",
        ],
      },
      {
        heading: "Open roles",
        body: "Role postings are shared directly through our recruiting and support channels.",
        bullets: [
          "Frontend and platform engineering",
          "Operations product management",
          "Customer success and deployment support",
        ],
      },
      {
        heading: "Application path",
        body: "Interested candidates should reach out through the contact page with resume and role alignment.",
        bullets: [
          "State preferred role and level",
          "Share relevant operations or SaaS experience",
          "Include timezone and work preference",
        ],
      },
    ],
    primaryCta: { label: "Contact Hiring", path: "/contact" },
  },
  press: {
    eyebrow: "Media",
    title: "Press",
    subtitle:
      "Media resources and product background for publications covering workplace mobility and fleet technology.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Press kit",
        body: "Brand assets and platform descriptions are available by request.",
        bullets: [
          "Logo and visual identity package",
          "Product screenshots and feature summary",
          "Leadership and company background",
        ],
      },
      {
        heading: "Media inquiries",
        body: "For interviews, statements, or launch coverage, connect through the contact channel.",
        bullets: [
          "Company and product background",
          "Security and compliance positioning",
          "Roadmap and launch commentary",
        ],
      },
      {
        heading: "Coverage focus",
        body: "We prioritize transparent communication around measurable operations impact.",
        bullets: [
          "Wait-time and utilization outcomes",
          "Operational reliability metrics",
          "Tenant privacy architecture",
        ],
      },
    ],
    primaryCta: { label: "Media Contact", path: "/contact" },
  },
  privacy: {
    eyebrow: "Legal",
    title: "Privacy Notice",
    subtitle:
      "Platform data is company-scoped, role-filtered, and processed only to deliver commuter operations workflows.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Data we process",
        body: "Operational records include user identity, ride requests, trip events, and location telemetry where required.",
        bullets: [
          "User profile and role metadata",
          "Ride lifecycle and dispatch events",
          "Driver and van location updates",
        ],
      },
      {
        heading: "How data is used",
        body: "Data processing supports routing, dispatch, notifications, security, and support functions.",
        bullets: [
          "Trip matching and assignment decisions",
          "Realtime status updates per role",
          "Audit, incident response, and reporting",
        ],
      },
      {
        heading: "Tenant isolation",
        body: "All reads and writes are scoped by company context; cross-company visibility is not permitted.",
        bullets: [
          "JWT includes role and company scope",
          "Queries and event streams are tenant-filtered",
          "Copilot context is role and tenant constrained",
        ],
      },
    ],
    primaryCta: { label: "Read Security", path: "/security" },
  },
  terms: {
    eyebrow: "Legal",
    title: "Terms of Service",
    subtitle:
      "Usage terms define platform responsibilities, tenant boundaries, and acceptable operational behavior.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Service scope",
        body: "The platform provides software for company-managed commuter routing and dispatch operations.",
        bullets: [
          "Role-based access for employees, drivers, and admins",
          "Tenant-scoped operational data access",
          "Realtime updates and notification workflows",
        ],
      },
      {
        heading: "Customer responsibilities",
        body: "Customer admins are responsible for account governance and policy-compliant usage.",
        bullets: [
          "Provision and deactivate user accounts",
          "Maintain accurate driver and fleet records",
          "Follow local transport and labor requirements",
        ],
      },
      {
        heading: "Operational limitations",
        body: "Transport execution and safety operations remain controlled by customer and authorized drivers.",
        bullets: [
          "AI assistance is advisory only",
          "Final dispatch action comes from system/admin/driver controls",
          "Emergency procedures must follow customer policy",
        ],
      },
    ],
    primaryCta: { label: "Contact Support", path: "/contact" },
  },
  security: {
    eyebrow: "Legal",
    title: "Security Program",
    subtitle:
      "Security controls prioritize tenant isolation, access governance, and operational event traceability.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Core controls",
        body: "Security architecture uses strict role checks and tenant-aware data handling in both API and websocket layers.",
        bullets: [
          "Role-based authorization checks",
          "Company-scoped query and stream filters",
          "Session and token validation policies",
        ],
      },
      {
        heading: "Data protection",
        body: "Operational records and identity data are protected through encrypted transport and controlled access.",
        bullets: [
          "Encrypted network transport",
          "Least-privilege service design",
          "Audit-friendly event and action logging",
        ],
      },
      {
        heading: "Program maturity",
        body: "Compliance and control evidence continue to mature alongside production hardening milestones.",
        bullets: [
          "SOC 2 Type II program in progress",
          "Incident response and runbook improvement cycles",
          "Recurring security review checkpoints",
        ],
      },
    ],
    primaryCta: { label: "Privacy Notice", path: "/privacy" },
  },
  gdpr: {
    eyebrow: "Legal",
    title: "GDPR Readiness",
    subtitle:
      "Tenant controls, scoped access, and data handling patterns are aligned for GDPR-conscious operations.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Controller and processor model",
        body: "Corporate tenants manage end-user operations while the platform processes data under defined service scope.",
        bullets: [
          "Company-admin governance controls",
          "Role-scoped visibility safeguards",
          "Support for data lifecycle workflows",
        ],
      },
      {
        heading: "Data minimization",
        body: "Only data required for dispatch operations and reliability is retained in the active system.",
        bullets: [
          "Operational status and telemetry focus",
          "Tenant-bound analytics context",
          "Configurable policy controls over service behavior",
        ],
      },
      {
        heading: "Rights enablement",
        body: "Support workflows can help fulfill organizational data rights and governance requests.",
        bullets: [
          "Role and user lookup support",
          "Audit traces for operational actions",
          "Tenant-admin support channels for requests",
        ],
      },
    ],
    primaryCta: { label: "Security Program", path: "/security" },
  },
  docs: {
    eyebrow: "Support",
    title: "Documentation",
    subtitle:
      "Implementation and operations guides for deploying and running Van Pooling Platform effectively.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Admin docs",
        body: "Guides for fleet setup, policy controls, and dispatch monitoring.",
        bullets: [
          "Users, zones, and fleet onboarding",
          "Alert handling and reassignment flows",
          "Analytics and operational metrics",
        ],
      },
      {
        heading: "Driver docs",
        body: "Workflows for trip execution, boarding checks, and exception handling.",
        bullets: [
          "Trip state progression",
          "Location sharing and stale-feed recovery",
          "No-show and delay incident procedures",
        ],
      },
      {
        heading: "Employee docs",
        body: "How to request rides, track ETA, and manage recurring commute patterns.",
        bullets: [
          "Immediate and scheduled requests",
          "OTP boarding flow expectations",
          "Ride history and support escalation",
        ],
      },
    ],
    primaryCta: { label: "View Status", path: "/status" },
  },
  status: {
    eyebrow: "Support",
    title: "System Status",
    subtitle:
      "Operational status visibility for API health, dispatch latency, realtime streams, and background workers.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Core services",
        body: "Track API availability and dispatch decision timing against target service thresholds.",
        bullets: [
          "Core API target uptime: 99.5%",
          "Dispatch decision p95 under 10 seconds",
          "Alert freshness target under 10 seconds",
        ],
      },
      {
        heading: "Realtime channels",
        body: "Monitor websocket delivery and map update cadence across role dashboards.",
        bullets: [
          "Active trip GPS cadence: every 5 seconds",
          "State freshness target: under 2 seconds",
          "Fallback compatibility behavior where needed",
        ],
      },
      {
        heading: "Incident updates",
        body: "Incident communications and resolution updates are posted with clear remediation guidance.",
        bullets: [
          "Impact scope and timeline summaries",
          "Role-specific workaround instructions",
          "Post-incident prevention action tracking",
        ],
      },
    ],
    primaryCta: { label: "Contact Support", path: "/contact" },
  },
  contact: {
    eyebrow: "Support",
    title: "Contact Us",
    subtitle:
      "Reach product, support, or sales teams for demos, onboarding, incident help, and partnership discussions.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Sales and demos",
        body: "For fleet deployment planning, pricing, or procurement alignment, contact our sales team.",
        bullets: [
          "Request live product walkthrough",
          "Share fleet size and rider volume",
          "Discuss rollout timelines and integrations",
        ],
      },
      {
        heading: "Support",
        body: "For operations incidents and account support, use the dedicated support channel.",
        bullets: [
          "Include trip, ride, or alert IDs",
          "Mention tenant/company context",
          "Describe impact and urgency clearly",
        ],
      },
      {
        heading: "Partnerships and press",
        body: "For integration partnerships or media requests, route inquiries through this channel.",
        bullets: [
          "Ecosystem integration requests",
          "Press and interview inquiries",
          "Technology partner introductions",
        ],
      },
    ],
    primaryCta: { label: "Back to Landing", path: "/" },
  },
  linkedin: {
    eyebrow: "Social",
    title: "LinkedIn Link Pending",
    subtitle:
      "This social destination will be replaced with your official LinkedIn URL once you share it.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Current state",
        body: "This page exists so navigation stays valid while social destinations are being finalized.",
        bullets: [
          "No broken links from footer",
          "Easy swap to final external URL later",
          "Consistent user experience during setup",
        ],
      },
      {
        heading: "Next step",
        body: "Provide the final LinkedIn URL and we can redirect this route directly.",
        bullets: [
          "Add final company profile URL",
          "Swap route link to external destination",
          "Optionally keep this page as fallback",
        ],
      },
    ],
    primaryCta: { label: "Contact Team", path: "/contact" },
  },
  x: {
    eyebrow: "Social",
    title: "X Profile Link Pending",
    subtitle:
      "This placeholder keeps your footer navigation complete until your official X profile URL is ready.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Current state",
        body: "The app preserves a functional destination while external links are still being finalized.",
        bullets: [
          "No dead-end footer links",
          "Replaceable with one config update",
          "Safe for staging and production demos",
        ],
      },
      {
        heading: "Next step",
        body: "Share your final X URL and we will wire the footer directly to that profile.",
        bullets: [
          "Confirm handle and URL",
          "Switch route link in footer config",
          "Keep branded fallback route optional",
        ],
      },
    ],
    primaryCta: { label: "Contact Team", path: "/contact" },
  },
  github: {
    eyebrow: "Social",
    title: "GitHub Link Pending",
    subtitle:
      "This placeholder route is ready to be replaced with your official GitHub organization or repository URL.",
    lastUpdated: "April 1, 2026",
    sections: [
      {
        heading: "Current state",
        body: "Users can still navigate from the footer while social destinations remain internal.",
        bullets: [
          "Predictable routing behavior",
          "No placeholder hash links",
          "Easy migration to external destination",
        ],
      },
      {
        heading: "Next step",
        body: "Once your GitHub URL is available, we can point the footer link directly to it.",
        bullets: [
          "Share org/repo URL",
          "Swap internal route for external href",
          "Add open-in-new-tab behavior",
        ],
      },
    ],
    primaryCta: { label: "Back to Landing", path: "/" },
  },
};

export function getPublicPageContent(pageKey: PublicPageKey): PublicPageContent {
  return PUBLIC_PAGE_CONTENT[pageKey];
}
