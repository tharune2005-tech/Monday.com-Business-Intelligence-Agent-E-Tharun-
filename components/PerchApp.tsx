"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AgentResponse, ChatMessage, Metric, WorkbookPayload } from "@/lib/monday/types";
import type { LeadershipBriefing } from "@/lib/analytics/briefing";
import { snapshotBriefing, snapshotChat, snapshotStatus } from "@/lib/runtime/snapshot-agent";

type Status = {
  mode: "live" | "snapshot";
  liveConfigured: boolean;
  syncedAt: string;
  deals: number;
  workOrders: number;
  qualityScore: string | null;
};

type AssistantPayload = AgentResponse & {
  mode?: string;
  syncedAt?: string;
};

const STARTERS = [
  "How's our pipeline looking for energy sector this quarter?",
  "Give me Deal Name, Owner code, Client code for those with deal status Open",
  "Prepare a leadership update I can walk through in 5 minutes",
  "Where is billing stuck, and how much is still to bill?",
  "Excel of work orders past probable end and not completed",
];

export function PerchApp() {
  const [tab, setTab] = useState<"ask" | "brief">("ask");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [briefing, setBriefing] = useState<(LeadershipBriefing & { mode?: string }) | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string; payload?: AssistantPayload }[]>(
    [],
  );
  const scroller = useRef<HTMLDivElement>(null);

  const clientAgent = process.env.NEXT_PUBLIC_CLIENT_AGENT === "true";

  useEffect(() => {
    if (clientAgent) {
      setStatus(snapshotStatus());
      return;
    }
    fetch("/api/status")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error("status unavailable");
        setStatus(json);
      })
      .catch(() => setStatus(snapshotStatus()));
  }, [clientAgent]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (tab !== "brief" || briefing) return;
    setBriefError(null);
    if (clientAgent) {
      setBriefing(snapshotBriefing());
      return;
    }
    fetch("/api/briefing")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed to load briefing");
        setBriefing(json);
      })
      .catch(() => {
        try {
          setBriefing(snapshotBriefing());
        } catch (e) {
          setBriefError(e instanceof Error ? e.message : "Failed to load briefing");
        }
      });
  }, [tab, briefing, clientAgent]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const nextUser = { role: "user" as const, text: trimmed };
    const history: ChatMessage[] = [...messages, nextUser].map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? m.payload?.headline + "\n" + (m.payload?.body || []).join("\n") : m.text,
    }));
    setMessages((m) => [...m, nextUser]);
    setInput("");
    setBusy(true);
    try {
      let payload: AssistantPayload | null = null;
      if (!clientAgent) {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: history }),
          });
          const json = (await res.json()) as AssistantPayload;
          if (res.ok && json.headline) payload = json;
        } catch {
          payload = null;
        }
      }
      if (!payload) {
        payload = await snapshotChat(history);
      }
      setMessages((m) => [...m, { role: "assistant", text: payload.headline, payload }]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "The agent could not complete that request.",
          payload: {
            headline: "Something failed on the way to the boards.",
            body: ["Network or server error. Try again; numbers are never guessed when the query layer is down."],
            metrics: [],
            caveats: [],
            followUps: STARTERS.slice(0, 3),
          },
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  async function copyBrief() {
    if (!briefing) return;
    const md = [
      `# ${briefing.title}`,
      briefing.subtitle,
      `As of ${briefing.asOf}`,
      "",
      "## Talking points",
      ...briefing.talkingPoints.map((t) => `- ${t}`),
      "",
      "## Asks",
      ...briefing.asks.map((t) => `- ${t}`),
      "",
      "## Risks",
      ...briefing.risks.map((t) => `- ${t}`),
    ].join("\n");
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const asOf = useMemo(
    () => (status?.syncedAt ? new Date(status.syncedAt).toLocaleString() : "—"),
    [status],
  );

  return (
    <div className="relative min-h-screen bg-ink-950">
      <div className="survey-grid pointer-events-none fixed inset-0" />
      <div className="relative mx-auto grid min-h-screen max-w-[1440px] grid-cols-1 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-8 border-b border-paper/10 px-6 py-8 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div>
            <p className="max-w-[18rem] font-mono text-[11px] uppercase leading-relaxed tracking-[0.08em] text-lime-dim">
              Monday.com Business Intelligence Agent
            </p>
            <h1 className="mt-2 font-display text-5xl leading-none text-paper">Perch</h1>
            <p className="mt-3 max-w-[18rem] text-sm leading-relaxed text-mist">
              A high vantage on messy Monday.com boards — deals and work orders.
            </p>
          </div>

          <div className="hairline rounded-2xl bg-ink-800/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-mist">Source</span>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                  status?.mode === "live" ? "bg-lime/15 text-lime" : "bg-lagoon/15 text-lagoon"
                }`}
              >
                {status?.mode === "live" ? "Monday.com live" : "Monday snapshot"}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-mist">Deals</dt>
                <dd className="font-mono text-lg">{status?.deals ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-mist">Work orders</dt>
                <dd className="font-mono text-lg">{status?.workOrders ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-mist">Data fitness</dt>
                <dd className="font-display text-3xl text-lime">{status?.qualityScore ?? "—"}</dd>
              </div>
            </dl>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-mist/80">Synced {asOf}</p>
          </div>

          <nav className="flex gap-2">
            {(
              [
                ["ask", "Ask"],
                ["brief", "Leadership update"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                  tab === id ? "bg-lime text-ink-950" : "bg-ink-800 text-paper hover:bg-ink-700"
                }`}
              >
                <MondayMark className={tab === id ? "opacity-90" : "opacity-80"} />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex min-h-screen flex-col px-4 py-6 sm:px-8">
          {tab === "ask" ? (
            <>
              <div ref={scroller} className="flex-1 space-y-6 overflow-y-auto pb-28">
                {messages.length === 0 && (
                  <EmptyState onPick={(q) => void send(q)} />
                )}
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[720px] rounded-2xl rounded-br-sm bg-paper px-4 py-3 text-ink-950">
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <AnswerCard key={i} payload={m.payload} onFollow={(q) => void send(q)} />
                  ),
                )}
                {busy && (
                  <p className="font-mono text-xs uppercase tracking-widest text-lime-dim">
                    Querying boards · cleaning · analysing
                  </p>
                )}
              </div>
              <form
                onSubmit={onSubmit}
                className="pointer-events-none sticky bottom-0 mt-2 bg-ink-950 pt-6"
              >
                <div className="pointer-events-auto hairline flex items-end gap-3 rounded-2xl bg-ink-800 p-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send(input);
                      }
                    }}
                    rows={2}
                    placeholder="Ask like a founder — pipeline, billing, energy this quarter…"
                    className="min-h-[56px] flex-1 resize-none bg-transparent px-3 py-2 text-paper placeholder:text-mist/60 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className="mb-1 mr-1 rounded-xl bg-lime px-4 py-2 text-sm font-medium text-ink-950 disabled:opacity-40"
                  >
                    Ask
                  </button>
                </div>
              </form>
            </>
          ) : (
            <BriefingPanel briefing={briefing} error={briefError} copied={copied} onCopy={() => void copyBrief()} />
          )}
        </main>
      </div>
    </div>
  );
}

function downloadWorkbook(file: WorkbookPayload) {
  const binary = atob(file.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function MondayMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="3.1" fill="#FFCC00" />
      <circle cx="12" cy="12" r="3.1" fill="#6161FF" />
      <circle cx="19" cy="12" r="3.1" fill="#00CA72" />
    </svg>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-lime-dim">Founder briefing desk</p>
        <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
          Ask across work orders and the deal funnel — without pretending the data is tidy.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-mist">
          Perch reads Monday.com boards, normalises dates, sectors, and broken statuses, then answers with numbers plus the caveats a board pack should not hide.
        </p>
      </div>
      <div className="mt-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-mist">Try asking</p>
        <ul className="mt-3 space-y-2">
          {STARTERS.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onPick(q)}
                className="w-full rounded-xl bg-ink-800/50 px-4 py-3 text-left text-sm text-paper/90 hover:bg-ink-700 hover:text-lime"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AnswerCard({
  payload,
  onFollow,
}: {
  payload?: AssistantPayload;
  onFollow: (q: string) => void;
}) {
  if (!payload) return null;
  return (
    <article className="hairline max-w-[780px] rounded-3xl bg-ink-800/80 p-5 shadow-lift sm:p-6">
      {payload.clarification && (
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-lime-dim">
          {payload.clarification}
        </p>
      )}
      <h3 className="font-display text-2xl leading-snug sm:text-3xl">{payload.headline}</h3>
      {payload.workbook && (
        <p className="mt-4 text-sm text-paper/90">
          Spreadsheet:{" "}
          <button
            type="button"
            onClick={() => downloadWorkbook(payload.workbook!)}
            className="text-lime underline decoration-lime/50 underline-offset-4 hover:decoration-lime"
          >
            {payload.workbook.filename}
          </button>{" "}
          <span className="text-mist">({payload.workbook.rowCount} rows · .xlsx)</span>
        </p>
      )}
      {payload.metrics?.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {payload.metrics.map((m) => (
            <MetricTile key={m.label} metric={m} />
          ))}
        </div>
      )}
      <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-paper/90">
        {payload.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      {payload.table && payload.table.rows.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-paper/10 font-mono text-[11px] uppercase tracking-wider text-mist">
                {payload.table.columns.map((c) => (
                  <th key={c} className="py-2 pr-3 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payload.table.rows.map((row, i) => (
                <tr key={i} className="border-b border-paper/5">
                  {row.map((cell, j) => (
                    <td key={j} className="py-2 pr-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {payload.detailTable && payload.detailTable.rows.length > 0 && (
        <div className="mt-5">
          {payload.detailTable.caption && (
            <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-mist">
              {payload.detailTable.caption}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-paper/10 font-mono text-[11px] uppercase tracking-wider text-mist">
                  {payload.detailTable.columns.map((c) => (
                    <th key={c} className="py-2 pr-3 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.detailTable.rows.map((row, i) => (
                  <tr key={i} className="border-b border-paper/5">
                    {row.map((cell, j) => (
                      <td key={j} className="py-2 pr-3">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {payload.caveats?.length > 0 && (
        <ul className="mt-5 space-y-1.5 border-t border-paper/10 pt-4 text-sm text-mist">
          {payload.caveats.map((c) => (
            <li key={c}>— {c}</li>
          ))}
        </ul>
      )}
      {payload.followUps?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {payload.followUps.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onFollow(q)}
              className="rounded-full bg-ink-700 px-3 py-1.5 text-xs text-paper hover:bg-ink-700/80 hover:text-lime"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function MetricTile({ metric }: { metric: Metric }) {
  return (
    <div className="rounded-2xl bg-ink-900/80 px-3 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-mist">{metric.label}</p>
      <p className="mt-1 font-display text-2xl text-lime">{metric.value}</p>
      {metric.hint && <p className="mt-1 text-[11px] text-mist">{metric.hint}</p>}
    </div>
  );
}

function BriefingPanel({
  briefing,
  error,
  copied,
  onCopy,
}: {
  briefing: (LeadershipBriefing & { mode?: string }) | null;
  error: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  if (error) return <p className="text-clay">{error}</p>;
  if (!briefing) {
    return <p className="font-mono text-xs uppercase tracking-widest text-lime-dim">Assembling the pack…</p>;
  }
  return (
    <div className="mx-auto w-full max-w-3xl pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-lime-dim">Monday.com · both boards</p>
          <h2 className="mt-2 font-display text-4xl leading-tight">{briefing.title}</h2>
          <p className="mt-2 text-mist">{briefing.subtitle}</p>
          <p className="mt-1 font-mono text-xs text-mist">As of {briefing.asOf}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full bg-lime px-4 py-2 text-sm text-ink-950"
        >
          {copied ? "Copied" : "Copy markdown"}
        </button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {briefing.metrics.map((m) => (
          <MetricTile key={m.label} metric={m} />
        ))}
      </div>

      <section className="mt-10">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-lime-dim">Talking points</h3>
        <ol className="mt-4 space-y-4">
          {briefing.talkingPoints.map((t, i) => (
            <li key={t} className="flex gap-4">
              <span className="font-display text-2xl text-lime">{String(i + 1).padStart(2, "0")}</span>
              <p className="pt-1 leading-relaxed">{t}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 hairline rounded-3xl bg-ink-800/70 p-6">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-clay">Risks to say out loud</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-paper/90">
          {briefing.risks.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-lime-dim">Asks for the team</h3>
        <ul className="mt-3 space-y-2">
          {briefing.asks.map((t) => (
            <li key={t} className="rounded-xl bg-ink-800/60 px-4 py-3">
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 text-sm text-mist">
        <h3 className="font-mono text-[11px] uppercase tracking-widest">Caveats</h3>
        <ul className="mt-2 space-y-1">
          {briefing.caveats.map((t) => (
            <li key={t}>— {t}</li>
          ))}
        </ul>
        <p className="mt-4 font-mono text-[11px]">Fitness {briefing.qualityScore}</p>
      </section>
    </div>
  );
}
