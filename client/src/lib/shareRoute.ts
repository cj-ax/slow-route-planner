import type { RoutePlan } from "@srp/shared";

/**
 * Share a route via the native share sheet when available, falling back to
 * copying a link/title to the clipboard. Best-effort — never throws.
 */
export async function shareRoute(plan: RoutePlan): Promise<void> {
  const url = plan.googleMapsUrl || window.location.href;
  const data = { title: plan.title, text: plan.summary, url };
  try {
    if (navigator.share) {
      await navigator.share(data);
      return;
    }
    await navigator.clipboard?.writeText(`${plan.title} — ${url}`);
  } catch {
    /* user cancelled or unsupported — nothing to do */
  }
}
