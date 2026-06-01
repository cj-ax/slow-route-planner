import { useCallback, useEffect, useRef, useState } from "react";

export interface UseWakeLock {
  supported: boolean;
  active: boolean;
  error?: string;
  request: () => Promise<void>;
  release: () => Promise<void>;
}

/** Best-effort Screen Wake Lock with re-acquire on tab visibility. */
export function useWakeLock(): UseWakeLock {
  const supported =
    typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string>();
  const sentinel = useRef<WakeLockSentinel | null>(null);
  const wanted = useRef(false);

  const request = useCallback(async () => {
    if (!supported) {
      setError("Screen Wake Lock is not supported on this device.");
      return;
    }
    wanted.current = true;
    try {
      sentinel.current = await navigator.wakeLock.request("screen");
      setActive(true);
      setError(undefined);
      sentinel.current.addEventListener("release", () => setActive(false));
    } catch (err) {
      setError((err as Error).message || "Could not acquire wake lock.");
      setActive(false);
    }
  }, [supported]);

  const release = useCallback(async () => {
    wanted.current = false;
    try {
      await sentinel.current?.release();
    } catch {
      /* ignore */
    }
    sentinel.current = null;
    setActive(false);
  }, []);

  // Re-acquire when returning to the tab (wake locks drop on tab switch).
  useEffect(() => {
    if (!supported) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && wanted.current) {
        void request();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [supported, request]);

  useEffect(() => {
    return () => {
      void sentinel.current?.release();
      sentinel.current = null;
    };
  }, []);

  return { supported, active, error, request, release };
}
