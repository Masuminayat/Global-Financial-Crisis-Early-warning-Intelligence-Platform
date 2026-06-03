import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { categoryColor, fmtNum } from "@/lib/format";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { ClientChart } from "@/components/ClientChart";
import { formatCrisisType } from "@/lib/macro";

const searchSchema = z.object({
  a: z.string().optional(),
  b: z.string().optional(),
});

export const Route = createFileRoute("/compare")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Compare — GFCEIP" }, { name: "description", content: "Side-by-side comparison of two countries' macro stability." }] }),
  component: ComparePage,
});

function ComparePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [a, setA] = useState(search.a ?? "pakistan");
  const [b, setB] = useState(search.b ?? "india");

  const apply = () => navigate({ search: { a, b } });

  const { data: countries = [] } = useQuery({
    queryKey: ["countries-list"],
    queryFn: async () => (await supabase.from("countries").select("iso_code,slug,name,flag_emoji").order("name")).data ?? [],
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Compare Countries</h1>
        <p className="text-sm text-muted-foreground">Side-by-side macro and risk comparison.</p>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <CountrySelect label="Country A" value={a} onChange={setA} options={countries} />
          <CountrySelect label="Country B" value={b} onChange={setB} options={countries} />
          <button onClick={apply} className="h-9 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground ring-glow-cyan">Compare</button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <CountryPanel slug={a} />
          <CountryPanel slug={b} />
        </div>

        <ComparisonChart slugA={a} slugB={b} />
      </div>
    </AppShell>
  );
}

function CountrySelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ slug: string; name: string; flag_emoji: string | null }> }) {
  return (
    <label className="flex flex-col gap-1 text-xs uppercase text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-56 rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground">
        {options.map((c) => <option key={c.slug} value={c.slug}>{c.flag_emoji} {c.name}</option>)}
      </select>
    </label>
  );
}

function CountryPanel({ slug }: { slug: string }) {
  const { data } = useQuery({
    queryKey: ["compare-panel", slug],
    queryFn: async () => {
      const { data: c } = await supabase.from("countries").select("*").eq("slug", slug).maybeSingle();
      if (!c) return null;
      const { data: g } = await supabase.from("gfss_scores").select("*").eq("country_iso", c.iso_code).maybeSingle();
      const { data: r } = await supabase.from("risk_scores").select("*").eq("country_iso", c.iso_code).eq("horizon_months", 12);
      const { data: i } = await supabase.from("economic_indicators").select("*").eq("country_iso", c.iso_code).order("period_date", { ascending: false }).limit(8);
      return { country: c, gfss: g, risks: r ?? [], indicators: i ?? [] };
    },
  });

  if (!data?.country) return <div className="glass rounded-lg p-6 text-muted-foreground">No data</div>;
  const { country, gfss, risks, indicators } = data;

  return (
    <div className="glass rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{country.region}</div>
          <h2 className="text-2xl font-semibold">{country.flag_emoji} {country.name}</h2>
        </div>
        {gfss && (
          <div className="text-right">
            <div className={`num text-4xl ${categoryColor((gfss as { category: string }).category)}`}>{fmtNum((gfss as { score: number }).score, 1)}</div>
            <div className={`text-xs uppercase ${categoryColor((gfss as { category: string }).category)}`}>{(gfss as { category: string }).category}</div>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {indicators.slice(0, 6).map((ind) => (
          <div key={ind.id as string} className="flex justify-between border-b border-border/40 py-1">
            <span className="text-muted-foreground">{ind.indicator_name}</span>
            <span className="num">{fmtNum(Number(ind.value), 2)}{ind.unit ? ` ${ind.unit}` : ""}</span>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Live Risk Outputs</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {risks.map((r) => (
            <div key={r.crisis_type as string} className="flex justify-between rounded-md bg-surface-2 px-3 py-2">
              <span className="capitalize">{formatCrisisType(r.crisis_type as string)}</span>
              <span className="num">{(Number(r.probability) * 100).toFixed(1)}% · {r.horizon_months}M</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ComparisonChart({ slugA, slugB }: { slugA: string; slugB: string }) {
  const { data = [] } = useQuery({
    queryKey: ["compare-chart", slugA, slugB],
    queryFn: async () => {
      const slugs = [slugA, slugB];
      const { data: cs } = await supabase.from("countries").select("iso_code,slug,name").in("slug", slugs);
      if (!cs || cs.length === 0) return [];
      const isos = cs.map((c) => c.iso_code);
      const { data: inds } = await supabase
        .from("economic_indicators")
        .select("country_iso,period_date,value")
        .in("country_iso", isos)
        .eq("indicator_code", "cpi_inflation")
        .order("period_date");
      const byDate: Record<string, Record<string, number | string>> = {};
      const isoOfSlug = (s: string) => cs.find((c) => c.slug === s)?.iso_code;
      for (const i of inds ?? []) {
        const date = (i.period_date as string).slice(0, 7);
        (byDate[date] ||= { date });
        const k = (i.country_iso as string) === isoOfSlug(slugA) ? "A" : "B";
        byDate[date][k] = Number(i.value);
      }
      return Object.values(byDate);
    },
  });

  return (
    <div className="glass mt-8 rounded-lg p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">CPI Inflation — Head to Head</h3>
      <div className="h-72">
        <ClientChart>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="A" stroke="var(--cyan)" strokeWidth={2} dot={false} name={slugA} />
              <Line type="monotone" dataKey="B" stroke="var(--magenta)" strokeWidth={2} dot={false} name={slugB} />
            </LineChart>
          </ResponsiveContainer>
        </ClientChart>
      </div>
    </div>
  );
}
