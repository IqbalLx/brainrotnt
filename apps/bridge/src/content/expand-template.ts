import { z } from "zod";
import { mcqAnswer } from "../db/answer";
import { runPython } from "../infra/sandbox-runner";
import { statementHash } from "./hash";
import { explanationIssues } from "./explanation";
import { hintLeaks } from "./hints";
import type { TemplateSpec } from "./problem-spec";

export const CHECK_SEEDS = 50;

export interface Variant {
  seed: number;
  statement: string;
  hash: string;
  answer: { value: number; tolerance: number; unit?: string } | { options: string[]; correct: number };
  hints?: string[];
  explanation?: string;
}

export type ExpandResult = { ok: true; variants: Variant[] } | { ok: false; errors: string[] };

// Runs after the author's code, in the same sandboxed process. Every seed is generated twice to catch
// randomness that ignores the seed, and any exception is recorded per seed rather than ending the run.
const harness = (seeds: number) => `

import json as _json
_rows = []
for _seed in range(${seeds}):
    try:
        _first = generate(_seed)
        _second = generate(_seed)
        if _first != _second:
            raise ValueError("generate(seed) is not deterministic: two calls with the same seed differ")
        _json.dumps(_first, allow_nan=False)
        _rows.append({"seed": _seed, "result": _first})
    except Exception as _e:
        _rows.append({"seed": _seed, "error": type(_e).__name__ + ": " + str(_e)})
print(_json.dumps(_rows))
`;

const rowSchema = z.object({ seed: z.number(), result: z.unknown().optional(), error: z.string().optional() });
const paramsSchema = z.record(z.string(), z.union([z.number().finite(), z.string()]));
const numericResult = z.object({ params: paramsSchema, answer: z.number().finite() });
const mcqResult = z.object({ params: paramsSchema, options: z.array(z.string()), correct: z.number().int() });

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function fill(statement: string, params: Record<string, string | number>): string | null {
  let missing = false;
  const filled = statement.replace(PLACEHOLDER, (_, name: string) => {
    if (!(name in params)) {
      missing = true;
      return "";
    }
    return String(params[name]);
  });
  return missing ? null : filled;
}

export async function expandTemplate(spec: TemplateSpec): Promise<ExpandResult> {
  const placeholders = [...spec.template.statement.matchAll(PLACEHOLDER)].map((m) => m[1]);
  if (placeholders.length === 0) {
    return { ok: false, errors: ["template.statement: needs at least one {placeholder}, otherwise every variant would be identical"] };
  }

  const run = await runPython(spec.template.generator + harness(CHECK_SEEDS), { timeoutMs: 10_000 });
  if (!run.ok) {
    const tail = run.stderr.trim().split("\n").slice(-3).join(" | ");
    return { ok: false, errors: [run.reason === "nonzero_exit" ? `generator failed: ${tail || run.message}` : `generator ${run.message}`] };
  }

  let rows: z.infer<typeof rowSchema>[];
  try {
    const lines = run.stdout.trim().split("\n");
    rows = z.array(rowSchema).parse(JSON.parse(lines[lines.length - 1]));
  } catch {
    return { ok: false, errors: ["generator must define generate(seed); the checker could not read its output"] };
  }

  const problems: string[] = [];
  const candidates: Variant[] = [];

  for (const row of rows) {
    const where = `seed ${row.seed}`;
    if (row.error) {
      problems.push(`${where}: ${row.error}`);
      continue;
    }

    const shape = spec.type === "numeric" ? numericResult.safeParse(row.result) : mcqResult.safeParse(row.result);
    if (!shape.success) {
      const hint = spec.type === "numeric" ? "{'params': {...}, 'answer': number}" : "{'params': {...}, 'options': [...], 'correct': index}";
      problems.push(`${where}: result must look like ${hint}`);
      continue;
    }

    const statement = fill(spec.template.statement, shape.data.params);
    if (statement === null) {
      const missing = placeholders.filter((name) => !(name in shape.data.params));
      problems.push(`${where}: params is missing ${missing.map((n) => `'${n}'`).join(", ")}`);
      continue;
    }
    if (statement.length < 10 || statement.length > 2000) {
      problems.push(`${where}: the filled statement must be 10 to 2000 characters`);
      continue;
    }

    let answer: Variant["answer"];
    if (spec.type === "numeric") {
      answer = { value: (shape.data as z.infer<typeof numericResult>).answer, tolerance: spec.answer.tolerance, ...(spec.answer.unit ? { unit: spec.answer.unit } : {}) };
    } else {
      const { options, correct } = shape.data as z.infer<typeof mcqResult>;
      const parsed = mcqAnswer.safeParse({ options, correct });
      const distinct = new Set(options.map((o) => o.trim().toLowerCase())).size === options.length;
      if (!parsed.success || !distinct) {
        problems.push(`${where}: options must be 2 to 8 distinct strings and correct must index into them`);
        continue;
      }
      answer = parsed.data;
    }
    let hints: string[] | undefined;
    if (spec.hints) {
      const filled = spec.hints.map((hint) => fill(hint, shape.data.params));
      if (filled.some((hint) => hint === null)) {
        problems.push(`${where}: a hint uses a {placeholder} that params does not have`);
        continue;
      }
      hints = filled as string[];
    }
    let explanation: string | undefined;
    if (spec.explanation) {
      const answerText = "options" in answer ? answer.options[answer.correct] : String(answer.value);
      const filled = fill(spec.explanation, { ...shape.data.params, answer: answerText });
      if (filled === null) {
        problems.push(`${where}: the explanation uses a {placeholder} that params does not have`);
        continue;
      }
      explanation = filled;
    }
    candidates.push({
      seed: row.seed,
      statement,
      hash: statementHash(statement, spec.topic),
      answer,
      ...(hints ? { hints } : {}),
      ...(explanation ? { explanation } : {}),
    });
  }

  // Every seed must work: a generator that fails on some seeds would fail on some variants later.
  if (problems.length > 0) {
    const shown = problems.slice(0, 3);
    const extra = problems.length > 3 ? ` (and ${problems.length - 3} more of ${CHECK_SEEDS} seeds)` : "";
    return { ok: false, errors: [`generator failed ${problems.length} of ${CHECK_SEEDS} seeds: ${shown.join("; ")}${extra}`] };
  }

  const seen = new Set<string>();
  const distinct = candidates.filter((c) => (seen.has(c.hash) ? false : (seen.add(c.hash), true)));
  if (distinct.length < spec.template.variants) {
    return { ok: false, errors: [`generator produced only ${distinct.length} distinct statements over ${CHECK_SEEDS} seeds but ${spec.template.variants} variants were requested`] };
  }
  const variants = distinct.slice(0, spec.template.variants);

  // Hints and explanations are checked against each variant's own answer, since the numbers change.
  for (const variant of variants) {
    const keyed = "options" in variant.answer ? { type: "mcq" as const, answer: variant.answer } : { type: "numeric" as const, answer: variant.answer };
    const issues = [
      ...(variant.hints ? await hintLeaks(keyed, variant.hints) : []),
      ...(variant.explanation ? explanationIssues(keyed, variant.explanation) : []),
    ];
    if (issues.length > 0) return { ok: false, errors: issues.map((issue) => `seed ${variant.seed}: ${issue}`) };
  }
  return { ok: true, variants };
}
