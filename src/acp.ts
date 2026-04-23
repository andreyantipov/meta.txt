import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Writable, Readable } from "node:stream";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ContentBlock,
  type SessionNotification,
  type StopReason,
} from "@agentclientprotocol/sdk";

export type ChatEvent =
  | { type: "chat:state"; state: "starting" | "ready" | "error"; error?: string }
  | { type: "chat:update"; update: SessionNotification["update"] }
  | { type: "chat:done"; stopReason: StopReason | "error"; error?: string };

type Emit = (evt: ChatEvent) => void;

export class ACPAgent {
  private child: ChildProcessWithoutNullStreams | null = null;
  private conn: ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private startPromise: Promise<void> | null = null;
  private listeners = new Set<Emit>();
  private lastState: ChatEvent = { type: "chat:state", state: "starting" };

  constructor(private cwd: string) {}

  on(fn: Emit): () => void {
    this.listeners.add(fn);
    fn(this.lastState);
    return () => this.listeners.delete(fn);
  }

  private emit(evt: ChatEvent) {
    if (evt.type === "chat:state") this.lastState = evt;
    for (const fn of this.listeners) {
      try {
        fn(evt);
      } catch {}
    }
  }

  async ensureStarted(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = this.start().catch((err) => {
        this.emit({
          type: "chat:state",
          state: "error",
          error: String(err?.message ?? err),
        });
        this.startPromise = null;
        throw err;
      });
    }
    return this.startPromise;
  }

  private async start(): Promise<void> {
    this.emit({ type: "chat:state", state: "starting" });

    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(
      npxCmd,
      ["-y", "@agentclientprotocol/claude-agent-acp"],
      {
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      },
    );
    this.child = child;

    child.stderr.on("data", (d) => {
      const s = d.toString();
      if (s.trim()) console.error("[acp]", s.trimEnd());
    });
    child.on("exit", (code) => {
      this.emit({
        type: "chat:state",
        state: "error",
        error: `agent exited (code=${code ?? "null"})`,
      });
      this.conn = null;
      this.sessionId = null;
      this.startPromise = null;
    });

    const input = Writable.toWeb(
      child.stdin,
    ) as unknown as WritableStream<Uint8Array>;
    const output = Readable.toWeb(
      child.stdout,
    ) as unknown as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(input, output);

    this.conn = new ClientSideConnection(
      () => ({
        sessionUpdate: async (params) => {
          this.emit({ type: "chat:update", update: params.update });
        },
        requestPermission: async () => ({
          outcome: { outcome: "cancelled" },
        }),
        readTextFile: async () => ({ content: "" }),
        writeTextFile: async () => ({}),
        createTerminal: async () => {
          throw new Error("terminal not supported");
        },
      }),
      stream,
    );

    await this.conn.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: true,
      },
      clientInfo: { name: "meta.txt", version: "0.2.0" },
    });

    try {
      const session = await this.conn.newSession({
        cwd: this.cwd,
        mcpServers: [],
      });
      this.sessionId = session.sessionId;
    } catch (err: unknown) {
      const msg = String((err as { message?: string })?.message ?? err);
      if (/auth/i.test(msg)) {
        await this.conn.authenticate({ methodId: "claude-login" });
        const session = await this.conn.newSession({
          cwd: this.cwd,
          mcpServers: [],
        });
        this.sessionId = session.sessionId;
      } else {
        throw err;
      }
    }

    this.emit({ type: "chat:state", state: "ready" });
  }

  async prompt(blocks: ContentBlock[]): Promise<void> {
    await this.ensureStarted();
    if (!this.conn || !this.sessionId) throw new Error("agent not ready");
    try {
      const res = await this.conn.prompt({
        sessionId: this.sessionId,
        prompt: blocks,
      });
      this.emit({ type: "chat:done", stopReason: res.stopReason });
    } catch (err) {
      this.emit({
        type: "chat:done",
        stopReason: "error",
        error: String((err as { message?: string })?.message ?? err),
      });
    }
  }

  async cancel(): Promise<void> {
    if (!this.conn || !this.sessionId) return;
    try {
      await this.conn.cancel({ sessionId: this.sessionId });
    } catch {}
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.conn = null;
    this.sessionId = null;
    this.startPromise = null;
  }
}
