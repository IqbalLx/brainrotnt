import { parse } from "yaml";

export type ParsedFile = { ok: true; items: unknown[] } | { ok: false; error: string };

export const MAX_FILE_BYTES = 1_000_000;
export const MAX_ITEMS_PER_FILE = 500;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// A file holds one item, a list of items, or an object with a `problems` list.
export function parseProblemFile(text: string): ParsedFile {
  if (text.length > MAX_FILE_BYTES) return { ok: false, error: `file is larger than ${MAX_FILE_BYTES} bytes` };

  let doc: unknown;
  try {
    doc = parse(text);
  } catch (error) {
    return { ok: false, error: `invalid YAML: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}` };
  }

  const items = Array.isArray(doc) ? doc : isObject(doc) && Array.isArray(doc.problems) ? doc.problems : isObject(doc) ? [doc] : null;
  if (items === null) return { ok: false, error: "expected a problem, a list of problems, or an object with a `problems` list" };
  if (items.length === 0) return { ok: false, error: "no problems found" };
  if (items.length > MAX_ITEMS_PER_FILE) return { ok: false, error: `at most ${MAX_ITEMS_PER_FILE} items per file` };
  return { ok: true, items };
}
