import { Link, NavLink, Outlet } from "react-router-dom";
import { ApiStatusBanner } from "./ApiStatusBanner";

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="brand__mark">🛵</span>
          <span className="brand__name">Slow Route Planner</span>
        </Link>
        <nav className="app-nav">
          <NavLink to="/" end>
            Plan
          </NavLink>
          <NavLink to="/routes">Saved</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <ApiStatusBanner />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
