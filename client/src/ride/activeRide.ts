import type { RoutePlan } from "@srp/shared";

// The plan most recently sent to Ride Mode via "Start Ride". Stored in the
// browser so the cockpit works on a freshly generated route without a server
// save — important on Vercel, where saved-route persistence needs a Blob store.
const KEY = "srp.activeRide";

export function saveActiveRide(plan: RoutePlan): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    /* storage unavailable — Ride Mode will just show the load error */
  }
}

export function loadActiveRide(): RoutePlan | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RoutePlan) : null;
  } catch {
    return null;
  }
}
