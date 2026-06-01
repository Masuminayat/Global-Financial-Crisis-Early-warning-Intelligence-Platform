import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { categoryColor, fmtNum, severityDot } from "@/lib/format";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ClientChart } from "@/components/ClientChart";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Global Dashboard — GFCEIP" },
      { name: "description", content: "Real-time global financial stability dashboard across 33 economies." },
    ],
  }),
  component: DashboardPage,
});

type GfssRow = { country_iso: string; score: number; category: string; trend_30d: number; countries: { name: string; slug: string; flag_emoji: string | null; region: string } };
type AlertRow = { id: string; country_iso: string; severity: string; title: string; message: string; triggered_at: string; countries: { name: string; flag_emoji: string | null } };

function DashboardPage() {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<string>("all");

  const { data: gfss = [] } = useQuery({
    queryKey: ["gfss-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gfss_scores")
        .select("country_iso,score,category,trend_30d,countries(name,slug,flag_emoji,region)")
        .order("score", { ascending: true });
      if (error) throw error;
      return (data as unknown as GfssRow[]) ?? [];
    },
  });

  const { data: alerts = [], refetch } = useQuery({
    queryKey: ["alerts-feed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id,country_iso,severity,title,message,triggered_at,countries(name,flag_emoji)")
        .order("triggered_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as unknown as AlertRow[]) ?? [];
    },
  });

  // Realtime alerts
  useEffect(() => {
    const ch = supabase
      .channel("alerts-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const regions = useMemo(() => Array.from(new Set(gfss.map((g) => g.countries.region))).sort(), [gfss]);
  const filtered = gfss
    .filter((g) => (region === "all" ? true : g.countries.region === region))
    .filter((g) => g.countries.name.toLowerCase().includes(q.toLowerCase()) || g.country_iso.toLowerCase().includes(q.toLowerCase()));

  const distribution = ["critical", "weak", "vulnerable", "stable", "strong"].map((c) => ({
    category: c,
    count: gfss.filter((g) => g.category === c).length,
  }));

  return (
    <AppShell badge={`${gfss.length} markets`}>
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Global Risk Dashboard</h1>
            <p className="text-sm text-muted-foreground">Composite stability scores across {gfss.length} monitored economies.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search country…"
              className="h-9 w-56 rounded-md border border-border bg-surface-2 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="h-9 rounded-md border border-border bg-surface-2 px-3 text-sm"
            >
              <option value="all">All regions</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="glass rounded-lg p-5 lg:col-span-2">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Stability Distribution</h3>
            <div className="h-56">
              <ClientChart>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distribution}>
                    <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 3" />
                    <XAxis dataKey="category" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ClientChart>
            </div>
          </div>

          <div className="glass rounded-lg">
            <div className="border-b border-border px-5 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Live Alerts</h3>
              <span className="font-mono text-xs flex items-center gap-1.5 text-muted-foreground"><span className="live-dot" /> {alerts.length}</span>
            </div>
            <ul className="max-h-72 overflow-auto divide-y divide-border/60">
              {alerts.slice(0, 12).map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDot(a.severity)}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{a.countries?.flag_emoji}</span>
                      <span className="font-mono">{a.country_iso}</span>
                      <span>·</span>
                      <span className="uppercase">{a.severity}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm">{a.title}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="glass mt-8 rounded-lg overflow-hidden">
          <div className="border-b border-border px-5 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">All Markets</h3>
            <span className="font-mono text-xs text-muted-foreground">{filtered.length} of {gfss.length}</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 font-normal">#</th>
                  <th className="px-5 py-2 font-normal">Country</th>
                  <th className="px-5 py-2 font-normal">Region</th>
                  <th className="px-5 py-2 font-normal text-right">GFSS</th>
                  <th className="px-5 py-2 font-normal text-right">30D</th>
                  <th className="px-5 py-2 font-normal">Category</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g, i) => (
                  <tr key={g.country_iso} className="border-t border-border/50 hover:bg-accent/30">
                    <td className="px-5 py-3 font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</td>
                    <td className="px-5 py-3">
                      <Link to="/country/$slug" params={{ slug: g.countries.slug }} className="hover:text-primary">
                        <span className="mr-2">{g.countries.flag_emoji}</span>
                        <span className="font-medium">{g.countries.name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{g.country_iso}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{g.countries.region}</td>
                    <td className={`num px-5 py-3 text-right ${categoryColor(g.category)}`}>{fmtNum(g.score, 1)}</td>
                    <td className={`num px-5 py-3 text-right ${Number(g.trend_30d) >= 0 ? "text-risk-low" : "text-risk-critical"}`}>
                      {Number(g.trend_30d) >= 0 ? "+" : ""}{fmtNum(g.trend_30d, 2)}
                    </td>
                    <td className={`px-5 py-3 text-xs uppercase tracking-wider ${categoryColor(g.category)}`}>{g.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
