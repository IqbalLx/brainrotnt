import { createHash } from "node:crypto";

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

// Deduplication key: the normalized statement plus its topic.
export function statementHash(statement: string, topic: string): string {
  return createHash("sha256").update(`${normalize(statement)}|${topic}`).digest("hex");
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function generatedId(subject: string, topic: string, hash: string): string {
  return `${subject}-${slug(topic)}-${hash.slice(0, 8)}`;
}
