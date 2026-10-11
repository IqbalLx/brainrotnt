// Watches the bridge's agent-state SSE stream the way the browser does, with timestamps, so you can see
// whether events leave the bridge on time and whether the connection drops.
//
//   bun run debug:sse                                   the bridge directly (127.0.0.1:8787)
//   bun run debug:sse --url http://localhost:5173       through the Vite proxy, as the web app sees it
//   bun run debug:sse --for 60                          stop after 60 seconds
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = flag("--url") ?? process.env.BRIDGE_URL ?? "http://127.0.0.1:8787";
const url = `${base.replace(/\/$/, "")}/api/agent-state/stream`;
const stamp = () => new Date().toISOString().slice(11, 23);
const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;

const seconds = Number(flag("--for"));
if (seconds > 0) {
  setTimeout(() => {
    console.error(`${stamp()} stopping after ${seconds}s`);
    process.exit(0);
  }, seconds * 1000);
}

console.error(`${stamp()} GET ${url}`);
const response = await fetch(url, { headers: { Accept: "text/event-stream" } }).catch((error) => {
  console.error(`${stamp()} request failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
console.error(`${stamp()} HTTP ${response.status} ${response.headers.get("content-type")}`);
if (!response.ok || !response.body) process.exit(1);

let buffer = "";
let lastId = 0;
const decoder = new TextDecoder();
for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let end: number;
  // SSE messages are separated by a blank line.
  while ((end = buffer.indexOf("\n\n")) >= 0) {
    const block = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    const fields: Record<string, string> = {};
    for (const line of block.split("\n")) {
      const colon = line.indexOf(":");
      if (colon > 0) fields[line.slice(0, colon)] = line.slice(colon + 1).trimStart();
    }
    const event = fields.event ?? "message";
    if (event === "ping") {
      console.log(`${stamp()} ping`);
      continue;
    }
    const id = Number(fields.id);
    const gap = lastId && id > lastId + 1 ? `  GAP: ${id - lastId - 1} event(s) missed` : "";
    if (id) lastId = id;
    let detail = fields.data ?? "";
    try {
      const data = JSON.parse(detail);
      const lag = data.at ? ` published ${Date.now() - Date.parse(data.at)} ms ago` : "";
      detail = `${data.status} pane=${data.pane} agent=${data.agent}${lag}`;
    } catch {
      // print the raw data
    }
    console.log(`${stamp()} ${event} id=${fields.id ?? "-"} ${detail}${gap}`);
  }
}
console.error(`${stamp()} stream ended by the server after ${elapsed()}`);
