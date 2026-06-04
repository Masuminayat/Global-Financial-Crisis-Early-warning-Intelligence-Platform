import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  ["Home", "/"],
  ["Dashboard", "/dashboard"],
  ["Pakistan", "/pakistan"],
  ["Compare", "/compare"],
  ["Simulator", "/simulator"],
  ["Crises", "/crisis-explorer"],
  ["Model", "/model"],
  ["Copilot", "/copilot"],
] as const;

export function AppShell({ children, badge }: { children: ReactNode; badge?: string }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border glass-strong">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Activity className="h-4 w-4" />
            </div>
            <span className="font-mono text-sm tracking-tight">
              <span className="text-primary text-glow-cyan">GFCEIP</span>
              <span className="ml-2 text-muted-foreground">/ v1.0</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {NAV.map(([label, to]) => (
              <Link
                key={label}
                to={to}
                activeOptions={{ exact: to === "/" }}
                activeProps={{ className: "bg-accent text-foreground" }}
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="live-dot" />
            {badge ?? "LIVE"}
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-border mt-10">
        <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 px-6 py-8 text-xs text-muted-foreground md:flex-row">
          <span className="font-mono">GFCEIP © 2026 · Built for transparency in global macro risk.</span>
          <span>Data: World Bank · IMF · FRED · OECD · BIS · GDELT</span>
        </div>
      </footer>
    </div>
  );
}
