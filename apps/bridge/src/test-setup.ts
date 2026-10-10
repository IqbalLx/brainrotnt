import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Must run before anything imports db/client, which opens DB_PATH at import time.
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "brainrotnt-test-")), "test.sqlite");
await import("./db/migrate");
