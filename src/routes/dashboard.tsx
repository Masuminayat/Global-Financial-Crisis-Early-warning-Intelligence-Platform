import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { categoryColor, fmtNum, severityDot } from "@/lib/format";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ClientChart } from "@/components/ClientChart";
import { formatCrisisType, sortRiskRows } from "@/lib/macro";
import { triggerRefresh } from "@/lib/refresh.functions";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Global Dashboard — GFCEIP" },
      { name: "description", content: "Real-time global financial stability dashboard across the full World Bank country universe." },
    ],
  }),
  component: DashboardPage,
});

type GfssRow = {
  country_iso: string;
  score: number;
  category: string;
  trend_30d: number;
  countries: { name: string; slug: string; flag_emoji: string | null; region: string; sub_region: string | null };
};
type AlertRow = { id: string; country_iso: string; severity: string; title: string; message: string; triggered_at: string; countries: { name: string; flag_emoji: string | null } };
type RiskRow = { country_iso: string; probability: number; risk_level: string; crisis_type: string; horizon_months: number; generated_at: string; model_version: string };

const CATEGORIES = ["all", "critical", "weak", "vulnerable", "stable", "strong"] as const;
type Category = (typeof CATEGORIES)[number];

type SortKey = "score" | "name" | "trend";
const PAGE_SIZE = 30;

function DashboardPage() {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<string>("all");
  const [category, setCategory] = useState<Category>("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const { data: gfss = [] } = useQuery({
    queryKey: ["gfss-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gfss_scores")
        .select("country_iso,score,category,trend_30d,countries(name,slug,flag_emoji,region,sub_region)")
        .order("score", { ascending: true });
      if (error) throw error;
      return (data as unknown as GfssRow[]) ?? [];
    },
  });

  const { data: alertsFeed, refetch } = useQuery({
    queryKey: ["alerts-feed"],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("alerts")
        .select("id,country_iso,severity,title,message,triggered_at,countries(name,flag_emoji)", { count: "exact" })
        .order("triggered_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return { rows: (data as unknown as AlertRow[]) ?? [], total: count ?? 0 };
    },
  });

  const { data: risks = [] } = useQuery({
    queryKey: ["risk-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_scores")
        .select("country_iso,probability,risk_level,crisis_type,horizon_months,generated_at,model_version")
        .order("probability", { ascending: false });
      if (error) throw error;
      return (data as unknown as RiskRow[]) ?? [];
    },
  });

  const { data: meta } = useQuery({
    queryKey: ["dashboard-meta"],
    queryFn: async () => {
      const [{ data: g }, { data: r }] = await Promise.all([
        supabase.from("gfss_scores").select("updated_at").order("updated_at", { ascending: false }).limit(1),
        supabase.from("risk_scores").select("model_version,generated_at").order("generated_at", { ascending: false }).limit(1),
      ]);
      return {
        lastRefresh: g?.[0]?.updated_at ?? null,
        modelVersion: r?.[0]?.model_version ?? "—",
        modelGeneratedAt: r?.[0]?.generated_at ?? null,
      };
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const alerts = alertsFeed?.rows ?? [];
  const alertTotal = alertsFeed?.total ?? 0;
  const risksByCountry = useMemo(() => risks.reduce<Record<string, RiskRow[]>>((acc, row) => {
    (acc[row.country_iso] ??= []).push(row);
    return acc;
  }, {}), [risks]);
  const refresh = useServerFn(triggerRefresh);
  const runRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const j = await refresh();
      setRefreshMsg(`Refreshed ${j.countries_refreshed} countries · ${j.indicator_rows} indicator rows · ${j.alerts_emitted} alerts in ${(j.elapsed_ms / 1000).toFixed(1)}s`);
      await Promise.all([refetch()]);
    } catch (e) {
      setRefreshMsg(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRefreshing(false);
    }
  };


  useEffect(() => {
    const ch = supabase
      .channel("alerts-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  // Reset to first page whenever a filter changes.
  useEffect(() => { setPage(1); }, [q, region, category, sortKey, sortDir]);

  const regions = useMemo(() => Array.from(new Set(gfss.map((g) => g.countries.region))).sort(), [gfss]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = gfss
      .filter((g) => (region === "all" ? true : g.countries.region === region))
      .filter((g) => (category === "all" ? true : g.category === category))
      .filter((g) =>
        !needle ||
        g.countries.name.toLowerCase().includes(needle) ||
        g.country_iso.toLowerCase().includes(needle) ||
        (g.countries.sub_region ?? "").toLowerCase().includes(needle),
      );
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "name") return a.countries.name.localeCompare(b.countries.name) * dir;
      if (sortKey === "trend") return (Number(a.trend_30d) - Number(b.trend_30d)) * dir;
      return (Number(a.score) - Number(b.score)) * dir;
    });
    return rows;
  }, [gfss, q, region, category, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // KPI calculations
  const kpis = useMemo(() => {
    if (!gfss.length) return null;
    const scores = gfss.map((g) => Number(g.score));
    const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
    const atRisk = gfss.filter((g) => g.category === "critical" || g.category === "weak").length;
    const trends = gfss.map((g) => Number(g.trend_30d));
    const improving = trends.filter((t) => t > 0).length;
    const median = (() => {
      const s = [...scores].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    })();
    return { avg, median, atRisk, atRiskPct: (atRisk / gfss.length) * 100, improving, improvingPct: (improving / gfss.length) * 100 };
  }, [gfss]);

  const distribution = ["critical", "weak", "vulnerable", "stable", "strong"].map((c) => ({
    category: c,
    count: gfss.filter((g) => g.category === c).length,
  }));

  const topMovers = useMemo(() => {
    const moved = gfss.filter((g) => Number(g.trend_30d) !== 0);
    const up = [...moved].sort((a, b) => Number(b.trend_30d) - Number(a.trend_30d)).slice(0, 5);
    const down = [...moved].sort((a, b) => Number(a.trend_30d) - Number(b.trend_30d)).slice(0, 5);
    return { up, down };
  }, [gfss]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  return (
    <AppShell badge={`${gfss.length} markets`}>
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Global Risk Dashboard</h1>
            <p className="text-sm text-muted-foreground">Composite stability scores across {gfss.length} monitored economies (full World Bank universe).</p>
          </div>
          <button
            onClick={runRefresh}
            disabled={refreshing}
            className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-3 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh from World Bank"}
          </button>
        </div>

        {/* Freshness strip — proves the data is real, not seeded */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/60 bg-surface-2/40 px-3 py-2 text-[11px] font-mono text-muted-foreground">
          <span>📡 Source: <span className="text-foreground">World Bank Open Data API</span></span>
          <span>·</span>
          <span>Model: <span className="text-foreground">{meta?.modelVersion ?? "—"}</span> (XGBoost, test F1 = 0.844)</span>
          <span>·</span>
          <span>Last scored: <span className="text-foreground">{meta?.lastRefresh ? new Date(meta.lastRefresh).toLocaleString() : "—"}</span></span>
          {refreshMsg && <><span>·</span><span className="text-primary">{refreshMsg}</span></>}
        </div>


        {/* KPI strip */}
        {kpis && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Avg GFSS" value={fmtNum(kpis.avg, 1)} sub={`Median ${fmtNum(kpis.median, 1)}`} />
            <KpiCard label="At-Risk Markets" value={String(kpis.atRisk)} sub={`${fmtNum(kpis.atRiskPct, 1)}% critical+weak`} tone="risk" />
            <KpiCard label="Improving (30D)" value={String(kpis.improving)} sub={`${fmtNum(kpis.improvingPct, 1)}% trending up`} tone="good" />
            <KpiCard label="Coverage" value={`${gfss.length}`} sub={`${regions.length} regions`} />
          </div>
        )}

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
              <span className="font-mono text-xs flex items-center gap-1.5 text-muted-foreground"><span className="live-dot" /> {alertTotal}</span>
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
              {alerts.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No active alerts.</li>}
            </ul>
          </div>
        </div>

        {/* Top movers */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <MoversPanel title="Top 5 Improving (30D)" rows={topMovers.up} positive />
          <MoversPanel title="Top 5 Deteriorating (30D)" rows={topMovers.down} positive={false} />
        </div>

        {/* Filters + table */}
        <div className="glass mt-8 rounded-lg overflow-hidden">
          <div className="border-b border-border px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">All Markets</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search country, ISO, sub-region…"
                className="h-9 w-64 rounded-md border border-border bg-surface-2 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
              <select value={region} onChange={(e) => setRegion(e.target.value)} className="h-9 rounded-md border border-border bg-surface-2 px-3 text-sm">
                <option value="all">All regions</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="h-9 rounded-md border border-border bg-surface-2 px-3 text-sm capitalize">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c === "all" ? "All tiers" : c}</option>)}
              </select>
              <span className="font-mono text-xs text-muted-foreground">{filtered.length} of {gfss.length}</span>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 font-normal">#</th>
                  <th className="px-5 py-2 font-normal cursor-pointer hover:text-foreground" onClick={() => handleSort("name")}>Country {sortKey === "name" && (sortDir === "asc" ? "↑" : "↓")}</th>
                  <th className="px-5 py-2 font-normal">Region</th>
                  <th className="px-5 py-2 font-normal text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("score")}>GFSS {sortKey === "score" && (sortDir === "asc" ? "↑" : "↓")}</th>
                  <th className="px-5 py-2 font-normal text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("trend")}>30D {sortKey === "trend" && (sortDir === "asc" ? "↑" : "↓")}</th>
                  <th className="px-5 py-2 font-normal">Live model</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((g, i) => (
                  <tr key={g.country_iso} className="border-t border-border/50 hover:bg-accent/30">
                    <td className="px-5 py-3 font-mono text-muted-foreground">{String((page - 1) * PAGE_SIZE + i + 1).padStart(3, "0")}</td>
                    <td className="px-5 py-3">
                      <Link to="/country/$slug" params={{ slug: g.countries.slug }} className="hover:text-primary">
                        <span className="mr-2">{g.countries.flag_emoji}</span>
                        <span className="font-medium">{g.countries.name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{g.country_iso}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span>{g.countries.region}</span>
                      {g.countries.sub_region && <span className="ml-2 text-xs opacity-70">· {g.countries.sub_region}</span>}
                    </td>
                    <td className={`num px-5 py-3 text-right ${categoryColor(g.category)}`}>{fmtNum(g.score, 1)}</td>
                    <td className={`num px-5 py-3 text-right ${Number(g.trend_30d) >= 0 ? "text-risk-low" : "text-risk-critical"}`}>
                      {Number(g.trend_30d) >= 0 ? "+" : ""}{fmtNum(g.trend_30d, 2)}
                    </td>
                    <td className="px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground">
                      {(() => {
                        const lead = sortRiskRows(risksByCountry[g.country_iso] ?? [])[0];
                        return lead ? `${formatCrisisType(lead.crisis_type)} · ${fmtNum(lead.probability * 100, 1)}%` : g.category;
                      })()}
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">No markets match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-border px-5 py-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-mono text-xs">
                Page {page} of {totalPages} · showing {pageRows.length} of {filtered.length}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="px-3 h-8 rounded-md border border-border bg-surface-2 disabled:opacity-40 hover:bg-accent/30">«</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 h-8 rounded-md border border-border bg-surface-2 disabled:opacity-40 hover:bg-accent/30">‹</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 h-8 rounded-md border border-border bg-surface-2 disabled:opacity-40 hover:bg-accent/30">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-3 h-8 rounded-md border border-border bg-surface-2 disabled:opacity-40 hover:bg-accent/30">»</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "risk" }) {
  const toneClass = tone === "good" ? "text-risk-low" : tone === "risk" ? "text-risk-critical" : "text-foreground";
  return (
    <div className="glass rounded-lg p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function MoversPanel({ title, rows, positive }: { title: string; rows: GfssRow[]; positive: boolean }) {
  return (
    <div className="glass rounded-lg">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((g) => (
          <li key={g.country_iso} className="flex items-center justify-between px-5 py-3">
            <Link to="/country/$slug" params={{ slug: g.countries.slug }} className="flex items-center gap-2 hover:text-primary min-w-0">
              <span>{g.countries.flag_emoji}</span>
              <span className="font-medium truncate">{g.countries.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{g.country_iso}</span>
            </Link>
            <div className="flex items-center gap-4 shrink-0">
              <span className={`num text-sm ${categoryColor(g.category)}`}>{fmtNum(g.score, 1)}</span>
              <span className={`num text-sm font-medium ${positive ? "text-risk-low" : "text-risk-critical"}`}>
                {Number(g.trend_30d) >= 0 ? "+" : ""}{fmtNum(g.trend_30d, 2)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
