export type ChatMessageEvent = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  contextPath?: string;
};

export type ServerEvent =
  | { type: "ready" }
  | { type: "docs:changed" }
  | { type: "doc:changed"; root: string; path: string }
  | { type: "refs:changed"; root: string; path: string }
  | {
      type: "scan:start";
      roots: Array<{ name: string; path: string }>;
    }
  | { type: "scan:file"; root: string; path: string; count: number }
  | { type: "scan:root-done"; root: string; total: number }
  | { type: "scan:done" }
  | { type: "chat:state"; state: "starting" | "ready" | "error"; error?: string }
  | {
      type: "chat:update";
      update:
        | {
            sessionUpdate: "agent_message_chunk";
            content: { type: "text"; text: string } | { type: string };
          }
        | { sessionUpdate: string; [k: string]: unknown };
    }
  | {
      type: "chat:done";
      stopReason: string;
      error?: string;
    }
  | { type: "chat:message"; message: ChatMessageEvent }
  | { type: "chat:cleared" }
  | {
      type: "chat:permission";
      id: string;
      options: Array<{
        optionId: string;
        name: string;
        kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
      }>;
      toolCall: {
        toolCallId: string;
        title?: string | null;
        kind?: string | null;
        rawInput?: unknown;
        content?: unknown;
      };
    }
  | { type: "chat:permission-resolved"; id: string }
  | {
      type: "chat:modes";
      available: Array<{
        id: string;
        name: string;
        description?: string | null;
      }>;
      currentId: string | null;
    };

type Listener = (evt: ServerEvent) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

export function sendWs(msg: unknown): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/ws`;
}

function connect() {
  if (socket || listeners.size === 0) return;
  const ws = new WebSocket(wsUrl());
  socket = ws;
  ws.onmessage = (e) => {
    let evt: ServerEvent;
    try {
      evt = JSON.parse(e.data);
    } catch {
      return;
    }
    for (const l of listeners) l(evt);
  };
  ws.onclose = () => {
    socket = null;
    if (listeners.size > 0 && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 1000);
    }
  };
  ws.onerror = () => {
    ws.close();
  };
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      socket?.close();
      socket = null;
    }
  };
}
