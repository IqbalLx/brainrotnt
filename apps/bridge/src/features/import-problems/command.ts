import { readFile } from "node:fs/promises";
import { MAX_BATCH, submitProblems } from "../submit-problems/command";
import { parseProblemFile } from "./parse";

export interface FileReport {
  path: string;
  error?: string;
  lines: string[];
}

export interface ImportReport {
  files: FileReport[];
  items: number;
  inserted: number;
  rejected: number;
  problemsAdded: number;
  fileErrors: number;
}

function labelOf(item: unknown): string {
  if (typeof item !== "object" || item === null) return "item";
  const record = item as Record<string, any>;
  const text = record.id ?? record.statement ?? record.template?.statement;
  return typeof text === "string" ? `"${text.length > 56 ? `${text.slice(0, 55)}…` : text}"` : "item";
}

// The same validation, sandboxed verification and deduplication as the MCP tool: this is just another way in.
export async function importFiles(paths: string[]): Promise<ImportReport> {
  const report: ImportReport = { files: [], items: 0, inserted: 0, rejected: 0, problemsAdded: 0, fileErrors: 0 };

  for (const path of paths) {
    const file: FileReport = { path, lines: [] };
    report.files.push(file);

    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch {
      file.error = "cannot read file";
      report.fileErrors++;
      continue;
    }

    const parsed = parseProblemFile(text);
    if (!parsed.ok) {
      file.error = parsed.error;
      report.fileErrors++;
      continue;
    }

    for (let start = 0; start < parsed.items.length; start += MAX_BATCH) {
      const chunk = parsed.items.slice(start, start + MAX_BATCH);
      const result = await submitProblems(chunk);
      report.problemsAdded += result.problemsAdded;
      for (const item of result.results) {
        const number = start + item.index + 1;
        const label = labelOf(chunk[item.index]);
        if (item.status === "inserted") {
          report.inserted++;
          file.lines.push(`#${number} inserted ${item.id}${item.ids ? ` (${item.ids.length} variants)` : ""}`);
        } else {
          report.rejected++;
          file.lines.push(`#${number} rejected ${label}`, ...item.errors.map((error) => `    ${error}`));
        }
      }
      report.items += chunk.length;
    }
  }
  return report;
}

export function formatReport(report: ImportReport): string {
  const out: string[] = [];
  for (const file of report.files) {
    out.push(file.error ? `${file.path}: ${file.error}` : `${file.path}`);
    out.push(...file.lines.map((line) => `  ${line}`));
  }
  const errors = report.fileErrors ? `, ${report.fileErrors} file${report.fileErrors === 1 ? "" : "s"} with errors` : "";
  out.push("", `Imported ${report.inserted} of ${report.items} items (${report.problemsAdded} problems added); ${report.rejected} rejected${errors}.`);
  return out.join("\n");
}
