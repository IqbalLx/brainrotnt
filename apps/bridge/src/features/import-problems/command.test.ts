import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../../db/client";
import { problems } from "../../db/schema";
import { resetDb } from "../../test-support";
import { formatReport, importFiles } from "./command";

beforeEach(resetDb);

const EXAMPLE = join(import.meta.dir, "../../../../../problems/example.yaml");

async function tempFile(name: string, content: string) {
  const dir = await mkdtemp(join(tmpdir(), "brainrotnt-import-"));
  const path = join(dir, name);
  await writeFile(path, content);
  return path;
}

const fixed = (n: number) => `
  - subject: math
    topic: arithmetic
    difficulty: 1
    type: numeric
    statement: "What is ${n} plus ${n}? Give a whole number."
    answer: { value: ${n * 2}, tolerance: 0 }
    reference: { code: "print(${n} + ${n})" }`;

describe("importFiles", () => {
  test("the shipped example imports cleanly: it must not rot", async () => {
    const report = await importFiles([EXAMPLE]);
    expect(report).toMatchObject({ items: 4, inserted: 4, rejected: 0, problemsAdded: 15, fileErrors: 0 });
    expect(await db.select().from(problems)).toHaveLength(15);
  });

  test("running it again refuses every item as a duplicate", async () => {
    await importFiles([EXAMPLE]);
    const again = await importFiles([EXAMPLE]);
    expect(again).toMatchObject({ inserted: 0, rejected: 4 });
    expect(await db.select().from(problems)).toHaveLength(15);
  });

  test("a mixed file reports each item and keeps the good ones", async () => {
    const path = await tempFile(
      "mixed.yaml",
      `problems:${fixed(3)}
  - subject: math
    topic: arithmetic
    difficulty: 1
    type: numeric
    statement: "What is 9 plus 9? Give a whole number."
    answer: { value: 99, tolerance: 0 }
    reference: { code: "print(9 + 9)" }
  - subject: biology
`,
    );
    const report = await importFiles([path]);
    expect(report).toMatchObject({ items: 3, inserted: 1, rejected: 2 });
    const text = formatReport(report);
    expect(text).toContain("#1 inserted");
    expect(text).toContain('#2 rejected "What is 9 plus 9?');
    expect(text).toContain("reference solution computed 18 but the stated key is 99");
    expect(text).toContain("#3 rejected");
    expect(text).toContain("Imported 1 of 3 items (1 problems added); 2 rejected.");
  });

  test("more items than one batch are split across batches", async () => {
    const items = Array.from({ length: 27 }, (_, i) => fixed(i + 10)).join("");
    const report = await importFiles([await tempFile("many.yaml", `problems:${items}\n`)]);
    expect(report).toMatchObject({ items: 27, inserted: 27, rejected: 0 });
    expect(formatReport(report)).toContain("#27 inserted");
  });

  test("unreadable and malformed files are reported without stopping the others", async () => {
    const good = await tempFile("good.yaml", `problems:${fixed(40)}\n`);
    const bad = await tempFile("bad.yaml", "a: [unclosed");
    const report = await importFiles(["/nonexistent/file.yaml", bad, good]);
    expect(report).toMatchObject({ fileErrors: 2, inserted: 1 });
    const text = formatReport(report);
    expect(text).toContain("/nonexistent/file.yaml: cannot read file");
    expect(text).toContain("invalid YAML");
    expect(text).toContain("2 files with errors");
  });
});
