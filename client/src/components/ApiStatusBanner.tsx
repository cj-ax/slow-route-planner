import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { HealthStatus } from "@srp/shared";
import { api } from "../api/client";

export function ApiStatusBanner() {
  const [health, setHealth] = useState<HealthStatus>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <div className="banner banner--warn">
        Can&apos;t reach the API. Make sure the server is running
        (<code>npm run dev</code>).
      </div>
    );
  }

  if (!health || !health.mockMode) return null;

  return (
    <div className="banner banner--info">
      <span>
        Mock mode is on — showing sample data. Add API keys in{" "}
        <code>.env</code> to enable live route generation and place search.
      </span>
      <Link to="/settings" className="banner__link">
        View status
      </Link>
    </div>
  );
}
