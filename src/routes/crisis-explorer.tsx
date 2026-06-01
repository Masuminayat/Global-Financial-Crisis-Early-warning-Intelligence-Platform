import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/crisis-explorer")({
  head: () => ({ meta: [{ title: "Crisis Explorer — GFCEIP" }, { name: "description", content: "Historical financial crises database with warning-signal patterns." }] }),
  component: CrisisExplorerPage,
});

type Crisis = {
  id: string;
  name: string;
  crisis_type: string;
  severity: string;
  country_iso: string | null;
  region: string | null;
  start_date: string;
  end_date: string | null;
  description: string;
  outcome: string | null;
  warning_signals: unknown;
};

function CrisisExplorerPage() {
  const [filter, setFilter] = useState<string>("all");

  const { data: crises = [] } = useQuery({
    queryKey: ["crises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("crisis_events").select("*").order("start_date", { ascending: false });
      if (error) throw error;
      return (data as Crisis[]) ?? [];
    },
  });

  const filtered = filter === "all" ? crises : crises.filter((c) => c.crisis_type === filter);

  return (
    <AppShell badge="HISTORICAL">
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Crisis Explorer</h1>
        <p className="text-sm text-muted-foreground">Reference library of past financial crises and their warning signals.</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {["all","currency_crisis","sovereign_debt","banking_crisis","imf_bailout","capital_flight","bop_crisis"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-md border px-3 py-1.5 text-xs uppercase tracking-wider ${filter === t ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted-foreground hover:text-foreground"}`}
            >
              {t.replaceAll("_", " ")}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.length === 0 && (
            <div className="glass rounded-lg p-6 text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
              No crises catalogued yet for this filter.
            </div>
          )}
          {filtered.map((c) => (
            <article key={c.id} className="glass rounded-lg p-5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono uppercase text-muted-foreground">{c.crisis_type.replaceAll("_", " ")}</span>
                <span className={`uppercase ${c.severity === "critical" ? "text-risk-critical" : c.severity === "warning" ? "text-risk-high" : "text-cyan"}`}>{c.severity}</span>
              </div>
              <h3 className="mt-2 text-lg font-semibold">{c.name}</h3>
              <div className="mt-1 text-xs font-mono text-muted-foreground">
                {c.country_iso ?? c.region ?? "Global"} · {c.start_date}{c.end_date ? ` → ${c.end_date}` : " → ongoing"}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{c.description}</p>
              {Array.isArray(c.warning_signals) && (c.warning_signals as string[]).length > 0 && (
                <div className="mt-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Warning signals</div>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {(c.warning_signals as string[]).map((w) => (
                      <li key={w} className="rounded-md bg-surface-2 px-2 py-1 text-xs">{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {c.outcome && (
                <div className="mt-3 text-xs text-muted-foreground"><span className="uppercase tracking-wider">Outcome:</span> {c.outcome}</div>
              )}
            </article>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
