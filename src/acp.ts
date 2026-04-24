import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Writable, Readable } from "node:stream";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ContentBlock,
  type PermissionOption,
  type RequestPermissionOutcome,
  type SessionMode,
  type SessionNotification,
  type StopReason,
  type ToolCallUpdate,
} from "@agentclientprotocol/sdk";
import pkg from "../package.json" with { type: "json" };

const VERSION: string = (pkg as { version: string }).version;

export type ChatEvent =
  | { type: "chat:state"; state: "starting" | "ready" | "error"; error?: string }
  | { type: "chat:update"; update: SessionNotification["update"] }
  | {
      type: "chat:permission";
      id: string;
      options: PermissionOption[];
      toolCall: ToolCallUpdate;
    }
  | { type: "chat:permission-resolved"; id: string }
  | {
      type: "chat:modes";
      available: SessionMode[];
      currentId: string | null;
    }
  | { type: "chat:done"; stopReason: StopReason | "error"; error?: string };

type Emit = (evt: ChatEvent) => void;

type PendingPermission = {
  id: string;
  options: PermissionOption[];
  toolCall: ToolCallUpdate;
  resolve: (outcome: RequestPermissionOutcome) => void;
};

export class ACPAgent {
  private child: ChildProcessWithoutNullStreams | null = null;
  private conn: ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private startPromise: Promise<void> | null = null;
  private listeners = new Set<Emit>();
  private lastState: ChatEvent = { type: "chat:state", state: "starting" };
  private pendingPermissions = new Map<string, PendingPermission>();
  private permissionSeq = 0;
  private availableModes: SessionMode[] = [];
  private currentModeId: string | null = null;

  constructor(private cwd: string) {}

  getModes(): { available: SessionMode[]; currentId: string | null } {
    return {
      available: this.availableModes,
      currentId: this.currentModeId,
    };
  }

  async setMode(modeId: string): Promise<void> {
    await this.ensureStarted();
    if (!this.conn || !this.sessionId) throw new Error("agent not ready");
    await this.conn.setSessionMode({
      sessionId: this.sessionId,
      modeId,
    });
    this.currentModeId = modeId;
    this.emit({
      type: "chat:modes",
      available: this.availableModes,
      currentId: this.currentModeId,
    });
  }

  getPendingPermissions(): Array<{
    id: string;
    options: PermissionOption[];
    toolCall: ToolCallUpdate;
  }> {
    return [...this.pendingPermissions.values()].map(({ resolve, ...rest }) => {
      void resolve;
      return rest;
    });
  }

  resolvePermission(id: string, optionId: string | null): boolean {
    const pending = this.pendingPermissions.get(id);
    if (!pending) return false;
    this.pendingPermissions.delete(id);
    pending.resolve(
      optionId === null
        ? { outcome: "cancelled" }
        : { outcome: "selected", optionId },
    );
    this.emit({ type: "chat:permission-resolved", id });
    return true;
  }

  private cancelAllPermissions() {
    for (const [id, p] of this.pendingPermissions) {
      p.resolve({ outcome: "cancelled" });
      this.emit({ type: "chat:permission-resolved", id });
    }
    this.pendingPermissions.clear();
  }

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
    const cleanEnv = { ...process.env };
    delete cleanEnv.ANTHROPIC_API_KEY;
    delete cleanEnv.ANTHROPIC_AUTH_TOKEN;
    const child = spawn(
      npxCmd,
      ["-y", "@agentclientprotocol/claude-agent-acp"],
      {
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: cleanEnv,
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
      this.cancelAllPermissions();
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
          const u = params.update as {
            sessionUpdate: string;
            currentModeId?: string;
          };
          if (u.sessionUpdate === "current_mode_update" && u.currentModeId) {
            this.currentModeId = u.currentModeId;
            this.emit({
              type: "chat:modes",
              available: this.availableModes,
              currentId: this.currentModeId,
            });
          }
          this.emit({ type: "chat:update", update: params.update });
        },
        requestPermission: async (params) => {
          const id = `p-${Date.now()}-${++this.permissionSeq}`;
          const outcome = await new Promise<RequestPermissionOutcome>(
            (resolve) => {
              this.pendingPermissions.set(id, {
                id,
                options: params.options,
                toolCall: params.toolCall,
                resolve,
              });
              this.emit({
                type: "chat:permission",
                id,
                options: params.options,
                toolCall: params.toolCall,
              });
            },
          );
          return { outcome };
        },
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
      clientInfo: { name: "meta.txt", version: VERSION },
    });

    const captureSession = (session: {
      sessionId: string;
      modes?: { availableModes: SessionMode[]; currentModeId: string } | null;
    }) => {
      this.sessionId = session.sessionId;
      if (session.modes) {
        this.availableModes = session.modes.availableModes;
        this.currentModeId = session.modes.currentModeId;
      } else {
        this.availableModes = [];
        this.currentModeId = null;
      }
    };

    try {
      const session = await this.conn.newSession({
        cwd: this.cwd,
        mcpServers: [],
      });
      captureSession(session);
    } catch (err: unknown) {
      const msg = String((err as { message?: string })?.message ?? err);
      if (/auth/i.test(msg)) {
        await this.conn.authenticate({ methodId: "claude-login" });
        const session = await this.conn.newSession({
          cwd: this.cwd,
          mcpServers: [],
        });
        captureSession(session);
      } else {
        throw err;
      }
    }

    this.emit({ type: "chat:state", state: "ready" });
    this.emit({
      type: "chat:modes",
      available: this.availableModes,
      currentId: this.currentModeId,
    });
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
    this.cancelAllPermissions();
    if (!this.conn || !this.sessionId) return;
    try {
      await this.conn.cancel({ sessionId: this.sessionId });
    } catch {}
  }

  stop(): void {
    this.cancelAllPermissions();
    this.child?.kill();
    this.child = null;
    this.conn = null;
    this.sessionId = null;
    this.startPromise = null;
  }
}
