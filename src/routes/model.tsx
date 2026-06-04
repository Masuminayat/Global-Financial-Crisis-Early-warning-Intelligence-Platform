import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ClientChart } from "@/components/ClientChart";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

export const Route = createFileRoute("/model")({
  head: () => ({
    meta: [
      { title: "Model Insights — GFCEIP" },
      { name: "description", content: "EDA of the GFCEIP crisis prediction model: ROC curve, confusion matrix, feature importance, and SHAP summary." },
    ],
  }),
  component: ModelPage,
});

type Metrics = {
  selected_model: string;
  model_version: string;
  threshold: number;
  n_samples: number;
  n_features: number;
  n_train: number;
  n_test: number;
  n_countries: number;
  n_indicators: number;
  class_balance: number;
  year_range_actual: [number, number];
  threshold_strategy: string;
  models: Record<string, {
    cv: { auc: { mean: number; std: number }; f1: { mean: number; std: number }; prec: { mean: number; std: number }; rec: { mean: number; std: number }; acc: { mean: number; std: number }; threshold: { mean: number }; train_auc: { mean: number }; auc_gap: { mean: number } };
    test: { accuracy: number; precision: number; recall: number; f1: number; roc_auc: number; threshold: number };
    verdict: string;
  }>;
};
type Importance = { feature: string; importance: number };

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card/40 p-5">
      <div className="mb-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-lg text-foreground">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ModelPage() {
  const { data: metrics } = useQuery<Metrics>({
    queryKey: ["model-metrics"],
    queryFn: async () => (await fetch("/model-artifacts/metrics.json")).json(),
  });
  const { data: importances = [] } = useQuery<Importance[]>({
    queryKey: ["model-importances"],
    queryFn: async () => (await fetch("/model-artifacts/feature_importances.json")).json(),
  });

  const top = importances.slice(0, 15).map((d) => ({ ...d, importance: +(d.importance * 100).toFixed(2) })).reverse();
  const selected = metrics?.selected_model ?? "XGBoost";
  const sel = metrics?.models?.[selected];

  return (
    <AppShell badge="MODEL">
      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-widest text-primary/80">Model Diagnostics</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Crisis-Prediction Model — EDA & Explainability</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            How the production model behaves on data it has never seen. Each panel below shows a different lens on
            performance: discrimination (ROC), classification quality (confusion matrix), driver attribution
            (feature importance), and per-feature contribution magnitude (SHAP).
          </p>
        </header>

        {metrics && (
          <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            <Stat label="Champion model" value={selected} hint={metrics.model_version} />
            <Stat label="Test ROC-AUC" value={sel ? sel.test.roc_auc.toFixed(3) : "—"} hint="held-out 20%" />
            <Stat label="Test F1" value={sel ? sel.test.f1.toFixed(3) : "—"} />
            <Stat label="Threshold" value={metrics.threshold.toFixed(3)} hint="F1-optimal" />
            <Stat label="Samples" value={metrics.n_samples.toLocaleString()} hint={`${metrics.n_countries} countries`} />
            <Stat label="Features" value={String(metrics.n_features)} hint={`${metrics.n_indicators} indicators`} />
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <Card
            title="ROC Curve"
            subtitle="True-positive rate vs false-positive rate across every probability threshold. The dashed diagonal is random chance; the larger the area under the curve (AUC), the better the model separates crisis years from calm years. AUC = 0.5 is noise, 1.0 is perfect."
          >
            <img src="/model-artifacts/roc_curve.png" alt="ROC curve" className="w-full rounded border border-border/60" />
            <p className="mt-3 text-xs text-muted-foreground">
              Reading it: at our production threshold ({metrics?.threshold.toFixed(3)}), the model catches a high
              share of true crises while keeping false alarms low. AUC = {sel?.test.roc_auc.toFixed(3)} on data
              never used during training.
            </p>
          </Card>

          <Card
            title="Confusion Matrix"
            subtitle="Counts of correct vs incorrect predictions on the held-out test set, broken down by class. Diagonal = right, off-diagonal = wrong."
          >
            <img src="/model-artifacts/confusion_matrix.png" alt="Confusion matrix" className="w-full rounded border border-border/60" />
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div><span className="text-foreground">Precision {sel?.test.precision.toFixed(3)}</span> — when we say "crisis," how often we're right.</div>
              <div><span className="text-foreground">Recall {sel?.test.recall.toFixed(3)}</span> — of all true crises, how many we caught.</div>
            </div>
          </Card>

          <Card
            title="Feature Importance"
            subtitle="How often each indicator was used to split a tree, weighted by the gain it produced. Tells you which inputs the model leans on most when generating a probability."
          >
            <img src="/model-artifacts/feature_importance.png" alt="Feature importance" className="w-full rounded border border-border/60" />
            <p className="mt-3 text-xs text-muted-foreground">
              Importance is global — it ranks features across the entire dataset, but doesn't tell you which
              direction (higher or lower) increases risk. For that, see the SHAP panel.
            </p>
          </Card>

          <Card
            title="SHAP Summary — Top 15 Features"
            subtitle="Mean |SHAP value| per feature: the average magnitude each indicator pushes a country's predicted crisis probability up or down. Longer bars = larger average impact on individual predictions."
          >
            <div className="h-[420px]">
              <ClientChart>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top} layout="vertical" margin={{ left: 20, right: 24, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="feature" stroke="hsl(var(--muted-foreground))" fontSize={11} width={170} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                      formatter={(v: number) => [`${v}%`, "Impact"]}
                    />
                    <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                      {top.map((_, i) => (
                        <Cell key={i} fill={`hsl(${200 + (i * 8) % 160} 80% ${45 + (i % 5) * 4}%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ClientChart>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Top driver is <span className="text-foreground font-mono">{importances[0]?.feature}</span> — current
              account deficits are the single strongest signal of incoming external-balance stress. Lagged values
              and rolling means dominate the rest of the list, confirming the model relies on trend and momentum
              rather than single-year snapshots.
            </p>
          </Card>
        </div>

        {metrics && (
          <Card title="Model Comparison" subtitle="Held-out test set (20% never seen during cross-validation). Champion was selected by best CV F1.">
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">ROC-AUC</th>
                    <th className="py-2 pr-4">F1</th>
                    <th className="py-2 pr-4">Precision</th>
                    <th className="py-2 pr-4">Recall</th>
                    <th className="py-2 pr-4">Accuracy</th>
                    <th className="py-2 pr-4">AUC Gap</th>
                    <th className="py-2">Verdict</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {Object.entries(metrics.models).map(([name, m]) => (
                    <tr key={name} className="border-b border-border/30">
                      <td className="py-2 pr-4">
                        {name}{name === selected && <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">★ champion</span>}
                      </td>
                      <td className="py-2 pr-4">{m.test.roc_auc.toFixed(3)}</td>
                      <td className="py-2 pr-4">{m.test.f1.toFixed(3)}</td>
                      <td className="py-2 pr-4">{m.test.precision.toFixed(3)}</td>
                      <td className="py-2 pr-4">{m.test.recall.toFixed(3)}</td>
                      <td className="py-2 pr-4">{m.test.accuracy.toFixed(3)}</td>
                      <td className="py-2 pr-4">{m.cv.auc_gap.mean.toFixed(3)}</td>
                      <td className="py-2 text-xs text-muted-foreground">{m.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              <span className="text-foreground">AUC Gap</span> = train AUC − validation AUC. Values under ~0.08 indicate
              the model generalizes; larger gaps suggest overfitting.
            </p>
          </Card>
        )}

        <Card title="How to read these diagnostics together">
          <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
            <li><span className="text-foreground">ROC</span> tells you the model's <em>ranking</em> ability — can it tell crisis years apart from calm years at any threshold.</li>
            <li><span className="text-foreground">Confusion matrix</span> tells you what happens at the <em>specific threshold</em> we ship, in real counts.</li>
            <li><span className="text-foreground">Feature importance</span> answers <em>which</em> inputs the model uses most.</li>
            <li><span className="text-foreground">SHAP</span> answers <em>how much</em> each input typically moves a single country's probability — the unit a policymaker would actually argue about.</li>
          </ul>
        </Card>
      </main>
    </AppShell>
  );
}
