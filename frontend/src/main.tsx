import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./state/auth";
import "./styles.css";

const routerBasename = normalizeBasename(
  import.meta.env.VITE_ROUTER_BASENAME || import.meta.env.BASE_URL || "/",
);

restorePagesRedirect(routerBasename);

function normalizeBasename(value: string) {
  const withoutTrailingSlash = value.replace(/\/+$/, "");
  return withoutTrailingSlash || "/";
}

function restorePagesRedirect(basename: string) {
  const redirectPath = window.sessionStorage.getItem("vanpool.redirectPath");

  if (!redirectPath) {
    return;
  }

  const redirectPathname = redirectPath.split(/[?#]/)[0];
  const belongsToApp =
    basename === "/" ||
    redirectPathname === basename ||
    redirectPathname.startsWith(`${basename}/`);

  if (belongsToApp) {
    window.sessionStorage.removeItem("vanpool.redirectPath");
    window.history.replaceState(null, "", redirectPath);
  }
}

function FrontendSwitcher() {
  const href = import.meta.env.VITE_FRONTEND_SWITCH_URL;
  const label = import.meta.env.VITE_FRONTEND_SWITCH_LABEL || "Switch frontend";

  if (!href) {
    return null;
  }

  return (
    <a className="frontend-switcher-link" href={href}>
      {label}
    </a>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FrontendSwitcher />
    <BrowserRouter basename={routerBasename}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
