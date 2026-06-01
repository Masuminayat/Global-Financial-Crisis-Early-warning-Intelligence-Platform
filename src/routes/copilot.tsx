import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { askCopilot } from "@/lib/copilot.functions";
import { Send, Sparkles } from "lucide-react";

export const Route = createFileRoute("/copilot")({
  head: () => ({ meta: [{ title: "AI Copilot — GFCEIP" }, { name: "description", content: "Ask the AI Copilot about global macro stability, crisis risk, and country fundamentals." }] }),
  component: CopilotPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Which countries have the lowest stability scores?",
  "Summarize the latest critical alerts.",
  "Compare Pakistan and Sri Lanka on currency risk.",
  "What's driving Türkiye's risk profile?",
];

function CopilotPage() {
  const ask = useServerFn(askCopilot);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi — I'm GFCEIP Copilot. Ask me about country risk, crisis probabilities, or what's moving in global markets right now." },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const m = useMutation({
    mutationFn: async (msg: string) => ask({ data: { message: msg, history: messages.slice(-8) } }),
    onSuccess: (r) => {
      setMessages((prev) => [...prev, { role: "assistant", content: r.reply }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    },
    onError: (err: Error) => {
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err.message}` }]);
    },
  });

  const send = (text: string) => {
    const t = text.trim();
    if (!t || m.isPending) return;
    setMessages((prev) => [...prev, { role: "user", content: t }]);
    setInput("");
    m.mutate(t);
  };

  return (
    <AppShell badge="AI">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
          <Sparkles className="h-4 w-4" /> COPILOT · gemini-2.5-flash
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Macro Intelligence Copilot</h1>
        <p className="text-sm text-muted-foreground">Grounded in live GFCEIP data: stability scores, alerts, and country fundamentals.</p>

        <div className="glass mt-6 rounded-lg p-4 space-y-3 min-h-[400px] max-h-[60vh] overflow-y-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface-2"}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {m.isPending && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-surface-2 px-4 py-2.5 text-sm text-muted-foreground">Thinking…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={m.isPending} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about country risk, alerts, indicators…"
            className="flex-1 h-11 rounded-md border border-border bg-surface-2 px-4 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            disabled={m.isPending}
          />
          <button type="submit" disabled={m.isPending || !input.trim()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground ring-glow-cyan disabled:opacity-50">
            <Send className="h-4 w-4" /> Send
          </button>
        </form>
      </div>
    </AppShell>
  );
}
