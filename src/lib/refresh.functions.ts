import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Authenticated wrapper that calls the internal /api/public/hooks/refresh-pipeline
 * endpoint with the server-only REFRESH_SHARED_SECRET header.
 *
 * The browser must NEVER see REFRESH_SHARED_SECRET — that's why this is a
 * server function rather than a direct client fetch.
 */
export const triggerRefresh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const secret = process.env.REFRESH_SHARED_SECRET;
    if (!secret) throw new Error("REFRESH_SHARED_SECRET is not configured on the server.");

    const baseUrl =
      process.env.SITE_URL ||
      process.env.LOVABLE_DEPLOYMENT_URL ||
      "https://gfceip.lovable.app";

    const res = await fetch(`${baseUrl}/api/public/hooks/refresh-pipeline`, {
      method: "POST",
      headers: { "x-refresh-secret": secret },
    });

    if (!res.ok) {
      const t = await res.text();
      console.error(`[triggerRefresh] pipeline ${res.status}:`, t.slice(0, 500));
      throw new Error("Refresh failed. Please try again in a moment.");
    }
    return (await res.json()) as {
      countries_refreshed: number;
      indicator_rows: number;
      alerts_emitted: number;
      elapsed_ms: number;
    };
  });
