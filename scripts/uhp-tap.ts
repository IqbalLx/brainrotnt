// Prints what Luvus itself sends, bypassing the bridge: every raw UHP frame with a timestamp.
// If agent changes show up here but not in the bridge, the bridge is at fault; if they don't, Luvus is.
//
//   bun run debug:uhp            subscribe and print events until Ctrl+C
//   bun run debug:uhp --list     print one agent.list reply and exit
//   bun run debug:uhp --socket /path/to/luvus.sock
//   bun run debug:uhp --for 60   stop after 60 seconds
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const socketPath = flag("--socket") ?? process.env.UHP_SOCKET_PATH ?? process.env.LUVUS_SOCKET_PATH;
if (!socketPath) {
  console.error("No socket: pass --socket, or set UHP_SOCKET_PATH (find it with `luvus session list --json`).");
  process.exit(2);
}

const list = args.includes("--list");
const request = list
  ? { id: "tap-list", method: "agent.list", params: {} }
  : { id: "tap-sub", method: "events.subscribe", params: {} };
const stamp = () => new Date().toISOString().slice(11, 23);
const started = Date.now();
let frames = 0;
let buffer = "";

const seconds = Number(flag("--for"));
if (seconds > 0) {
  setTimeout(() => {
    console.error(`${stamp()} stopping after ${seconds}s, ${frames} frame(s)`);
    process.exit(0);
  }, seconds * 1000);
}

console.error(`${stamp()} connecting to ${socketPath}`);
await Bun.connect({
  unix: socketPath,
  socket: {
    open(socket) {
      console.error(`${stamp()} connected, sending ${request.method}`);
      socket.write(`${JSON.stringify(request)}\n`);
    },
    data(socket, chunk) {
      buffer += chunk.toString("utf8");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        frames += 1;
        let pretty = line;
        try {
          pretty = JSON.stringify(JSON.parse(line));
        } catch {
          pretty = `(not JSON) ${line}`;
        }
        console.log(`${stamp()} #${frames} ${pretty}`);
        if (list) socket.end();
      }
    },
    close() {
      console.error(`${stamp()} closed by peer after ${((Date.now() - started) / 1000).toFixed(1)}s, ${frames} frame(s)`);
      process.exit(0);
    },
    error(_socket, error) {
      console.error(`${stamp()} socket error: ${error.message}`);
      process.exit(1);
    },
  },
}).catch((error) => {
  console.error(`${stamp()} connect failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
