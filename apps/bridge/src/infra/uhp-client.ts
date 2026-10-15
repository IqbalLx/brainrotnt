export type AgentState = "idle" | "working" | "blocked" | "done";

export interface AgentStateEvent {
  status: AgentState;
  /** Unique across machines: a remote pane is `<machine id>:<pane>`, a pane on this computer is its plain id. */
  pane: string;
  agent: string;
  project: string;
  cwd: string;
  branch: string | null;
  /** The label of the Luvus machine the pane runs on, or null for this computer. */
  machine: string | null;
  at: Date;
}

export interface UhpClient {
  start(): Promise<void>;
  stop(): void;
  current(): AgentStateEvent | null;
  onStateChange(listener: (event: AgentStateEvent) => void): () => void;
  /** What the client has seen and done, for GET /api/debug/agent-state. */
  debug(): UhpDebugSnapshot;
  /** Publish a state as if it came from Luvus, to test the SSE stream and the UI on their own. */
  inject(event: Omit<AgentStateEvent, "at">): void;
}

/** One frame on the wire and what the client did with it. */
export interface UhpFrameRecord {
  at: string;
  /** "local", a machine id, or "debug" for an injected state. */
  source: string;
  channel: "subscribe" | "request";
  direction: "out" | "in";
  frame: unknown;
  outcome: string;
}

type Connection = "idle" | "connecting" | "subscribed" | "disconnected" | "stopped";

interface SourceStats {
  connection: Connection;
  subscribedAt: string | null;
  lastFrameAt: string | null;
  lastError: string | null;
  connects: number;
  framesReceived: number;
  eventsApplied: number;
  eventsIgnored: number;
  /** Frames received per event name, so a renamed or missing event shows up even when it is not kept in `recent`. */
  eventCounts: Record<string, number>;
}

/** One Luvus server the client follows: this computer's, or one machine's over SSH. */
export interface UhpSourceDebug extends SourceStats {
  name: string;
  machine: string | null;
  transport: "socket" | "ssh";
  /** The socket path, or the SSH destination. */
  target: string;
  panes: unknown[];
}

export interface UhpDebugSnapshot extends SourceStats {
  mode: "luvus" | "mock";
  /** The top-level connection and counters are this computer's socket; `sources` has every one. */
  socketPath: string | null;
  publishes: number;
  listeners: number;
  /** Every pane across sources, as the published state is chosen from. */
  panes: unknown[];
  current: AgentStateEvent | null;
  recent: UhpFrameRecord[];
  sources: UhpSourceDebug[];
  /** How the Luvus machines were found, or why none are followed. */
  machines: string | null;
}

type Listener = (event: AgentStateEvent) => void;

// Set UHP_DEBUG=1 to also print every frame and every published state to the bridge's console.
const DEBUG_LOG = process.env.UHP_DEBUG === "1";
const RECENT_FRAMES = 200;

const newStats = (): SourceStats => ({
  connection: "idle",
  subscribedAt: null,
  lastFrameAt: null,
  lastError: null,
  connects: 0,
  framesReceived: 0,
  eventsApplied: 0,
  eventsIgnored: 0,
  eventCounts: {},
});

class StateHub {
  private listeners = new Set<Listener>();
  private last: AgentStateEvent | null = null;
  private publishes = 0;
  private recent: UhpFrameRecord[] = [];

  current(): AgentStateEvent | null {
    return this.last;
  }

  onStateChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  inject(event: Omit<AgentStateEvent, "at">): void {
    this.record("debug", "subscribe", "in", event, "injected through /api/debug/agent-state");
    this.emit({ ...event, at: new Date() });
  }

  protected snapshot(stats: SourceStats): Omit<UhpDebugSnapshot, "mode" | "socketPath" | "panes" | "sources" | "machines"> {
    return {
      ...stats,
      eventCounts: { ...stats.eventCounts },
      publishes: this.publishes,
      listeners: this.listeners.size,
      current: this.last,
      recent: [...this.recent],
    };
  }

  record(source: string, channel: UhpFrameRecord["channel"], direction: UhpFrameRecord["direction"], frame: unknown, outcome: string): void {
    const entry = { at: new Date().toISOString(), source, channel, direction, frame, outcome };
    this.recent.push(entry);
    if (this.recent.length > RECENT_FRAMES) this.recent.shift();
    if (DEBUG_LOG) console.log(`[uhp-debug] ${entry.at} ${source} ${channel} ${direction === "out" ? "->" : "<-"} ${JSON.stringify(frame)} :: ${outcome}`);
  }

  protected emit(event: AgentStateEvent): void {
    this.last = event;
    this.publishes += 1;
    if (DEBUG_LOG) console.log(`[uhp-debug] publish ${event.status} pane=${event.pane} to ${this.listeners.size} listener(s)`);
    for (const listener of this.listeners) listener(event);
  }
}

// Luvus reports one status per agent pane. The app shows a single state, so the
// most attention-demanding pane wins: blocked > working > done > idle.
const PRIORITY: Record<AgentState, number> = { idle: 0, done: 1, working: 2, blocked: 3 };

interface PaneState {
  pane: string;
  status: AgentState;
  agent: string;
  project: string;
  cwd: string;
  branch: string | null;
  machine: string | null;
  updatedAt: number;
}

/**
 * Luvus reports every pane, agent or not. `command_fallback` means it found no agent and is
 * describing whatever command runs there (zsh, atuin, vim), so its busy/idle is not an agent's.
 */
export function isAgentPane(raw: Record<string, unknown>): boolean {
  return raw.authority !== "command_fallback";
}

function toPaneState(raw: unknown, prefix: string, machine: string | null): PaneState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.pane !== "string" || typeof r.status !== "string") return null;
  if (!isAgentPane(r)) return null;
  // "unknown" means Luvus has no evidence either way; it never demands attention.
  const status: AgentState =
    r.status === "working" || r.status === "blocked" || r.status === "done" ? r.status : "idle";
  return {
    pane: prefix + r.pane,
    status,
    agent: typeof r.agent === "string" ? r.agent : "",
    project: typeof r.project === "string" ? r.project : "",
    cwd: typeof r.cwd === "string" ? r.cwd : "",
    branch: typeof r.branch === "string" ? r.branch : null,
    machine,
    updatedAt: Date.now(),
  };
}

/** Splits complete lines off the front of `buffer`, hands each non-empty one on, and returns the rest. */
function drainLines(buffer: string, onLine: (line: string) => void): string {
  let newline: number;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (line) onLine(line);
  }
  return buffer;
}

interface Stream {
  end(): void;
}

interface Transport {
  kind: "socket" | "ssh";
  target: string;
  /** The longest wait between reconnects: a local socket is cheap to retry, an SSH handshake is not. */
  maxRetryMs: number;
  /** Opens an `events.subscribe` stream; its first line is the acknowledgement. `closed` is called once. */
  subscribe(onLine: (line: string) => void, closed: (reason: string | null) => void): Stream;
  /** Sends one request line and resolves with the first reply line. */
  request(line: string): Promise<string>;
}

const SUBSCRIBE = { id: "sub", method: "events.subscribe", params: {} };
const SOCKET_TIMEOUT_MS = 5_000;

/**
 * This computer's Luvus over its owner-only Unix socket, using UHP 1.0: newline-delimited JSON, one
 * `{id, method, params}` request per connection, and `events.subscribe` turning its connection into a
 * `{event, sequence, data}` stream.
 */
function socketTransport(path: string): Transport {
  return {
    kind: "socket",
    target: path,
    maxRetryMs: 2_000,
    subscribe(onLine, closed) {
      let socket: { end(): void } | null = null;
      let ended = false;
      let done = false;
      let buffer = "";
      const close = (reason: string | null) => {
        if (done) return;
        done = true;
        closed(reason);
      };
      Bun.connect({
        unix: path,
        socket: {
          open(s) {
            socket = s;
            if (ended) return void s.end();
            s.write(`${JSON.stringify(SUBSCRIBE)}\n`);
          },
          data(_s, chunk) {
            buffer = drainLines(buffer + chunk.toString("utf8"), onLine);
          },
          close: () => close(null),
          error: (_s, error) => close(error.message),
        },
      }).catch((error) => close(error instanceof Error ? error.message : String(error)));
      return {
        end() {
          ended = true;
          socket?.end();
        },
      };
    },
    request(line) {
      return new Promise((resolve, reject) => {
        let buffer = "";
        let settled = false;
        const finish = (error: Error | null, value?: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value!);
        };
        const timer = setTimeout(() => finish(new Error("timed out")), SOCKET_TIMEOUT_MS);

        Bun.connect({
          unix: path,
          socket: {
            open: (socket) => void socket.write(`${line}\n`),
            data: (socket, chunk) => {
              buffer += chunk.toString("utf8");
              const newline = buffer.indexOf("\n");
              if (newline < 0) return;
              finish(null, buffer.slice(0, newline));
              socket.end();
            },
            close: () => finish(new Error("connection closed without a reply")),
            error: (_socket, error) => finish(error),
          },
        }).catch((error) => finish(error));
      });
    },
  };
}

// BatchMode: never stop for a password or host-key prompt nobody can answer. The keepalives notice a
// machine that went away, so the stream is closed and retried rather than left hanging.
const SSH_OPTIONS = ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"];
const SSH_TIMEOUT_MS = 20_000;

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
const lastLine = (text: string) => text.trim().split("\n").at(-1)?.trim() ?? "";

/**
 * A Luvus machine's server, reached the way Luvus documents for outside tools: `luvus uhp events` (a
 * stream) and `luvus uhp proxy` (one request) run on the machine over the user's own SSH, so its config,
 * keys and jump hosts apply. Nothing listens on a port and no socket is forwarded.
 */
function sshTransport(destination: string, binary: string, session: string): Transport {
  const command = (sub: string) => ["ssh", ...SSH_OPTIONS, destination, `${shellQuote(binary)} --session ${shellQuote(session)} uhp ${sub}`];
  return {
    kind: "ssh",
    target: destination,
    maxRetryMs: 60_000,
    subscribe(onLine, closed) {
      const proc = Bun.spawn(command("events"), { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
      const stderr = new Response(proc.stderr).text();
      void (async () => {
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          for await (const chunk of proc.stdout) buffer = drainLines(buffer + decoder.decode(chunk, { stream: true }), onLine);
        } catch {
          // The process was killed mid-read; exited below says how it ended.
        }
        const code = await proc.exited;
        closed(code === 0 ? null : lastLine(await stderr) || `ssh exited with ${code}`);
      })();
      return { end: () => proc.kill() };
    },
    async request(line) {
      const proc = Bun.spawn(command("proxy"), { stdin: new Blob([`${line}\n`]), stdout: "pipe", stderr: "pipe" });
      const timer = setTimeout(() => proc.kill(), SSH_TIMEOUT_MS);
      try {
        const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
        const reply = out.split("\n").find(Boolean);
        if (!reply) throw new Error(lastLine(err) || (proc.signalCode ? "timed out" : `ssh exited with ${code}`));
        return reply;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

const RETRY_MS = 2_000;
// A source that stays away this long stops counting: a machine that went down must not leave its
// panes Working forever. A short drop keeps them, so a reconnect does not flicker the state.
const STALE_MS = 30_000;

interface SourceHost {
  record: StateHub["record"];
  changed(): void;
}

/** Follows one Luvus server: subscribes, seeds its panes from `agent.list`, and reconnects when it drops. */
class UhpSource {
  readonly panes = new Map<string, PaneState>();
  readonly stats = newStats();
  private eventPanes = new Set<string>();
  private stream: Stream | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private stopped = false;
  private lastLogged: string | null = null;
  private readonly prefix: string;

  constructor(
    readonly name: string,
    readonly machine: string | null,
    readonly transport: Transport,
    private readonly host: SourceHost,
  ) {
    this.prefix = machine === null ? "" : `${name}:`;
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.stats.connection = "stopped";
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.stream?.end();
  }

  debug(): UhpSourceDebug {
    return {
      ...this.stats,
      eventCounts: { ...this.stats.eventCounts },
      name: this.name,
      machine: this.machine,
      transport: this.transport.kind,
      target: this.transport.target,
      panes: [...this.panes.values()],
    };
  }

  private record(channel: UhpFrameRecord["channel"], direction: UhpFrameRecord["direction"], frame: unknown, outcome: string) {
    this.host.record(this.name, channel, direction, frame, outcome);
  }

  private connect(): void {
    if (this.stopped) return;
    let acknowledged = false;
    this.stats.connection = "connecting";
    this.stats.connects += 1;
    this.record("subscribe", "out", this.transport.kind === "socket" ? SUBSCRIBE : `ssh ${this.transport.target} luvus uhp events`, "sent");

    const stream = this.transport.subscribe(
      (line) => {
        this.stats.framesReceived += 1;
        this.stats.lastFrameAt = new Date().toISOString();
        let frame: Record<string, any>;
        try {
          frame = JSON.parse(line);
        } catch {
          this.record("subscribe", "in", line, "dropped: not JSON");
          return;
        }

        if (!acknowledged) {
          if (frame.result?.type !== "subscription_started") {
            this.record("subscribe", "in", frame, "subscribe refused: expected result.type subscription_started");
            this.stats.lastError = `subscribe refused: ${JSON.stringify(frame.error ?? frame)}`;
            stream.end();
            return;
          }
          this.record("subscribe", "in", frame, "subscription acknowledged");
          acknowledged = true;
          this.failures = 0;
          this.stats.connection = "subscribed";
          this.stats.subscribedAt = new Date().toISOString();
          this.stats.lastError = null;
          this.lastLogged = null;
          if (this.staleTimer) clearTimeout(this.staleTimer);
          this.staleTimer = null;
          this.panes.clear();
          this.eventPanes.clear();
          void this.seed();
          return;
        }
        const name = String(frame.event ?? "(none)");
        this.stats.eventCounts[name] = (this.stats.eventCounts[name] ?? 0) + 1;
        const outcome = this.handleEvent(frame, stream);
        if (outcome.startsWith("applied")) this.stats.eventsApplied += 1;
        else this.stats.eventsIgnored += 1;
        // Luvus streams many events the app has no use for (terminal.output_ready several times a
        // second); keeping them would push the interesting frames out. They are still counted above.
        if (!outcome.startsWith("ignored: unhandled event")) this.record("subscribe", "in", frame, outcome);
      },
      (reason) => {
        if (this.stream === stream) this.stream = null;
        if (this.stopped) return;
        this.stats.connection = "disconnected";
        if (reason) this.stats.lastError = reason;
        this.record("subscribe", "in", null, acknowledged ? `connection closed${reason ? `: ${reason}` : ""}` : `could not subscribe: ${reason ?? "closed before the acknowledgement"}`);
        if (!acknowledged) {
          const message = this.stats.lastError ?? "connection closed before subscription ack";
          // Retried while Luvus or the machine is away: say it once, not every time.
          if (message !== this.lastLogged) console.warn(`[uhp-client] ${this.name}: connect failed: ${message}`);
          this.lastLogged = message;
          this.failures += 1;
        }
        if (this.panes.size && !this.staleTimer) {
          this.staleTimer = setTimeout(() => {
            this.staleTimer = null;
            this.panes.clear();
            this.host.changed();
          }, STALE_MS);
        }
        this.scheduleRetry();
      },
    );
    this.stream = stream;
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) return;
    // Doubles while it keeps failing, up to the transport's limit.
    const wait = Math.min(RETRY_MS * 2 ** Math.max(this.failures - 1, 0), this.transport.maxRetryMs);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, wait);
  }

  // Subscribe first, then read current state, so no change falls between the two.
  private async seed(): Promise<void> {
    const request = { id: "req", method: "agent.list", params: {} };
    this.record("request", "out", request, "sent");
    try {
      const response = JSON.parse(await this.transport.request(JSON.stringify(request)));
      this.record("request", "in", response, response.error ? "agent.list failed" : "agent.list reply");
      if (response.error) throw new Error(JSON.stringify(response.error));
      const rows: unknown[] = Array.isArray(response.result?.agents) ? response.result.agents : [];
      for (const row of rows) {
        const state = toPaneState(row, this.prefix, this.machine);
        if (state && !this.eventPanes.has(state.pane)) this.panes.set(state.pane, state);
      }
      this.host.changed();
    } catch (error) {
      console.warn(`[uhp-client] ${this.name}: agent.list failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** Applies one event frame and says what happened, for the debug log. */
  private handleEvent(frame: Record<string, any>, stream: Stream): string {
    switch (frame.event) {
      case "pane.agent_status_changed": {
        const data = frame.data;
        if (typeof data?.pane === "string" && !isAgentPane(data)) {
          // Not an agent (any more): a plain shell, or an agent that exited back to one.
          const pane = this.prefix + data.pane;
          this.eventPanes.add(pane);
          if (!this.panes.delete(pane)) return `ignored: pane ${pane} runs ${data.agent || "a command"}, not an agent`;
          this.host.changed();
          return `applied: pane ${pane} no longer runs an agent`;
        }
        const state = toPaneState(data, this.prefix, this.machine);
        if (!state) return "ignored: data has no string pane and status";
        this.eventPanes.add(state.pane);
        this.panes.set(state.pane, state);
        this.host.changed();
        return `applied: pane ${state.pane} is ${state.status}`;
      }
      case "pane.closed": {
        const pane = frame.data?.pane;
        if (typeof pane !== "string") return "ignored: data.pane is not a string";
        this.eventPanes.add(this.prefix + pane);
        this.panes.delete(this.prefix + pane);
        this.host.changed();
        return `applied: pane ${this.prefix + pane} closed`;
      }
      case "events.resync_required":
        // The cursor or queue was lost; closing triggers a fresh subscribe and seed.
        stream.end();
        return "applied: resync required, reconnecting";
      default:
        return frame.event === undefined ? "ignored: frame has no event field" : `ignored: unhandled event ${frame.event}`;
    }
  }
}

export interface LuvusMachine {
  id: string;
  label: string;
  destination: string;
  binary: string;
  session: string;
}

/**
 * The machines saved in Luvus (`luvus machine list`), narrowed by BRAINROTNT_MACHINES: unset or "all"
 * follows every enabled one, "off" none, and a comma-separated list only those ids.
 */
export async function discoverMachines(): Promise<{ machines: LuvusMachine[]; note: string }> {
  const wanted = process.env.BRAINROTNT_MACHINES?.trim() || "all";
  if (wanted === "off" || wanted === "none") return { machines: [], note: "off (BRAINROTNT_MACHINES=off)" };
  const luvus = Bun.which("luvus");
  if (!luvus) return { machines: [], note: "luvus is not on PATH, so only this computer is followed" };

  const proc = Bun.spawn([luvus, "machine", "list"], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), 5_000);
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  if (code !== 0) return { machines: [], note: `luvus machine list failed: ${lastLine(err) || `exit ${code}`}` };

  let rows: unknown[];
  try {
    const parsed = JSON.parse(out);
    rows = Array.isArray(parsed.machines) ? parsed.machines : [];
  } catch {
    return { machines: [], note: "luvus machine list did not print JSON" };
  }
  const only = wanted === "all" ? null : new Set(wanted.split(",").map((id) => id.trim()).filter(Boolean));
  const machines: LuvusMachine[] = [];
  for (const row of rows) {
    const m = row as Record<string, unknown>;
    if (typeof m.id !== "string" || typeof m.destination !== "string") continue;
    if (m.enabled === false || (m.transport !== undefined && m.transport !== "ssh")) continue;
    if (only && !only.has(m.id)) continue;
    machines.push({
      id: m.id,
      label: typeof m.label === "string" && m.label ? m.label : m.id,
      destination: m.destination,
      binary: typeof m.remote_binary === "string" && m.remote_binary ? m.remote_binary : "luvus",
      session: typeof m.preferred_session === "string" && m.preferred_session ? m.preferred_session : "default",
    });
  }
  const note = machines.length ? `${machines.length} from luvus machine list` : "none saved in Luvus";
  return { machines, note: only ? `${note} (BRAINROTNT_MACHINES=${wanted})` : note };
}

/**
 * Follows this computer's Luvus and every Luvus machine, and publishes one state for all of their panes.
 * This is the single adapter the PRD calls for, so a protocol change is a one-file fix.
 */
class LuvusUhpClient extends StateHub implements UhpClient {
  private readonly local: UhpSource;
  private sources: UhpSource[];
  private machineNote: string | null = null;
  private stopped = false;

  constructor(
    private readonly socketPath: string,
    private readonly followMachines: boolean,
  ) {
    super();
    this.local = new UhpSource("local", null, socketTransport(socketPath), this);
    this.sources = [this.local];
  }

  async start(): Promise<void> {
    this.local.start();
    if (!this.followMachines) return;
    try {
      const { machines, note } = await discoverMachines();
      this.machineNote = note;
      if (this.stopped) return;
      for (const machine of machines) {
        const source = new UhpSource(machine.id, machine.label, sshTransport(machine.destination, machine.binary, machine.session), this);
        this.sources.push(source);
        source.start();
      }
    } catch (error) {
      this.machineNote = `could not list Luvus machines: ${error instanceof Error ? error.message : error}`;
    }
  }

  stop(): void {
    this.stopped = true;
    for (const source of this.sources) source.stop();
  }

  debug(): UhpDebugSnapshot {
    return {
      ...this.snapshot(this.local.stats),
      mode: "luvus",
      socketPath: this.socketPath,
      panes: this.sources.flatMap((source) => [...source.panes.values()]),
      sources: this.sources.map((source) => source.debug()),
      machines: this.machineNote,
    };
  }

  changed(): void {
    let winner: PaneState | null = null;
    for (const source of this.sources) {
      for (const state of source.panes.values()) {
        if (
          !winner ||
          PRIORITY[state.status] > PRIORITY[winner.status] ||
          (PRIORITY[state.status] === PRIORITY[winner.status] && state.updatedAt > winner.updatedAt)
        ) {
          winner = state;
        }
      }
    }
    this.emit(
      winner
        ? { ...winner, at: new Date() }
        : { status: "idle", pane: "", agent: "", project: "", cwd: "", branch: null, machine: null, at: new Date() },
    );
  }
}

/** Cycles through states for local development without Luvus running. */
class MockUhpClient extends StateHub implements UhpClient {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly cycle: AgentState[] = ["working", "working", "blocked", "working", "done", "idle"];
  private step = 0;
  private stats = newStats();

  async start(): Promise<void> {
    this.stats.connection = "subscribed";
    this.timer = setInterval(() => {
      const status = this.cycle[this.step % this.cycle.length];
      this.step += 1;
      this.emit({
        status,
        pane: "1",
        agent: "mock-agent",
        project: "brainrotnt",
        cwd: "/home/user/brainrotnt",
        branch: "main",
        machine: null,
        at: new Date(),
      });
    }, 5000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  debug(): UhpDebugSnapshot {
    return { ...this.snapshot(this.stats), mode: "mock", socketPath: null, panes: [], sources: [], machines: null };
  }
}

export interface UhpClientOptions {
  /** Development: with no socket configured, cycle through fake states so the UI has something to show. */
  mockWhenUnset?: boolean;
  /** The installed app: with no socket configured, use this one, waiting for Luvus until it appears. */
  defaultSocketPath?: string;
  /** Also follow the Luvus machines (see discoverMachines). On by default with a real Luvus. */
  machines?: boolean;
}

export function createUhpClient({ mockWhenUnset = true, defaultSocketPath, machines = true }: UhpClientOptions = {}): UhpClient {
  const socketPath = process.env.UHP_SOCKET_PATH || process.env.LUVUS_SOCKET_PATH || (mockWhenUnset ? undefined : defaultSocketPath);
  if (socketPath) return new LuvusUhpClient(socketPath, machines);

  console.warn(
    "[uhp-client] UHP_SOCKET_PATH (or LUVUS_SOCKET_PATH) not set — using a mock agent-state feed for local dev.",
  );
  return new MockUhpClient();
}
