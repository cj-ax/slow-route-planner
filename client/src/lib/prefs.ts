// Small UI preferences in localStorage (per device). Failures are ignored.
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`deer.${key}`);
    return v ? ({ ...fallback, ...JSON.parse(v) } as T) : fallback;
  } catch {
    return fallback;
  }
}
export function loadScalar<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`deer.${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`deer.${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
