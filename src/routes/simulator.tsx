import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { fmtNum, riskLevelColor } from "@/lib/format";
import { INDICATOR_ALIASES } from "@/lib/macro";

const searchSchema = z.object({ iso: z.string().optional() });

export const Route = createFileRoute("/simulator")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Policy Simulator — GFCEIP" }, { name: "description", content: "What-if simulator: shock indicators and see how crisis probabilities shift." }] }),
  component: SimulatorPage,
});

// Simple logistic risk model — pure TS, deterministic
function sigmoid(z: number) { return 1 / (1 + Math.exp(-z)); }

// crisis_type → { intercept, weights }
const MODELS: Record<string, { b0: number; w: Record<string, number> }> = {
  currency_crisis:  { b0: -3.2, w: { reserves_usd: -0.04, cpi_inflation: 0.12, current_account_pct_gdp: -0.25, real_interest_rate: -0.05 } },
  sovereign_debt:   { b0: -4.0, w: { govt_debt_pct_gdp: 0.05, gdp_growth: -0.25, real_interest_rate: 0.10, current_account_pct_gdp: -0.15 } },
  banking_crisis:   { b0: -3.5, w: { cpi_inflation: 0.08, real_interest_rate: 0.10, gdp_growth: -0.30, unemployment: 0.15 } },
  imf_bailout:      { b0: -3.0, w: { reserves_usd: -0.08, govt_debt_pct_gdp: 0.04, current_account_pct_gdp: -0.30 } },
  capital_flight:   { b0: -3.4, w: { exchange_rate_idx: 0.03, cpi_inflation: 0.10, real_interest_rate: -0.08 } },
  bop_crisis:       { b0: -3.3, w: { current_account_pct_gdp: -0.40, reserves_usd: -0.06, cpi_inflation: 0.08 } },
};

function levelOf(p: number) {
  if (p > 0.6) return "CRITICAL";
  if (p > 0.35) return "HIGH";
  if (p > 0.15) return "MODERATE";
  return "LOW";
}

function SimulatorPage() {
  const search = Route.useSearch();
  const [iso, setIso] = useState(search.iso ?? "PK");

  const { data: countries = [] } = useQuery({
    queryKey: ["countries-sim"],
    queryFn: async () => (await supabase.from("countries").select("iso_code,name,flag_emoji").order("name")).data ?? [],
  });

  const { data: latest = {} as Record<string, number> } = useQuery({
    queryKey: ["sim-latest", iso],
    queryFn: async () => {
      const { data } = await supabase
        .from("economic_indicators")
        .select("indicator_code,value,period_date")
        .eq("country_iso", iso)
        .order("period_date", { ascending: false });
      const out: Record<string, number> = {};
      for (const row of data ?? []) if (out[row.indicator_code as string] == null) out[row.indicator_code as string] = Number(row.value);
      if (out.fx_reserves_usd_bn != null && out.reserves_usd == null) out.reserves_usd = out.fx_reserves_usd_bn;
      if (out.public_debt_gdp != null && out.govt_debt_pct_gdp == null) out.govt_debt_pct_gdp = out.public_debt_gdp;
      if (out.current_account_gdp != null && out.current_account_pct_gdp == null) out.current_account_pct_gdp = out.current_account_gdp;
      if (out.policy_rate != null && out.real_interest_rate == null) out.real_interest_rate = out.policy_rate;
      return out;
    },
  });

  const [overrides, setOverrides] = useState<Record<string, number | undefined>>({});
  const merged = useMemo(() => ({ ...latest, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v != null)) }), [latest, overrides]);

  const SLIDERS: Array<{ code: string; label: string; min: number; max: number; step: number; unit: string }> = [
    { code: "cpi_inflation", label: "CPI Inflation", min: -2, max: 60, step: 0.1, unit: "%" },
    { code: INDICATOR_ALIASES.rates[0], label: "Interest Rate", min: 0, max: 30, step: 0.25, unit: "%" },
    { code: "gdp_growth", label: "GDP Growth (YoY)", min: -10, max: 12, step: 0.1, unit: "%" },
    { code: INDICATOR_ALIASES.reserves[0], label: "FX Reserves", min: 0, max: 4000, step: 1, unit: "USD bn" },
    { code: INDICATOR_ALIASES.currentAccount[0], label: "Current Account / GDP", min: -15, max: 15, step: 0.1, unit: "%" },
    { code: INDICATOR_ALIASES.debt[0], label: "Public Debt / GDP", min: 0, max: 250, step: 1, unit: "%" },
    { code: "unemployment", label: "Unemployment", min: 0, max: 30, step: 0.1, unit: "%" },
    { code: "exchange_rate_idx", label: "Exchange Rate Index", min: 50, max: 400, step: 1, unit: "idx" },
  ];

  // Predict for each crisis type
  const predictions = Object.entries(MODELS).map(([ct, m]) => {
    const baseFeatures: Record<string, number> = {};
    for (const code of Object.keys(m.w)) baseFeatures[code] = Number(latest[code] ?? 0);
    const newFeatures: Record<string, number> = {};
    for (const code of Object.keys(m.w)) newFeatures[code] = Number(merged[code] ?? 0);
    const zBase = m.b0 + Object.entries(m.w).reduce((s, [k, w]) => s + w * (baseFeatures[k] ?? 0), 0);
    const zNew = m.b0 + Object.entries(m.w).reduce((s, [k, w]) => s + w * (newFeatures[k] ?? 0), 0);
    const pBase = sigmoid(zBase);
    const pNew = sigmoid(zNew);
    return { crisis_type: ct, pBase, pNew, delta: pNew - pBase };
  });

  return (
    <AppShell badge="SIM">
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Policy Simulator</h1>
        <p className="text-sm text-muted-foreground">Shock the inputs. See how scenario probabilities re-price using the app&apos;s current indicator set.</p>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <label className="text-xs uppercase text-muted-foreground flex flex-col gap-1">
            Country
            <select value={iso} onChange={(e) => { setIso(e.target.value); setOverrides({}); }} className="h-9 w-56 rounded-md border border-border bg-surface-2 px-3 text-sm">
              {countries.map((c) => <option key={c.iso_code} value={c.iso_code}>{c.flag_emoji} {c.name}</option>)}
            </select>
          </label>
          <button onClick={() => setOverrides({})} className="h-9 rounded-md border border-border bg-surface-2 px-4 text-sm hover:bg-accent">Reset shocks</button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Sliders */}
          <div className="glass rounded-lg p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Indicator Shocks</h2>
            <div className="space-y-4">
              {SLIDERS.map((s) => {
                const base = Number(latest[s.code] ?? 0);
                const val = Number(merged[s.code] ?? base);
                return (
                  <div key={s.code}>
                    <div className="flex justify-between text-sm">
                      <span>{s.label}</span>
                      <span className="num text-muted-foreground">base {fmtNum(base, 2)} → <span className="text-primary">{fmtNum(val, 2)} {s.unit}</span></span>
                    </div>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={val}
                      onChange={(e) => setOverrides((o) => ({ ...o, [s.code]: Number(e.target.value) }))}
                      className="mt-1 w-full accent-[var(--primary)]"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Results */}
          <div className="glass rounded-lg p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Predicted Crisis Probabilities (12M)</h2>
            <div className="space-y-3">
              {predictions.map((p) => {
                const lvl = levelOf(p.pNew);
                return (
                  <div key={p.crisis_type} className="rounded-md border border-border bg-surface-2 p-3">
                    <div className="flex items-center justify-between">
                      <span className="capitalize">{p.crisis_type.replaceAll("_", " ")}</span>
                      <span className={`num text-lg ${riskLevelColor(lvl)}`}>{(p.pNew * 100).toFixed(1)}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full bg-gradient-to-r from-risk-strong via-risk-moderate to-risk-critical" style={{ width: `${Math.min(100, p.pNew * 100)}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-xs font-mono text-muted-foreground">
                      <span>base {(p.pBase * 100).toFixed(1)}%</span>
                      <span className={p.delta >= 0 ? "text-risk-critical" : "text-risk-low"}>
                        {p.delta >= 0 ? "▲" : "▼"} {(Math.abs(p.delta) * 100).toFixed(2)} pp
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Scenario engine only: this tool shows directional sensitivity using simplified coefficients, while the live country scores come from the refreshed backend model outputs.
        </p>
      </div>
    </AppShell>
  );
}
