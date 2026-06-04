import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { categoryColor, fmtNum, riskLevelColor } from "@/lib/format";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ClientChart } from "@/components/ClientChart";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { INDICATOR_ALIASES, formatCrisisType, groupIndicators, latestValue, metricSeries, previousDelta, sortRiskRows } from "@/lib/macro";

export const Route = createFileRoute("/pakistan")({
  head: () => ({
    meta: [
      { title: "Pakistan Intelligence Center — GFCEIP" },
      { name: "description", content: "Dedicated deep-dive on Pakistan's macro stability: PKR, SBP reserves, IMF status, inflation, and crisis probabilities." },
    ],
  }),
  component: PakistanPage,
});

function PakistanPage() {
  const iso = "PK";
  const { data: country } = useQuery({
    queryKey: ["country-pk"],
    queryFn: async () => (await supabase.from("countries").select("*").eq("iso_code", iso).maybeSingle()).data,
  });
  const { data: gfss } = useQuery({
    queryKey: ["gfss-pk"],
    queryFn: async () => (await supabase.from("gfss_scores").select("*").eq("country_iso", iso).maybeSingle()).data,
  });
  const { data: indicators = [] } = useQuery({
    queryKey: ["ind-pk"],
    queryFn: async () => (await supabase.from("economic_indicators").select("*").eq("country_iso", iso).order("period_date")).data ?? [],
  });
  const { data: risks = [] } = useQuery({
    queryKey: ["risk-pk"],
    queryFn: async () => (await supabase.from("risk_scores").select("*").eq("country_iso", iso).order("horizon_months")).data ?? [],
  });

  const grouped = groupIndicators(indicators as Array<{ indicator_code: string; period_date: string; value: number | string | null }>);
  const reservesSeries = metricSeries(grouped, INDICATOR_ALIASES.reserves, "reserves");
  const fxSeries = metricSeries(grouped, INDICATOR_ALIASES.fx, "fx");
  const cpiSeries = metricSeries(grouped, INDICATOR_ALIASES.inflation, "cpi");
  const primaryRisk = sortRiskRows(risks as Array<{ crisis_type: string; horizon_months: number; probability: number; risk_level: string }>)[0];

  return (
    <AppShell badge="🇵🇰 PK">
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-primary">PAKISTAN INTELLIGENCE CENTER</div>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight">🇵🇰 Islamic Republic of Pakistan</h1>
            <p className="mt-1 text-sm text-muted-foreground font-mono">
              {country?.iso_code} · {country?.currency_code} · GDP {fmtNum(country?.gdp_usd_bn, 0)} bn · Pop {fmtNum((country?.population ?? 0) / 1e6, 1)}M
            </p>
          </div>
          {gfss && (
            <div className="glass rounded-lg px-6 py-4 text-center">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">GFSS</div>
              <div className={`num text-4xl ${categoryColor((gfss as { category: string }).category)}`}>{fmtNum((gfss as { score: number }).score, 1)}</div>
              <div className={`text-xs uppercase ${categoryColor((gfss as { category: string }).category)}`}>{(gfss as { category: string }).category}</div>
            </div>
          )}
        </div>

        {/* Top stat cards */}
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {[
            { label: "FX Reserves", value: fmtNum(latestValue(grouped, INDICATOR_ALIASES.reserves), 1), unit: "USD bn", icon: TrendingDown, accent: "text-risk-high" },
            { label: "CPI Inflation", value: fmtNum(latestValue(grouped, INDICATOR_ALIASES.inflation), 1), unit: "%", icon: AlertTriangle, accent: "text-risk-critical" },
            { label: "Interest Rate", value: fmtNum(latestValue(grouped, INDICATOR_ALIASES.rates), 2), unit: "%", icon: AlertTriangle, accent: "text-cyan" },
            { label: "Public Debt", value: fmtNum(latestValue(grouped, INDICATOR_ALIASES.debt), 1), unit: "% of GDP", icon: TrendingDown, accent: "text-risk-high" },
          ].map((s) => (
            <div key={s.label} className="glass rounded-lg p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</span>
                <s.icon className={`h-4 w-4 ${s.accent}`} />
              </div>
              <div className={`num mt-3 text-3xl ${s.accent}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.unit}</div>
            </div>
          ))}
        </div>

        {primaryRisk && (
          <div className="glass mt-6 rounded-lg px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Highest live model risk</div>
                <div className="mt-1 text-lg font-medium capitalize">{formatCrisisType(primaryRisk.crisis_type)}</div>
              </div>
              <div className="text-right">
                <div className={`num text-2xl ${riskLevelColor(primaryRisk.risk_level)}`}>{fmtNum(primaryRisk.probability * 100, 1)}%</div>
                <div className={`text-xs uppercase ${riskLevelColor(primaryRisk.risk_level)}`}>{primaryRisk.risk_level} · {primaryRisk.horizon_months}M</div>
              </div>
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <ChartCard title="SBP FX Reserves (USD bn)" data={reservesSeries} dataKey="reserves" color="var(--cyan)" />
          <ChartCard title="PKR/USD Index" data={fxSeries} dataKey="fx" color="var(--magenta)" />
          <ChartCard title="CPI Inflation %" data={cpiSeries} dataKey="cpi" color="var(--risk-high)" />
        </div>

        {/* Crisis probabilities — pivoted: one row per crisis type, columns per horizon */}
        {(() => {
          const rows = risks as Array<{ crisis_type: string; horizon_months: number; probability: number; risk_level: string }>;
          const horizons = [6, 12, 24];
          const byType = new Map<string, Record<number, { probability: number; risk_level: string }>>();
          for (const r of rows) {
            if (!byType.has(r.crisis_type)) byType.set(r.crisis_type, {});
            byType.get(r.crisis_type)![r.horizon_months] = { probability: r.probability, risk_level: r.risk_level };
          }
          const crisisOrder = Array.from(byType.keys()).sort((a, b) => {
            const pa = byType.get(a)?.[12]?.probability ?? 0;
            const pb = byType.get(b)?.[12]?.probability ?? 0;
            return pb - pa;
          });
          return (
            <div className="glass mt-8 rounded-lg overflow-hidden">
              <div className="border-b border-border px-5 py-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Live Risk Output</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Crisis probability by forecast horizon. Each row is one crisis type; columns show the chance of it occurring within the next 6, 12, or 24 months.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-2 font-normal">Crisis Type</th>
                      {horizons.map((h) => (
                        <th key={h} className="px-5 py-2 font-normal text-right">{h}M Horizon</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {crisisOrder.map((ct) => {
                      const cells = byType.get(ct)!;
                      return (
                        <tr key={ct} className="border-t border-border/50">
                          <td className="px-5 py-3 capitalize font-medium">{formatCrisisType(ct)}</td>
                          {horizons.map((h) => {
                            const c = cells[h];
                            if (!c) return <td key={h} className="px-5 py-3 text-right text-muted-foreground">—</td>;
                            return (
                              <td key={h} className="px-5 py-3 text-right">
                                <div className={`num ${riskLevelColor(c.risk_level)}`}>{fmtNum(c.probability * 100, 1)}%</div>
                                <div className={`text-[10px] uppercase tracking-wider ${riskLevelColor(c.risk_level)}`}>{c.risk_level}</div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr className="border-t border-border/50">
                        <td colSpan={horizons.length + 1} className="px-5 py-6 text-center text-sm text-muted-foreground">No live risk rows available yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/simulator" search={{ iso: "PK" }} className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground ring-glow-cyan">
            Run policy simulator for Pakistan →
          </Link>
          <Link to="/copilot" className="rounded-md border border-border bg-surface-2 px-5 py-2.5 text-sm hover:bg-accent">
            Ask AI Copilot about Pakistan
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function ChartCard({ title, data, dataKey, color }: { title: string; data: Array<Record<string, number | string>>; dataKey: string; color: string }) {
  return (
    <div className="glass rounded-lg p-5">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="h-48">
        <ClientChart>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} />
              <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#g-${dataKey})`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ClientChart>
      </div>
    </div>
  );
}
