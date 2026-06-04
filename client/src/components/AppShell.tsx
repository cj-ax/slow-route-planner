import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ApiStatusBanner } from "./ApiStatusBanner";
import { Wordmark } from "./Wordmark";

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="app-header__menu"
          aria-label="Menu"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>

        <Link to="/" className="brand" onClick={() => setNavOpen(false)} aria-label="Meander">
          <Wordmark size={26} />
        </Link>

        <nav className={`app-nav${navOpen ? " app-nav--open" : ""}`}>
          <NavLink to="/" end onClick={() => setNavOpen(false)}>
            Plan
          </NavLink>
          <NavLink to="/routes" onClick={() => setNavOpen(false)}>
            Saved
          </NavLink>
          <NavLink to="/settings" onClick={() => setNavOpen(false)}>
            Settings
          </NavLink>
        </nav>

        <span className="app-header__avatar" aria-hidden="true" />
      </header>
      <ApiStatusBanner />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
