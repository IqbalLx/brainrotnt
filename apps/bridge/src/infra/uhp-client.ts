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
}

type Listener = (event: AgentStateEvent) => void;

class StateHub {
  private listeners = new Set<Listener>();
  private last: AgentStateEvent | null = null;

  current(): AgentStateEvent | null {
    return this.last;
  }

  onStateChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(event: AgentStateEvent): void {
    this.last = event;
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

  constructor(private readonly socketPath: string) {
    super();
  }

  async start(): Promise<void> {
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.subscription?.end();
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      await this.subscribe();
    } catch (error) {
      console.warn(`[uhp-client] connect failed: ${error instanceof Error ? error.message : error}`);
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

      Bun.connect({
        unix: this.socketPath,
        socket: {
          open: (socket) => {
            this.subscription = socket;
            socket.write(`${JSON.stringify({ id: "sub", method: "events.subscribe", params: {} })}\n`);
          },
          data: (socket, chunk) => {
            buffer += chunk.toString("utf8");
            let newline: number;
            while ((newline = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, newline);
              buffer = buffer.slice(newline + 1);
              if (!line) continue;

              let frame: Record<string, any>;
              try {
                frame = JSON.parse(line);
              } catch {
                continue;
              }

              if (!acknowledged) {
                if (frame.result?.type !== "subscription_started") {
                  reject(new Error(`subscribe refused: ${JSON.stringify(frame.error ?? frame)}`));
                  socket.end();
                  return;
                }
                acknowledged = true;
                this.panes.clear();
                this.eventPanes.clear();
                resolve();
                void this.seed();
                continue;
              }
              this.handleEvent(frame, socket);
            }
          },
          close: () => {
            if (!acknowledged) reject(new Error("connection closed before subscription ack"));
            else this.scheduleReconnect();
          },
          error: (_socket, error) => {
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

  private handleEvent(frame: Record<string, any>, socket: { end(): void }): void {
    switch (frame.event) {
      case "pane.agent_status_changed": {
        const state = toPaneState(frame.data);
        if (!state) return;
        this.eventPanes.add(state.pane);
        this.panes.set(state.pane, state);
        this.publish();
        return;
      }
      case "pane.closed": {
        const pane = frame.data?.pane;
        if (typeof pane !== "string") return;
        this.eventPanes.add(pane);
        this.panes.delete(pane);
        this.publish();
        return;
      }
      case "events.resync_required":
        // The cursor or queue was lost; closing triggers a fresh subscribe and seed.
        socket.end();
        return;
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
            socket.write(`${JSON.stringify({ id: "req", method, params })}\n`);
          },
          data: (socket, chunk) => {
            buffer += chunk.toString("utf8");
            const newline = buffer.indexOf("\n");
            if (newline < 0) return;
            try {
              const frame = JSON.parse(buffer.slice(0, newline));
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

export function createUhpClient(): UhpClient {
  const socketPath = process.env.UHP_SOCKET_PATH ?? process.env.LUVUS_SOCKET_PATH;
  if (socketPath) return new LuvusUhpClient(socketPath);

  console.warn(
    "[uhp-client] UHP_SOCKET_PATH (or LUVUS_SOCKET_PATH) not set — using a mock agent-state feed for local dev.",
  );
  return new MockUhpClient();
}
