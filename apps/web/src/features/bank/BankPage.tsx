import { useEffect, useMemo, useState } from "react";
import { Bot, Check, ChevronDown, Copy, Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, SectionLabel } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SubjectSettingsBar } from "../exercise-engine/SubjectSettingsBar";
import { SUBJECT_LABEL } from "../session/format";
import { SUBJECT_IDS, type Settings, type SubjectId } from "../settings/settings";
import { backfillPrompt, generatePrompt, repairPrompt, type GenerateRequest } from "./prompt";

interface CoverageRow {
  subject: string;
  topic: string;
  difficulty: number;
  verified: number;
  unverified: number;
  flagged: number;
  missingHints: number;
  missingExplanation: number;
}

interface Coverage {
  total: number;
  missingExtras: number;
  rows: CoverageRow[];
}

interface FlaggedProblem {
  id: string;
  subject: string;
  topic: string;
  difficulty: number;
  statement: string;
  inRotation: boolean;
  flags: { id: string; reason: string; createdAt: string }[];
}

const ACCENT: Record<string, string> = {
  math: "bg-subject-math",
  stats: "bg-subject-stats",
  physics: "bg-subject-physics",
  code: "bg-subject-code",
  trivia: "bg-subject-trivia",
};

function useBankData() {
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [flagged, setFlagged] = useState<FlaggedProblem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/coverage"), fetch("/api/flagged")])
      .then(async ([c, f]) => {
        if (!c.ok || !f.ok) throw new Error(`bridge returned ${c.ok ? f.status : c.status}`);
        const [cov, fl] = [(await c.json()) as Coverage, (await f.json()) as FlaggedProblem[]];
        if (!cancelled) {
          setCoverage(cov);
          setFlagged(fl);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "failed to load"));
    return () => {
      cancelled = true;
    };
  }, []);
  return { coverage, flagged, error };
}

function CopyButton({ text, label = "Copy prompt", variant = "default" }: { text: string; label?: string; variant?: "default" | "outline" }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const reset = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(reset);
  }, [state]);
  return (
    <Button
      type="button"
      variant={variant}
      size={variant === "outline" ? "sm" : "default"}
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => setState("copied"))
          .catch(() => setState("failed"))
      }
    >
      {state === "copied" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed: select the text" : label}
    </Button>
  );
}

interface SubjectSummary {
  subject: string;
  live: number;
  unverified: number;
  missing: number;
  topics: { topic: string; byDifficulty: number[]; live: number }[];
}

function summarise(rows: CoverageRow[]): SubjectSummary[] {
  const bySubject = new Map<string, SubjectSummary>();
  for (const row of rows) {
    const summary = bySubject.get(row.subject) ?? { subject: row.subject, live: 0, unverified: 0, missing: 0, topics: [] };
    const live = row.verified + row.unverified;
    summary.live += live;
    summary.unverified += row.unverified;
    summary.missing += Math.max(row.missingHints, row.missingExplanation);
    let topic = summary.topics.find((t) => t.topic === row.topic);
    if (!topic) {
      topic = { topic: row.topic, byDifficulty: [0, 0, 0, 0, 0], live: 0 };
      summary.topics.push(topic);
    }
    topic.byDifficulty[row.difficulty - 1] += live;
    topic.live += live;
    bySubject.set(row.subject, summary);
  }
  return [...bySubject.values()].sort((a, b) => SUBJECT_IDS.indexOf(a.subject as SubjectId) - SUBJECT_IDS.indexOf(b.subject as SubjectId));
}

function CoverageCard({ coverage }: { coverage: Coverage }) {
  const subjects = useMemo(() => summarise(coverage.rows), [coverage]);
  const total = subjects.reduce((sum, s) => sum + s.live, 0);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SectionLabel>Distribution</SectionLabel>
          <h3 className="text-heading-sm text-ink">Coverage by subject</h3>
        </div>
        <span className="text-code text-ink-muted">{total} live problems</span>
      </div>
      {subjects.length === 0 ? (
        <CardDescription>The bank is empty. Run bun run db:seed, or generate problems with Claude Code.</CardDescription>
      ) : (
        <ul className="flex flex-col gap-3">
          {subjects.map((s) => {
            const share = total ? Math.round((s.live / total) * 100) : 0;
            const expanded = open === s.subject;
            return (
              <li key={s.subject} className="rounded-md border border-border bg-surface-sunken">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : s.subject)}
                  className="flex w-full flex-col gap-2 p-3 text-left focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-body text-ink">{SUBJECT_LABEL[s.subject] ?? s.subject}</span>
                      <span className="truncate text-code text-ink-faint">{s.topics.map((t) => t.topic).join(", ")}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {s.unverified > 0 && <Badge variant="blocked">{s.unverified} unverified</Badge>}
                      {s.missing > 0 && <Badge variant="muted">{s.missing} missing extras</Badge>}
                      <span className="w-14 text-right text-code text-ink">{s.live}</span>
                      <ChevronDown className={cn("size-4 text-ink-muted transition-transform", expanded && "rotate-180")} aria-hidden />
                    </div>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-surface-high" aria-label={`${share}% of the bank`}>
                    <div className={cn("h-full", ACCENT[s.subject] ?? "bg-brand")} style={{ width: `${share}%` }} />
                  </div>
                </button>
                {expanded && (
                  <table className="w-full border-t border-border text-code">
                    <thead>
                      <tr className="text-label uppercase text-ink-faint">
                        <th className="px-3 py-2 text-left font-semibold">Topic</th>
                        {[1, 2, 3, 4, 5].map((d) => (
                          <th key={d} className="px-2 py-2 text-right font-semibold">
                            D{d}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.topics.map((t) => (
                        <tr key={t.topic} className="border-t border-border">
                          <td className="px-3 py-1.5 text-ink">{t.topic}</td>
                          {t.byDifficulty.map((n, i) => (
                            <td key={i} className={cn("px-2 py-1.5 text-right", n === 0 ? "text-ink-faint" : "text-ink")}>
                              {n}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {coverage.missingExtras > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
          <span className="text-body-sm text-ink-muted">{coverage.missingExtras} problems have no hints or explanation yet.</span>
          <CopyButton text={backfillPrompt(coverage.missingExtras)} label="Copy backfill prompt" variant="outline" />
        </div>
      )}
    </Card>
  );
}

function FlaggedCard({ flagged }: { flagged: FlaggedProblem[] }) {
  return (
    <Card>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SectionLabel>Triage</SectionLabel>
          <h3 className="text-heading-sm text-ink">Flagged and review notes</h3>
        </div>
        <Badge variant={flagged.length ? "blocked" : "muted"}>{flagged.length} open</Badge>
      </div>
      {flagged.length === 0 ? (
        <CardDescription>Nothing flagged. Flag a problem while practising and it shows up here for repair.</CardDescription>
      ) : (
        <ul className="flex flex-col gap-3">
          {flagged.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-code text-info">{p.id}</span>
                <Badge variant={p.inRotation ? "muted" : "blocked"}>{p.inRotation ? "Review note" : "Out of rotation"}</Badge>
                <span className="text-label uppercase text-ink-faint">
                  {SUBJECT_LABEL[p.subject] ?? p.subject} · {p.topic} · D{p.difficulty}
                </span>
              </div>
              <p className="line-clamp-2 text-body-sm text-ink">{p.statement}</p>
              {p.flags.map((f) => (
                <p key={f.id} className="flex items-start gap-2 text-body-sm text-ink-muted">
                  <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {f.reason === "wrong_or_ambiguous" ? "Flagged while practising" : f.reason}
                </p>
              ))}
              <div>
                <CopyButton text={repairPrompt(p)} label="Copy repair prompt" variant="outline" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GenerateCard({ topics }: { topics: Map<string, string[]> }) {
  const [request, setRequest] = useState<GenerateRequest>({
    subject: "math",
    topic: "",
    minDifficulty: 1,
    maxDifficulty: 3,
    count: 10,
    extras: true,
    directive: "",
  });
  const set = (patch: Partial<GenerateRequest>) => setRequest((current) => ({ ...current, ...patch }));
  const prompt = generatePrompt(request);
  const field = "rounded-md border border-border bg-surface-sunken px-3 py-2 text-body-sm text-ink focus-visible:outline-2 focus-visible:outline-focus-ring";

  return (
    <Card aria-label="Generate problems">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SectionLabel>Generate</SectionLabel>
          <h3 className="text-heading-sm text-ink">Ask Claude Code for problems</h3>
        </div>
        <Bot className="size-5 text-ink-faint" aria-hidden />
      </div>
      <CardDescription>The app can't start Claude Code itself. Build the request here, copy it, and paste it into Claude Code with the brainrotnt MCP server connected.</CardDescription>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <SectionLabel>Subject</SectionLabel>
          <select value={request.subject} onChange={(e) => set({ subject: e.target.value as GenerateRequest["subject"] })} className={field}>
            {SUBJECT_IDS.map((id) => (
              <option key={id} value={id}>
                {SUBJECT_LABEL[id]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <SectionLabel>Topic</SectionLabel>
          <input
            list="bank-topics"
            value={request.topic}
            placeholder="Thinnest topics"
            onChange={(e) => set({ topic: e.target.value })}
            className={cn(field, "placeholder:text-ink-faint")}
          />
          <datalist id="bank-topics">
            {(topics.get(request.subject) ?? []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1.5">
          <SectionLabel>Difficulty from</SectionLabel>
          <select value={request.minDifficulty} onChange={(e) => set({ minDifficulty: Number(e.target.value), maxDifficulty: Math.max(request.maxDifficulty, Number(e.target.value)) })} className={field}>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <SectionLabel>to</SectionLabel>
          <select value={request.maxDifficulty} onChange={(e) => set({ maxDifficulty: Number(e.target.value), minDifficulty: Math.min(request.minDifficulty, Number(e.target.value)) })} className={field}>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionLabel id="batch-label">Batch size</SectionLabel>
        <div role="radiogroup" aria-labelledby="batch-label" className="grid grid-cols-3 gap-1 rounded-md border border-border bg-surface-sunken p-0.5">
          {[5, 10, 25].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={request.count === n}
              onClick={() => set({ count: n })}
              className={cn(
                "rounded-sm py-1.5 text-code transition-colors focus-visible:outline-2 focus-visible:outline-focus-ring",
                request.count === n ? "border border-border-strong bg-surface-high text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {n} items
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-body-sm text-ink">
        <input type="checkbox" checked={request.extras} onChange={(e) => set({ extras: e.target.checked })} className="size-4 accent-[var(--brand)]" />
        Include three hints and an explanation for each
      </label>

      <label className="flex flex-col gap-1.5">
        <SectionLabel>Directive (optional)</SectionLabel>
        <input value={request.directive} placeholder="e.g. emphasise step-by-step working" onChange={(e) => set({ directive: e.target.value })} className={cn(field, "placeholder:text-ink-faint")} />
      </label>

      <div className="flex flex-col gap-1.5">
        <SectionLabel>Prompt</SectionLabel>
        <p aria-label="Prompt to copy" className="select-all rounded-md border border-border bg-surface-sunken p-3 text-code text-ink">
          {prompt}
        </p>
      </div>
      <CopyButton text={prompt} />
    </Card>
  );
}

export function BankPage({ settings, onSettings }: { settings: Settings; onSettings: (patch: Partial<Settings>) => void }) {
  const { coverage, flagged, error } = useBankData();
  const topics = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of coverage?.rows ?? []) map.set(row.subject, [...new Set([...(map.get(row.subject) ?? []), row.topic])]);
    return map;
  }, [coverage]);
  const unverified = coverage?.rows.reduce((sum, r) => sum + r.unverified, 0) ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <SectionLabel className="text-info">Problem bank · MCP</SectionLabel>
          <h2 className="text-display-lg font-sans text-ink">Problem bank &amp; settings</h2>
          <p className="max-w-2xl text-body text-ink-muted">What your sessions draw from, what needs repair, and a prompt for Claude Code to grow the bank.</p>
        </div>
        {coverage && (
          <div className="flex divide-x divide-border rounded-lg border border-border bg-surface-raised">
            <div className="flex flex-col gap-0.5 px-4 py-2">
              <SectionLabel>Verified</SectionLabel>
              <span className="text-code-lg text-ink">{coverage.total}</span>
            </div>
            <div className="flex flex-col gap-0.5 px-4 py-2">
              <SectionLabel>Unverified</SectionLabel>
              <span className="text-code-lg text-ink">{unverified}</span>
            </div>
            <div className="flex flex-col gap-0.5 px-4 py-2">
              <SectionLabel>Missing extras</SectionLabel>
              <span className="text-code-lg text-ink">{coverage.missingExtras}</span>
            </div>
          </div>
        )}
      </div>

      <section aria-label="Session settings" className="flex flex-col gap-2">
        <SectionLabel>Session settings · apply to the next session</SectionLabel>
        <SubjectSettingsBar settings={settings} onChange={onSettings} />
      </section>

      {error && (
        <Card>
          <CardDescription>Can't load the bank: {error}</CardDescription>
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          {coverage && <CoverageCard coverage={coverage} />}
          {flagged && <FlaggedCard flagged={flagged} />}
        </div>
        <div className="lg:sticky lg:top-20 lg:col-span-5">
          <GenerateCard topics={topics} />
        </div>
      </div>
    </div>
  );
}
