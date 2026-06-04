import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).default([]),
});

export const askCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Pull a small snapshot of context from DB so the model can answer factually
    const [{ data: gfss }, { data: alerts }] = await Promise.all([
      supabaseAdmin
        .from("gfss_scores")
        .select("country_iso,score,category,trend_30d,countries(name,region)")
        .order("score", { ascending: true })
        .limit(20),
      supabaseAdmin
        .from("alerts")
        .select("country_iso,severity,title,triggered_at")
        .order("triggered_at", { ascending: false })
        .limit(10),
    ]);

    const context = {
      most_vulnerable: gfss?.map((g) => ({
        iso: g.country_iso,
        name: (g as { countries: { name: string } | null }).countries?.name,
        score: Number(g.score),
        category: g.category,
      })),
      recent_alerts: alerts,
    };

    const systemPrompt = `You are GFCEIP Copilot, a senior macro analyst.
Answer using the JSON snapshot below as ground truth. Be concise, cite the GFSS score and category when relevant.
Never invent data not present in the snapshot. If asked for forecasts, explain they are model-based with confidence intervals.

LIVE DATA SNAPSHOT (JSON):
${JSON.stringify(context).slice(0, 6000)}`;

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
