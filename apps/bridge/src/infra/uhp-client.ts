export type AgentState = "idle" | "working" | "blocked" | "done";

export interface AgentStateEvent {
  status: AgentState;
  agent: string;
  cwd: string;
  branch: string | null;
  at: Date;
}

export interface UhpClient {
  start(): Promise<void>;
  stop(): void;
  onStateChange(listener: (event: AgentStateEvent) => void): () => void;
}

/**
 * Talks to Luvus over its UHP socket: one `events.subscribe` call for
 * `pane.agent_status_changed`, with a read-only scoped token. This is the
 * single adapter the PRD calls for, so a Luvus protocol change (young
 * project, still pre-1.0) is a one-file fix.
 */
class LuvusUhpClient implements UhpClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<(event: AgentStateEvent) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async start(): Promise<void> {
    this.connect();
  }

  stop(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  onStateChange(listener: (event: AgentStateEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private connect(): void {
    const socket = new WebSocket(this.url, {
      headers: { Authorization: `Bearer ${this.token}` },
    } as never);

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "events.subscribe",
          params: { events: ["pane.agent_status_changed"] },
        }),
      );
    });

    socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    socket.addEventListener("close", () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    });

    this.socket = socket;
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let parsed: { method?: string; params?: Record<string, unknown> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (parsed.method !== "pane.agent_status_changed" || !parsed.params) return;

    const { status, agent, cwd, branch } = parsed.params as {
      status: AgentState;
      agent: string;
      cwd: string;
      branch: string | null;
    };
    const stateEvent: AgentStateEvent = { status, agent, cwd, branch: branch ?? null, at: new Date() };
    for (const listener of this.listeners) listener(stateEvent);
  }
}

/**
 * Cycles through states for local development without Luvus running.
 */
class MockUhpClient implements UhpClient {
  private listeners = new Set<(event: AgentStateEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly cycle: AgentState[] = ["working", "working", "blocked", "working", "done", "idle"];
  private step = 0;

  async start(): Promise<void> {
    this.timer = setInterval(() => {
      const status = this.cycle[this.step % this.cycle.length];
      this.step += 1;
      const stateEvent: AgentStateEvent = {
        status,
        agent: "mock-agent",
        cwd: "/home/user/brainrotnt",
        branch: "main",
        at: new Date(),
      };
      for (const listener of this.listeners) listener(stateEvent);
    }, 5000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  onStateChange(listener: (event: AgentStateEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createUhpClient(): UhpClient {
  const url = process.env.UHP_URL;
  const token = process.env.UHP_TOKEN;
  if (url && token) return new LuvusUhpClient(url, token);

  console.warn("[uhp-client] UHP_URL/UHP_TOKEN not set — using a mock agent-state feed for local dev.");
  return new MockUhpClient();
}
