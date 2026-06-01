import { useHydrated } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Renders chart children only after hydration. Recharts measures DOM and
 *  generates IDs that don't survive SSR cleanly. */
export function ClientChart({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const hydrated = useHydrated();
  if (!hydrated) return <>{fallback}</>;
  return <>{children}</>;
}
