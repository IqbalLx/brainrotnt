import { z } from "zod";

export const triviaSource = z.object({
  url: z
    .string()
    .url()
    .refine((url) => /^https?:\/\//i.test(url), "must be an http or https link")
    .describe("A page that states the fact; a reference work, archive, museum or official site."),
  title: z.string().trim().max(200).optional(),
  quote: z.string().trim().min(10).max(500).describe("The sentence on that page that states the fact, copied exactly."),
});

export const triviaSources = z
  .array(triviaSource)
  .min(1)
  .max(10)
  .describe(
    "Where the fact comes from. Two or more sources on different sites that agree make the question verified; " +
      "with fewer it is stored as unverified and shown with an Unverified badge.",
  );

export type TriviaSource = z.infer<typeof triviaSource>;

const site = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");

/** Two independent sources means two different sites; several pages of one site count once. */
export function triviaStatus(sources: TriviaSource[]): "verified" | "unverified" {
  return new Set(sources.map((s) => site(s.url))).size >= 2 ? "verified" : "unverified";
}

// Words that make a fact depend on when it is read. A statement that pins a year ("as of 2020",
// "in 1999") is stable even with one of them, since it says which moment it is about.
const TIME_RELATIVE =
  /\b(current(ly)?|today|now|nowadays|latest|recent(ly)?|this (year|month|week|season|decade|century)|so far|to date|as yet|reigning|incumbent|still|presently|at present|at the moment|newest|upcoming|ongoing|record[- ]holding|holds? the record)\b/i;
const PINNED_YEAR = /\b(as of|in|by|until|during|since|from|before|after|at the end of|on)\s+(\w+\s+){0,2}\d{3,4}\b/i;

export function stabilityIssues(statement: string): string[] {
  const word = TIME_RELATIVE.exec(statement);
  if (!word || PINNED_YEAR.test(statement)) return [];
  return [`statement: "${word[0]}" makes the answer change over time; pin a year (for example "as of 2020") or ask about a fixed fact`];
}
