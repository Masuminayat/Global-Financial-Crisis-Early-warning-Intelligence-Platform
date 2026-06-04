import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).default([]),
});

// Per-user sliding-window rate limit (best-effort, per worker instance).
// Limits a single authenticated user to 20 Copilot calls per 60s.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string) {
  const now = Date.now();
  const arr = (rateLimitMap.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) {
    throw new Error("You're sending messages too quickly. Please wait a moment and try again.");
  }
  arr.push(now);
  rateLimitMap.set(userId, arr);
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap) {
      const fresh = v.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (fresh.length === 0) rateLimitMap.delete(k);
      else rateLimitMap.set(k, fresh);
    }
  }
}

export const askCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    checkRateLimit(context.userId);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Pull a richer snapshot from DB so the model can answer factually
    const [{ data: gfssAll }, { data: alerts }] = await Promise.all([
      supabaseAdmin
        .from("gfss_scores")
        .select("country_iso,score,category,trend_30d,countries(name,region)")
        .order("score", { ascending: true })
        .limit(80),
      supabaseAdmin
        .from("alerts")
        .select("country_iso,severity,title,triggered_at")
        .order("triggered_at", { ascending: false })
        .limit(20),
    ]);

    const allScores = (gfssAll ?? []).map((g) => ({
      iso: g.country_iso,
      name: (g as { countries: { name: string } | null }).countries?.name,
      region: (g as { countries: { region: string } | null }).countries?.region,
      score: Number(g.score),
      category: g.category,
      trend_30d: g.trend_30d,
    }));

    const snapshot = {
      countries_count: allScores.length,
      most_vulnerable: allScores.slice(0, 15),
      most_stable: [...allScores].reverse().slice(0, 10),
      all_scores: allScores,
      recent_alerts: alerts,
    };

    const systemPrompt = `You are GFCEIP Copilot, a senior macro analyst for the Global Financial Crisis Early Intelligence Platform.

You have TWO sources of knowledge:
1. The LIVE DATA SNAPSHOT below — use it as ground truth for current GFSS scores, categories, trends, and alerts. Cite specific scores when relevant.
2. Your general training knowledge of macroeconomics, country fundamentals, financial history, monetary policy, currencies, and geopolitics — use this freely to add context, explain mechanisms, and answer broader questions.

Guidelines:
- Be helpful, direct, and concise. Never refuse a reasonable macro/finance/country question.
- If a specific country isn't in the snapshot, still answer from general knowledge and say the live GFSS score isn't tracked yet.
- For forecasts, explain they are model-based with confidence intervals.
- Format with short paragraphs or bullet points. Use markdown.

LIVE DATA SNAPSHOT (JSON):
${JSON.stringify(snapshot).slice(0, 8000)}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...data.history,
      { role: "user", content: data.message },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error(`[Copilot] AI gateway ${res.status}:`, t.slice(0, 500));
      throw new Error("The AI service is temporarily unavailable. Please try again.");
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = json.choices?.[0]?.message?.content ?? "(no response)";
    return { reply };
  });
