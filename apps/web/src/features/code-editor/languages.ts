export type CodeLanguage = "python" | "javascript";

export const LANGUAGE_LABEL: Record<CodeLanguage, string> = { python: "Python", javascript: "JavaScript" };

export interface CodeView {
  entry: string;
  languages: { language: CodeLanguage; starter: string }[];
  examples: { args: unknown[]; expected: unknown }[];
}

export interface CodeSubmission {
  language: CodeLanguage;
  code: string;
}

// A JSON value written the way the chosen language would write it (Python spells null, true and false differently).
export function literal(language: CodeLanguage, value: unknown): string {
  if (value === null) return language === "python" ? "None" : "null";
  if (typeof value === "boolean") return language === "python" ? (value ? "True" : "False") : String(value);
  if (Array.isArray(value)) return `[${value.map((item) => literal(language, item)).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => `${JSON.stringify(key)}: ${literal(language, item)}`);
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(value);
}

export function formatCall(language: CodeLanguage, entry: string, args: unknown[]): string {
  return `${entry}(${args.map((arg) => literal(language, arg)).join(", ")})`;
}
