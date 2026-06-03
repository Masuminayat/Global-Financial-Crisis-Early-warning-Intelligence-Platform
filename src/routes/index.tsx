import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertTriangle, ArrowUpRight, Globe2, TrendingDown, TrendingUp, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GFCEIP — Global Financial Crisis Early Warning Platform" },
      { name: "description", content: "Real-time crisis probability, GFSS stability scores, and economic intelligence for 200+ economies. Bloomberg-grade analytics, open access." },
      { property: "og:title", content: "GFCEIP — Global Financial Crisis Early Warning" },
      { property: "og:description", content: "Real-time crisis probability and economic intelligence across the global market universe." },
    ],
  }),
  component: Landing,
});

type GfssRow = { country_iso: string; score: number; category: string; trend_30d: number; countries: { name: string; slug: string; flag_emoji: string | null; region: string } };
type AlertRow = { id: string; country_iso: string; severity: string; title: string; triggered_at: string; countries: { name: string; flag_emoji: string | null } };

function categoryColor(cat: string) {
  switch (cat) {
    case "critical": return "text-risk-critical";
    case "weak": return "text-risk-high";
    case "vulnerable": return "text-risk-moderate";
    case "stable": return "text-risk-low";
    case "strong": return "text-risk-strong";
    default: return "text-muted-foreground";
  }
}
function severityDot(sev: string) {
  return sev === "critical" ? "bg-risk-critical" : sev === "warning" ? "bg-risk-high" : "bg-cyan";
}

function Landing() {
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

  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id,country_iso,severity,title,triggered_at,countries(name,flag_emoji)")
        .order("triggered_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data as unknown as AlertRow[]) ?? [];
    },
  });

  const globalAvg = gfss.length ? gfss.reduce((s, g) => s + Number(g.score), 0) / gfss.length : 0;
  const criticalCount = gfss.filter((g) => g.category === "critical" || g.category === "weak").length;
  const vulnerable = [...gfss].slice(0, 10);

  return (
    <div className="min-h-screen">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-border glass-strong">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Activity className="h-4 w-4" />
            </div>
            <span className="font-mono text-sm tracking-tight">
              <span className="text-primary text-glow-cyan">GFCEIP</span>
              <span className="ml-2 text-muted-foreground">/ v1.0</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {([
              ["Dashboard", "/dashboard"],
              ["Pakistan", "/pakistan"],
              ["Compare", "/compare"],
              ["Simulator", "/simulator"],
              ["Crises", "/crisis-explorer"],
              ["Copilot", "/copilot"],
            ] as const).map(([label, to]) => (
              <Link key={label} to={to} className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span className="live-dot" />
            LIVE · {gfss.length} markets
          </div>
        </div>
      </header>

      {/* TICKER */}
      <div className="overflow-hidden border-b border-border bg-surface-1/60">
        <div className="ticker-track flex gap-8 whitespace-nowrap py-2 text-xs font-mono">
          {[...gfss, ...gfss].map((g, i) => (
            <span key={i} className="flex items-center gap-2">
              <span>{g.countries.flag_emoji}</span>
              <span className="text-muted-foreground">{g.country_iso}</span>
              <span className={categoryColor(g.category)}>{Number(g.score).toFixed(1)}</span>
              <span className={Number(g.trend_30d) >= 0 ? "text-risk-low" : "text-risk-critical"}>
                {Number(g.trend_30d) >= 0 ? "▲" : "▼"}{Math.abs(Number(g.trend_30d)).toFixed(2)}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-grid opacity-60" />
        <div className="relative mx-auto max-w-[1600px] px-6 py-20">
          <div className="flex items-center gap-2 text-xs font-mono text-primary">
            <Zap className="h-3.5 w-3.5" /> EARLY WARNING SYSTEM · OPERATIONAL
          </div>
          <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Predicting financial crises <span className="text-primary text-glow-cyan">before</span> they happen.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Continuous monitoring of {gfss.length || "200+"} economies. Six crisis types. Three horizons. One composite stability index.
            Built for analysts, policymakers, and traders.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground ring-glow-cyan hover:bg-primary/90">
              Open dashboard <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link to="/pakistan" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-5 py-2.5 text-sm hover:bg-accent">
              Explore Pakistan intelligence
            </Link>
          </div>

          {/* HERO STATS */}
          <div className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "Countries monitored", value: gfss.length, icon: Globe2 },
              { label: "Active alerts", value: alerts.length, icon: AlertTriangle, accent: "text-risk-high" },
              { label: "Global stability avg", value: globalAvg.toFixed(1), icon: Activity, accent: "text-primary" },
              { label: "Critical/weak", value: criticalCount, icon: TrendingDown, accent: "text-risk-critical" },
            ].map((s) => (
              <div key={s.label} className="glass rounded-lg p-5 fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</span>
                  <s.icon className={`h-4 w-4 ${s.accent ?? "text-muted-foreground"}`} />
                </div>
                <div className={`num mt-3 text-3xl ${s.accent ?? ""}`}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DASHBOARD GRID */}
      <section className="mx-auto max-w-[1600px] px-6 py-14">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Global Risk Board</h2>
            <p className="text-sm text-muted-foreground">Live composite stability scores across monitored economies.</p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">GFSS · 0 critical → 100 strong</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Most vulnerable */}
          <div className="glass rounded-lg lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Most Vulnerable</h3>
              <span className="font-mono text-xs text-muted-foreground">TOP 10</span>
            </div>
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
                {vulnerable.map((g, i) => (
                  <tr key={g.country_iso} className="border-t border-border/50 hover:bg-accent/30">
                    <td className="px-5 py-3 font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</td>
                    <td className="px-5 py-3">
                      <span className="mr-2">{g.countries.flag_emoji}</span>
                      <span className="font-medium">{g.countries.name}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{g.country_iso}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{g.countries.region}</td>
                    <td className={`num px-5 py-3 text-right ${categoryColor(g.category)}`}>{Number(g.score).toFixed(1)}</td>
                    <td className={`num px-5 py-3 text-right ${Number(g.trend_30d) >= 0 ? "text-risk-low" : "text-risk-critical"}`}>
                      {Number(g.trend_30d) >= 0 ? "+" : ""}{Number(g.trend_30d).toFixed(2)}
                    </td>
                    <td className={`px-5 py-3 text-xs uppercase tracking-wider ${categoryColor(g.category)}`}>{g.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Alerts feed */}
          <div className="glass rounded-lg">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Active Alerts</h3>
              <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <span className="live-dot" /> LIVE
              </span>
            </div>
            <ul className="divide-y divide-border/60">
              {alerts.map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDot(a.severity)}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{a.countries?.flag_emoji}</span>
                      <span className="font-mono">{a.country_iso}</span>
                      <span>·</span>
                      <span className="uppercase tracking-wider">{a.severity}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm">{a.title}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Regional bands */}
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Object.entries(
            gfss.reduce<Record<string, GfssRow[]>>((acc, g) => {
              (acc[g.countries.region] ||= []).push(g);
              return acc;
            }, {})
          ).map(([region, rows]) => {
            const avg = rows.reduce((s, r) => s + Number(r.score), 0) / rows.length;
            return (
              <div key={region} className="glass rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">{region}</span>
                  <span className="font-mono text-xs text-muted-foreground">{rows.length} markets</span>
                </div>
                <div className="num mt-2 text-3xl">{avg.toFixed(1)}</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full bg-gradient-to-r from-risk-critical via-risk-moderate to-risk-strong" style={{ width: `${avg}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {rows.slice(0, 6).map((r) => (
                    <span key={r.country_iso} title={r.countries.name} className="text-base">{r.countries.flag_emoji}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FEATURES */}
      <section className="border-t border-border bg-surface-1/50">
        <div className="mx-auto max-w-[1600px] px-6 py-16 grid gap-6 md:grid-cols-3">
          {[
            { t: "Six crisis models", d: "Currency, sovereign debt, banking, IMF bailout, capital flight, BoP — at 6, 12, and 24-month horizons." },
            { t: "Explainable predictions", d: "Top driver attributions on every score so analysts know what's moving the dial." },
            { t: "Pakistan deep-dive", d: "Dedicated intelligence center: IMF status, PKR/USD, SBP reserves, policy simulator." },
          ].map((f) => (
            <div key={f.t} className="glass rounded-lg p-6">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{f.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 px-6 py-8 text-xs text-muted-foreground md:flex-row">
          <span className="font-mono">GFCEIP © 2026 · Built for transparency in global macro risk.</span>
          <span>Data: World Bank · IMF · FRED · OECD · BIS · GDELT</span>
        </div>
      </footer>
    </div>
  );
}
