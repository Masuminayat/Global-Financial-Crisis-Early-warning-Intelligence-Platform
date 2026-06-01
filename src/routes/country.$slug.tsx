import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { categoryColor, fmtNum, riskLevelColor } from "@/lib/format";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/country/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — Country Intelligence — GFCEIP` },
      { name: "description", content: `Macro indicators, crisis probabilities, GFSS score, and forecasts for ${params.slug}.` },
    ],
  }),
  component: CountryPage,
});

type Country = { iso_code: string; name: string; slug: string; region: string; sub_region: string | null; flag_emoji: string | null; currency_code: string | null; gdp_usd_bn: number | null; population: number | null };
type Indicator = { indicator_code: string; indicator_name: string; period_date: string; value: number; unit: string | null };
type Risk = { crisis_type: string; horizon_months: number; probability: number; risk_level: string; top_drivers: unknown; generated_at: string };
type Gfss = { score: number; category: string; trend_30d: number };

function CountryPage() {
  const { slug } = Route.useParams();

  const { data: country } = useQuery({
    queryKey: ["country", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("countries").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as Country;
    },
  });

  const iso = country?.iso_code;

  const { data: gfss } = useQuery({
    enabled: !!iso,
    queryKey: ["gfss", iso],
    queryFn: async () => {
      const { data } = await supabase.from("gfss_scores").select("score,category,trend_30d").eq("country_iso", iso!).maybeSingle();
      return data as Gfss | null;
    },
  });

  const { data: indicators = [] } = useQuery({
    enabled: !!iso,
    queryKey: ["indicators", iso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("economic_indicators")
        .select("indicator_code,indicator_name,period_date,value,unit")
        .eq("country_iso", iso!)
        .order("period_date", { ascending: true });
      if (error) throw error;
      return (data as Indicator[]) ?? [];
    },
  });

  const { data: risks = [] } = useQuery({
    enabled: !!iso,
    queryKey: ["risks", iso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_scores")
        .select("crisis_type,horizon_months,probability,risk_level,top_drivers,generated_at")
        .eq("country_iso", iso!)
        .order("horizon_months", { ascending: true });
      if (error) throw error;
      return (data as Risk[]) ?? [];
    },
  });

  // group indicators by code, take latest
  const grouped: Record<string, Indicator[]> = {};
  for (const ind of indicators) {
    (grouped[ind.indicator_code] ||= []).push(ind);
  }
  const latest = (code: string) => grouped[code]?.[grouped[code].length - 1];

  // Build time-series chart for key indicators
  const dates = Array.from(new Set(indicators.map((i) => i.period_date))).sort();
  const series = dates.map((d) => {
    const row: Record<string, number | string> = { date: d.slice(0, 7) };
    for (const code of ["cpi_inflation", "policy_rate", "gdp_growth"]) {
      const ind = grouped[code]?.find((i) => i.period_date === d);
      if (ind) row[code] = Number(ind.value);
    }
    return row;
  });

  if (!country) {
    return (
      <AppShell><div className="mx-auto max-w-[1600px] px-6 py-20 text-center text-muted-foreground">Loading…</div></AppShell>
    );
  }

  return (
    <AppShell badge={country.iso_code}>
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{country.region} · {country.sub_region ?? ""}</div>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight">
              <span className="mr-3">{country.flag_emoji}</span>{country.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground font-mono">
              {country.iso_code} · {country.currency_code} · GDP {fmtNum(country.gdp_usd_bn, 0)} bn · Pop {fmtNum((country.population ?? 0) / 1e6, 1)}M
            </p>
          </div>
          <Link to="/compare" search={{ a: country.slug }} className="rounded-md border border-border bg-surface-2 px-4 py-2 text-sm hover:bg-accent">
            Compare with another country →
          </Link>
        </div>

        {/* GFSS hero */}
        {gfss && (
          <div className="glass mt-6 rounded-lg p-6 grid gap-6 md:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Composite GFSS Score</div>
              <div className={`num mt-2 text-6xl ${categoryColor(gfss.category)}`}>{fmtNum(gfss.score, 1)}</div>
              <div className={`mt-1 text-sm uppercase ${categoryColor(gfss.category)}`}>{gfss.category}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">30-day trend</div>
              <div className={`num mt-2 text-3xl ${Number(gfss.trend_30d) >= 0 ? "text-risk-low" : "text-risk-critical"}`}>
                {Number(gfss.trend_30d) >= 0 ? "+" : ""}{fmtNum(gfss.trend_30d, 2)}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">vs 30 days ago</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Stability band</div>
              <div className="mt-2 h-2 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-risk-critical via-risk-moderate to-risk-strong" style={{ width: `${gfss.score}%` }} />
              </div>
              <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>0 critical</span><span>50</span><span>100 strong</span>
              </div>
            </div>
          </div>
        )}

        {/* Indicators grid */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(grouped).map(([code, rows]) => {
            const last = rows[rows.length - 1];
            const prev = rows[rows.length - 2];
            const delta = prev ? Number(last.value) - Number(prev.value) : 0;
            return (
              <div key={code} className="glass rounded-lg p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{last.indicator_name}</div>
                <div className="num mt-2 text-2xl">{fmtNum(last.value, 2)} <span className="text-xs text-muted-foreground">{last.unit}</span></div>
                <div className={`mt-1 text-xs font-mono ${delta >= 0 ? "text-risk-low" : "text-risk-critical"}`}>
                  {delta >= 0 ? "▲" : "▼"} {fmtNum(Math.abs(delta), 2)} MoM
                </div>
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <div className="glass mt-8 rounded-lg p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Macro Trend — 24 Months</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="cpi_inflation" stroke="var(--risk-high)" strokeWidth={2} dot={false} name="CPI %" />
                <Line type="monotone" dataKey="policy_rate" stroke="var(--cyan)" strokeWidth={2} dot={false} name="Policy Rate %" />
                <Line type="monotone" dataKey="gdp_growth" stroke="var(--risk-strong)" strokeWidth={2} dot={false} name="GDP YoY %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Crisis probabilities */}
        <div className="glass mt-8 rounded-lg overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Crisis Probabilities — All Horizons</h3>
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
                      <td key={i} className={`num px-5 py-3 text-right ${c ? riskLevelColor(c.risk_level) : "text-muted-foreground"}`}>
                        {c ? `${(Number(c.probability) * 100).toFixed(1)}%` : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
