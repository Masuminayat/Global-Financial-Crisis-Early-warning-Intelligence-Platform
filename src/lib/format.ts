export const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

export const fmtPct = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : `${Number(n).toFixed(d)}%`;

export const fmtCompact = (n: number | null | undefined) =>
  n == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n));

export const categoryColor = (cat: string) => {
  switch (cat) {
    case "critical": return "text-risk-critical";
    case "weak": return "text-risk-high";
    case "vulnerable": return "text-risk-moderate";
    case "stable": return "text-risk-low";
    case "strong": return "text-risk-strong";
    default: return "text-muted-foreground";
  }
};

export const riskLevelColor = (lvl: string) => {
  switch (lvl) {
    case "CRITICAL": return "text-risk-critical";
    case "HIGH": return "text-risk-high";
    case "MODERATE": return "text-risk-moderate";
    case "LOW": return "text-risk-low";
    default: return "text-muted-foreground";
  }
};

export const severityDot = (sev: string) =>
  sev === "critical" ? "bg-risk-critical" : sev === "warning" ? "bg-risk-high" : "bg-cyan";
