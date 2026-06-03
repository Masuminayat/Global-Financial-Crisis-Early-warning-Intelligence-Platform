export type IndicatorPoint = {
  indicator_code: string;
  indicator_name?: string;
  period_date: string;
  value: number | string | null;
  unit?: string | null;
  source?: string | null;
};

export type RiskRow = {
  crisis_type: string;
  horizon_months: number;
  probability: number;
  risk_level: string;
  top_drivers?: unknown;
  generated_at?: string;
  model_version?: string;
};

export const INDICATOR_ALIASES = {
  inflation: ["cpi_inflation"],
  reserves: ["reserves_usd", "fx_reserves_usd_bn"],
  currentAccount: ["current_account_pct_gdp", "current_account_gdp"],
  debt: ["govt_debt_pct_gdp", "public_debt_gdp"],
  growth: ["gdp_growth"],
  unemployment: ["unemployment"],
  rates: ["real_interest_rate", "policy_rate"],
  exports: ["exports_pct_gdp"],
  fx: ["exchange_rate_idx"],
} as const;

export type GroupedIndicators = Record<string, IndicatorPoint[]>;

export function groupIndicators(indicators: IndicatorPoint[]): GroupedIndicators {
  return indicators.reduce<GroupedIndicators>((acc, row) => {
    const list = (acc[row.indicator_code] ??= []);
    list.push(row);
    list.sort((a, b) => a.period_date.localeCompare(b.period_date));
    return acc;
  }, {});
}

export function pointsFor(grouped: GroupedIndicators, aliases: readonly string[]) {
  for (const alias of aliases) {
    const rows = grouped[alias];
    if (rows?.length) return rows;
  }
  return [] as IndicatorPoint[];
}

export function latestValue(grouped: GroupedIndicators, aliases: readonly string[]) {
  const rows = pointsFor(grouped, aliases);
  const last = rows[rows.length - 1];
  return last ? Number(last.value) : undefined;
}

export function previousDelta(grouped: GroupedIndicators, aliases: readonly string[]) {
  const rows = pointsFor(grouped, aliases);
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  if (!last || !prev) return undefined;
  return Number(last.value) - Number(prev.value);
}

export function metricSeries(grouped: GroupedIndicators, aliases: readonly string[], key: string) {
  return pointsFor(grouped, aliases).map((row) => ({
    date: row.period_date.slice(0, 7),
    [key]: Number(row.value),
  }));
}

export function formatCrisisType(crisisType: string) {
  return crisisType.replaceAll("_", " ");
}

export function parseTopDrivers(topDrivers: unknown) {
  if (!Array.isArray(topDrivers)) return [] as Array<{ feature: string; contribution?: number; value?: number }>;
  return topDrivers
    .filter((driver): driver is { feature?: unknown; contribution?: unknown; value?: unknown } => !!driver && typeof driver === "object")
    .map((driver) => ({
      feature: typeof driver.feature === "string" ? driver.feature : "unknown",
      contribution: typeof driver.contribution === "number" ? driver.contribution : undefined,
      value: typeof driver.value === "number" ? driver.value : undefined,
    }));
}

export function sortRiskRows(rows: RiskRow[]) {
  return [...rows].sort((a, b) => {
    if (a.probability !== b.probability) return Number(b.probability) - Number(a.probability);
    return Number(a.horizon_months) - Number(b.horizon_months);
  });
}