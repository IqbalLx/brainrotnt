export type AgentState = "idle" | "working" | "blocked" | "done";

export interface AgentStateEvent {
  status: AgentState;
  pane: string;
  agent: string;
  project: string;
  cwd: string;
  branch: string | null;
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
  channel: "subscribe" | "request";
  direction: "out" | "in";
  frame: unknown;
  outcome: string;
}

export interface UhpDebugSnapshot {
  mode: "luvus" | "mock";
  socketPath: string | null;
  connection: "idle" | "connecting" | "subscribed" | "disconnected" | "stopped";
  subscribedAt: string | null;
  lastFrameAt: string | null;
  lastError: string | null;
  connects: number;
  framesReceived: number;
  eventsApplied: number;
  eventsIgnored: number;
  /** Frames received per event name, so a renamed or missing event shows up even when it is not kept in `recent`. */
  eventCounts: Record<string, number>;
  publishes: number;
  listeners: number;
  panes: unknown[];
  current: AgentStateEvent | null;
  recent: UhpFrameRecord[];
}

type Listener = (event: AgentStateEvent) => void;

// Set UHP_DEBUG=1 to also print every frame and every published state to the bridge's console.
const DEBUG_LOG = process.env.UHP_DEBUG === "1";
const RECENT_FRAMES = 200;

class StateHub {
  private listeners = new Set<Listener>();
  private last: AgentStateEvent | null = null;
  protected stats = {
    connection: "idle" as UhpDebugSnapshot["connection"],
    subscribedAt: null as string | null,
    lastFrameAt: null as string | null,
    lastError: null as string | null,
    connects: 0,
    framesReceived: 0,
    eventsApplied: 0,
    eventsIgnored: 0,
    eventCounts: {} as Record<string, number>,
    publishes: 0,
  };
  private recent: UhpFrameRecord[] = [];

  current(): AgentStateEvent | null {
    return this.last;
  }

  onStateChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  inject(event: Omit<AgentStateEvent, "at">): void {
    this.record("subscribe", "in", event, "injected through /api/debug/agent-state");
    this.emit({ ...event, at: new Date() });
  }

  debug(): UhpDebugSnapshot {
    return {
      mode: "mock",
      socketPath: null,
      ...this.stats,
      eventCounts: { ...this.stats.eventCounts },
      listeners: this.listeners.size,
      panes: [],
      current: this.last,
      recent: [...this.recent],
    };
  }

  protected record(channel: UhpFrameRecord["channel"], direction: UhpFrameRecord["direction"], frame: unknown, outcome: string): void {
    const entry = { at: new Date().toISOString(), channel, direction, frame, outcome };
    this.recent.push(entry);
    if (this.recent.length > RECENT_FRAMES) this.recent.shift();
    if (DEBUG_LOG) console.log(`[uhp-debug] ${entry.at} ${channel} ${direction === "out" ? "->" : "<-"} ${JSON.stringify(frame)} :: ${outcome}`);
  }

  protected emit(event: AgentStateEvent): void {
    this.last = event;
    this.stats.publishes += 1;
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
  updatedAt: number;
}

function toPaneState(raw: unknown): PaneState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.pane !== "string" || typeof r.status !== "string") return null;
  // "unknown" means Luvus has no evidence either way; it never demands attention.
  const status: AgentState =
    r.status === "working" || r.status === "blocked" || r.status === "done" ? r.status : "idle";
  return {
    pane: r.pane,
    status,
    agent: typeof r.agent === "string" ? r.agent : "",
    project: typeof r.project === "string" ? r.project : "",
    cwd: typeof r.cwd === "string" ? r.cwd : "",
    branch: typeof r.branch === "string" ? r.branch : null,
    updatedAt: Date.now(),
  };
}

const RECONNECT_MS = 2000;
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Talks to a Luvus session server over its owner-only Unix socket using UHP 1.0:
 * newline-delimited JSON, one `{id, method, params}` request per connection, and
 * `events.subscribe` turning its connection into a `{event, sequence, data}` stream.
 * This is the single adapter the PRD calls for, so a protocol change is a one-file fix.
 */
class LuvusUhpClient extends StateHub implements UhpClient {
  private panes = new Map<string, PaneState>();
  private eventPanes = new Set<string>();
  private subscription: { end(): void } | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private lastLogged: string | null = null;

  constructor(private readonly socketPath: string) {
    super();
  }

  async start(): Promise<void> {
    void this.connect();
  }

  override debug(): UhpDebugSnapshot {
    return { ...super.debug(), mode: "luvus", socketPath: this.socketPath, panes: [...this.panes.values()] };
  }

  stop(): void {
    this.stopped = true;
    this.stats.connection = "stopped";
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.subscription?.end();
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      await this.subscribe();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Retried every 2 s while Luvus is not running: say it once, not every time.
      if (message !== this.lastLogged) console.warn(`[uhp-client] connect failed: ${message}`);
      this.lastLogged = message;
      this.stats.connection = "disconnected";
      this.stats.lastError = message;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_MS);
  }

  private subscribe(): Promise<void> {
    return new Promise((resolve, reject) => {
      let buffer = "";
      let acknowledged = false;
      this.stats.connection = "connecting";
      this.stats.connects += 1;

      Bun.connect({
        unix: this.socketPath,
        socket: {
          open: (socket) => {
            this.subscription = socket;
            const request = { id: "sub", method: "events.subscribe", params: {} };
            this.record("subscribe", "out", request, "sent");
            socket.write(`${JSON.stringify(request)}\n`);
          },
          data: (socket, chunk) => {
            buffer += chunk.toString("utf8");
            let newline: number;
            while ((newline = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, newline);
              buffer = buffer.slice(newline + 1);
              if (!line) continue;

              this.stats.framesReceived += 1;
              this.stats.lastFrameAt = new Date().toISOString();
              let frame: Record<string, any>;
              try {
                frame = JSON.parse(line);
              } catch {
                this.record("subscribe", "in", line, "dropped: not JSON");
                continue;
              }

              if (!acknowledged) {
                if (frame.result?.type !== "subscription_started") {
                  this.record("subscribe", "in", frame, "subscribe refused: expected result.type subscription_started");
                  reject(new Error(`subscribe refused: ${JSON.stringify(frame.error ?? frame)}`));
                  socket.end();
                  return;
                }
                this.record("subscribe", "in", frame, "subscription acknowledged");
                acknowledged = true;
                this.stats.connection = "subscribed";
                this.stats.subscribedAt = new Date().toISOString();
                this.stats.lastError = null;
                this.lastLogged = null;
                this.panes.clear();
                this.eventPanes.clear();
                resolve();
                void this.seed();
                continue;
              }
              const name = String(frame.event ?? "(none)");
              this.stats.eventCounts[name] = (this.stats.eventCounts[name] ?? 0) + 1;
              const outcome = this.handleEvent(frame, socket);
              if (outcome.startsWith("applied")) this.stats.eventsApplied += 1;
              else this.stats.eventsIgnored += 1;
              // Luvus streams many events the app has no use for (terminal.output_ready several times a
              // second); keeping them would push the interesting frames out. They are still counted above.
              if (!outcome.startsWith("ignored: unhandled event")) this.record("subscribe", "in", frame, outcome);
            }
          },
          close: () => {
            if (!this.stopped) this.stats.connection = "disconnected";
            this.record("subscribe", "in", null, "connection closed");
            if (!acknowledged) reject(new Error("connection closed before subscription ack"));
            else this.scheduleReconnect();
          },
          error: (_socket, error) => {
            this.stats.lastError = error.message;
            if (!acknowledged) reject(error);
          },
        },
      }).catch(reject);
    });
  }

  // Subscribe first, then read current state, so no change falls between the two.
  private async seed(): Promise<void> {
    try {
      const response = await this.request("agent.list", {});
      const rows: unknown[] = Array.isArray(response.result?.agents) ? response.result.agents : [];
      for (const row of rows) {
        const state = toPaneState(row);
        if (state && !this.eventPanes.has(state.pane)) this.panes.set(state.pane, state);
      }
      this.publish();
    } catch (error) {
      console.warn(`[uhp-client] agent.list failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** Applies one event frame and says what happened, for the debug log. */
  private handleEvent(frame: Record<string, any>, socket: { end(): void }): string {
    switch (frame.event) {
      case "pane.agent_status_changed": {
        const state = toPaneState(frame.data);
        if (!state) return "ignored: data has no string pane and status";
        this.eventPanes.add(state.pane);
        this.panes.set(state.pane, state);
        this.publish();
        return `applied: pane ${state.pane} is ${state.status}`;
      }
      case "pane.closed": {
        const pane = frame.data?.pane;
        if (typeof pane !== "string") return "ignored: data.pane is not a string";
        this.eventPanes.add(pane);
        this.panes.delete(pane);
        this.publish();
        return `applied: pane ${pane} closed`;
      }
      case "events.resync_required":
        // The cursor or queue was lost; closing triggers a fresh subscribe and seed.
        socket.end();
        return "applied: resync required, reconnecting";
      default:
        return frame.event === undefined ? "ignored: frame has no event field" : `ignored: unhandled event ${frame.event}`;
    }
  }

  private publish(): void {
    let winner: PaneState | null = null;
    for (const state of this.panes.values()) {
      if (
        !winner ||
        PRIORITY[state.status] > PRIORITY[winner.status] ||
        (PRIORITY[state.status] === PRIORITY[winner.status] && state.updatedAt > winner.updatedAt)
      ) {
        winner = state;
      }
    }
    this.emit(
      winner
        ? { ...winner, at: new Date() }
        : { status: "idle", pane: "", agent: "", project: "", cwd: "", branch: null, at: new Date() },
    );
  }

  private request(method: string, params: Record<string, unknown>): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      let buffer = "";
      let settled = false;
      const finish = (error: Error | null, value?: Record<string, any>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value!);
      };
      const timer = setTimeout(() => finish(new Error(`${method} timed out`)), REQUEST_TIMEOUT_MS);

      Bun.connect({
        unix: this.socketPath,
        socket: {
          open: (socket) => {
            const request = { id: "req", method, params };
            this.record("request", "out", request, "sent");
            socket.write(`${JSON.stringify(request)}\n`);
          },
          data: (socket, chunk) => {
            buffer += chunk.toString("utf8");
            const newline = buffer.indexOf("\n");
            if (newline < 0) return;
            try {
              const frame = JSON.parse(buffer.slice(0, newline));
              this.record("request", "in", frame, frame.error ? `${method} failed` : `${method} reply`);
              if (frame.error) finish(new Error(`${method}: ${JSON.stringify(frame.error)}`));
              else finish(null, frame);
            } catch (error) {
              finish(error instanceof Error ? error : new Error(String(error)));
            }
            socket.end();
          },
          close: () => finish(new Error(`${method}: connection closed without a reply`)),
          error: (_socket, error) => finish(error),
        },
      }).catch((error) => finish(error));
    });
  }
}

/** Cycles through states for local development without Luvus running. */
class MockUhpClient extends StateHub implements UhpClient {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly cycle: AgentState[] = ["working", "working", "blocked", "working", "done", "idle"];
  private step = 0;

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
        at: new Date(),
      });
    }, 5000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

export interface UhpClientOptions {
  /** Development: with no socket configured, cycle through fake states so the UI has something to show. */
  mockWhenUnset?: boolean;
  /** The installed app: with no socket configured, use this one, waiting for Luvus until it appears. */
  defaultSocketPath?: string;
}

export function createUhpClient({ mockWhenUnset = true, defaultSocketPath }: UhpClientOptions = {}): UhpClient {
  const socketPath = process.env.UHP_SOCKET_PATH || process.env.LUVUS_SOCKET_PATH || (mockWhenUnset ? undefined : defaultSocketPath);
  if (socketPath) return new LuvusUhpClient(socketPath);

  console.warn(
    "[uhp-client] UHP_SOCKET_PATH (or LUVUS_SOCKET_PATH) not set — using a mock agent-state feed for local dev.",
  );
  return new MockUhpClient();
}
