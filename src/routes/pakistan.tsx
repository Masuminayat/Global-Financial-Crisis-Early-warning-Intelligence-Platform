import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { categoryColor, fmtNum, riskLevelColor } from "@/lib/format";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { AlertTriangle, TrendingDown } from "lucide-react";

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

  const grouped: Record<string, { period_date: string; value: number }[]> = {};
  for (const i of indicators) (grouped[i.indicator_code] ||= []).push({ period_date: i.period_date as string, value: Number(i.value) });

  const reservesSeries = (grouped["fx_reserves_usd_bn"] ?? []).map((r) => ({ date: r.period_date.slice(0, 7), reserves: r.value }));
  const fxSeries = (grouped["exchange_rate_idx"] ?? []).map((r) => ({ date: r.period_date.slice(0, 7), fx: r.value }));
  const cpiSeries = (grouped["cpi_inflation"] ?? []).map((r) => ({ date: r.period_date.slice(0, 7), cpi: r.value }));

  const latest = (code: string) => grouped[code]?.slice(-1)[0]?.value;

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
            { label: "FX Reserves", value: fmtNum(latest("fx_reserves_usd_bn"), 1), unit: "USD bn", icon: TrendingDown, accent: "text-risk-high" },
            { label: "CPI Inflation", value: fmtNum(latest("cpi_inflation"), 1), unit: "%", icon: AlertTriangle, accent: "text-risk-critical" },
            { label: "Policy Rate (SBP)", value: fmtNum(latest("policy_rate"), 2), unit: "%", icon: AlertTriangle, accent: "text-cyan" },
            { label: "Public Debt", value: fmtNum(latest("public_debt_gdp"), 1), unit: "% of GDP", icon: TrendingDown, accent: "text-risk-high" },
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

        {/* Charts */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <ChartCard title="SBP FX Reserves (USD bn)" data={reservesSeries} dataKey="reserves" color="var(--cyan)" />
          <ChartCard title="PKR/USD Index" data={fxSeries} dataKey="fx" color="var(--magenta)" />
          <ChartCard title="CPI Inflation %" data={cpiSeries} dataKey="cpi" color="var(--risk-high)" />
        </div>

        {/* Crisis probabilities */}
        <div className="glass mt-8 rounded-lg overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Crisis Probability Matrix</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2 font-normal">Crisis Type</th>
                <th className="px-5 py-2 font-normal text-right">6M</th>
                <th className="px-5 py-2 font-normal text-right">12M</th>
                <th className="px-5 py-2 font-normal text-right">24M</th>
              </tr>
            </thead>
            <tbody>
              {["currency_crisis","sovereign_debt","banking_crisis","imf_bailout","capital_flight","bop_crisis"].map((ct) => {
                const cells = [6, 12, 24].map((h) => risks.find((r) => r.crisis_type === ct && r.horizon_months === h));
                return (
                  <tr key={ct} className="border-t border-border/50">
                    <td className="px-5 py-3 capitalize">{ct.replaceAll("_", " ")}</td>
                    {cells.map((c, i) => (
                      <td key={i} className={`num px-5 py-3 text-right ${c ? riskLevelColor((c as { risk_level: string }).risk_level) : "text-muted-foreground"}`}>
                        {c ? `${(Number((c as { probability: number }).probability) * 100).toFixed(1)}%` : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

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
      </div>
    </div>
  );
}
