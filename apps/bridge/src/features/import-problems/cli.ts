import { join } from "node:path";

// Run from anywhere: unless DB_PATH says otherwise, use the bridge's own database.
process.env.DB_PATH ??= join(import.meta.dir, "../../../bridge.sqlite");

const paths = process.argv.slice(2);
if (paths.length === 0 || paths.includes("--help") || paths.includes("-h")) {
  console.log("Usage: bun run import <file.yaml> [more files...]\n\nEach file holds a problem, a list of problems, or an object with a `problems` list.");
  process.exit(paths.length === 0 ? 1 : 0);
}

const { getSandboxMode } = await import("../../infra/sandbox-runner");
const { importFiles, formatReport } = await import("./command");

if ((await getSandboxMode()) !== "strict") {
  console.warn("[sandbox] network isolation is unavailable here; see the README before importing code you did not write.\n");
}

const report = await importFiles(paths);
console.log(formatReport(report));
process.exit(report.rejected > 0 || report.fileErrors > 0 ? 1 : 0);
