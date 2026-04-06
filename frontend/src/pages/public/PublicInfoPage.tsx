import { Link } from "react-router-dom";

import {
  getPublicPageContent,
  LANDING_FOOTER_COLUMNS,
  PUBLIC_NAV_LINKS,
  PUBLIC_SOCIAL_LINKS,
  type PublicPageKey,
} from "./content";

export function PublicInfoPage({ pageKey }: { pageKey: PublicPageKey }) {
  const page = getPublicPageContent(pageKey);

  return (
    <div className="public-page-root">
      <header className="public-page-header">
        <Link className="landing-brand" to="/">
          <span className="landing-brand-icon">VP</span>
          <span className="landing-brand-name">Van Pooling Platform</span>
        </Link>
        <nav className="public-page-nav">
          {PUBLIC_NAV_LINKS.map((link) => (
            <Link key={link.path} to={link.path}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="public-page-actions">
          <Link className="ghost-button" to="/contact">
            Request Demo
          </Link>
          <Link className="primary-button" to="/">
            Sign In
          </Link>
        </div>
      </header>

      <main className="public-page-main">
        <section className="public-hero-card">
          <p className="eyebrow">{page.eyebrow}</p>
          <h1>{page.title}</h1>
          <p>{page.subtitle}</p>
          <div className="public-page-chip-row">
            <span className="status-pill">Updated {page.lastUpdated}</span>
            <Link className="secondary-button" to={page.primaryCta.path}>
              {page.primaryCta.label}
            </Link>
            <Link className="ghost-button" to="/">
              Back to landing
            </Link>
          </div>
        </section>

        <section className="public-section-grid">
          {page.sections.map((section) => (
            <article className="public-section-card" key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </main>

      <footer className="landing-footer public-footer">
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
    </div>
  );
}
