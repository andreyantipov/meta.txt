import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { marked } from "marked";
import { ArrowUp, ChatCircleText, Square, Trash, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { subscribe, sendWs } from "@/lib/events";
import type { DocRef } from "@/lib/api";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  contextPath?: string;
  streaming?: boolean;
};

type AgentState = "starting" | "ready" | "error" | "idle";

type Props = {
  active: DocRef | null;
  onClose: () => void;
};

const REVEAL_PER_FRAME = 4;
const CATCHUP_DIVISOR = 20;

export function ChatPanel({ active, onClose }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<AgentState>("idle");
  const [busy, setBusy] = useState(false);
  const [attachContext, setAttachContext] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef<string>("");
  const streamingIdRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef<boolean>(false);

  useEffect(() => {
    fetch("/api/chat/history")
      .then((r) => r.json())
      .then((h: { messages: Msg[] }) => setMessages(h.messages ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const scheduleFlush = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(flushBuffer);
  };

  const flushBuffer = () => {
    rafRef.current = null;
    const id = streamingIdRef.current;
    if (!id) {
      bufferRef.current = "";
      return;
    }
    const buf = bufferRef.current;
    if (buf) {
      const catchup = Math.ceil(buf.length / CATCHUP_DIVISOR);
      const take = Math.max(REVEAL_PER_FRAME, catchup);
      const chunk = buf.slice(0, take);
      bufferRef.current = buf.slice(take);
      setMessages((m) =>
        m.map((x) => (x.id === id ? { ...x, content: x.content + chunk } : x)),
      );
    }

    if (bufferRef.current.length > 0) {
      scheduleFlush();
    } else if (doneRef.current) {
      setMessages((m) =>
        m.map((x) => (x.id === id ? { ...x, streaming: false } : x)),
      );
      streamingIdRef.current = null;
      doneRef.current = false;
    }
  };

  useEffect(() => {
    const unsub = subscribe((evt) => {
      if (evt.type === "chat:state") {
        setState(evt.state);
        setError(evt.state === "error" ? evt.error ?? "agent error" : null);
      } else if (evt.type === "chat:message") {
        setMessages((m) => [...m, evt.message]);
      } else if (evt.type === "chat:update") {
        const u = evt.update as {
          sessionUpdate: string;
          content?: { type: string; text?: string };
        };
        if (
          u.sessionUpdate !== "agent_message_chunk" ||
          u.content?.type !== "text" ||
          !u.content.text
        )
          return;
        if (!streamingIdRef.current) {
          const id = `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          streamingIdRef.current = id;
          setMessages((m) => [
            ...m,
            { id, role: "assistant", content: "", ts: Date.now(), streaming: true },
          ]);
        }
        bufferRef.current += u.content.text;
        scheduleFlush();
      } else if (evt.type === "chat:done") {
        doneRef.current = true;
        setBusy(false);
        if (evt.error) setError(evt.error);
        scheduleFlush();
      } else if (evt.type === "chat:cleared") {
        setMessages([]);
        bufferRef.current = "";
        streamingIdRef.current = null;
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    const payload: {
      type: "chat:send";
      text: string;
      contextRoot?: string;
      contextPath?: string;
    } = { type: "chat:send", text };
    if (attachContext && active) {
      payload.contextRoot = active.root;
      payload.contextPath = active.path;
    }
    if (sendWs(payload)) {
      setInput("");
      setBusy(true);
      setError(null);
    }
  };

  const cancel = () => sendWs({ type: "chat:cancel" });
  const clear = () => {
    if (!confirm("clear chat history?")) return;
    sendWs({ type: "chat:clear" });
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-border px-4 text-xs">
        <div className="flex items-center gap-2">
          <StateDot state={state} />
          <span className="font-medium text-foreground">Chat</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={clear}
            title="Clear history"
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Trash className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close (⌘J)"
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </header>

      {messages.length === 0 && !error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <ChatCircleText
            size={40}
            weight="duotone"
            className="text-muted-foreground/60"
          />
          <div className="text-sm text-muted-foreground">
            Ask about these docs.
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div ref={listRef} className="flex flex-col gap-6 px-4 py-6">
            {messages.map((m) => (
              <Message key={m.id} msg={m} />
            ))}
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex flex-col rounded-md border border-input bg-transparent transition-colors focus-within:border-ring">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message…"
            rows={2}
            className="block max-h-48 min-h-[2.5rem] w-full resize-none border-0 bg-transparent px-2.5 pb-1 pt-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Kbd>↵</Kbd>
              <span>send</span>
              <span className="text-foreground/25">·</span>
              <span className="inline-flex items-center gap-0.5">
                <Kbd>⇧</Kbd>
                <Kbd>↵</Kbd>
              </span>
              <span>newline</span>
            </div>
            {busy ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={cancel}
                className="size-6 shrink-0 rounded p-0"
                title="Stop"
              >
                <Square className="size-2.5" weight="fill" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={send}
                disabled={!input.trim()}
                className="size-6 shrink-0 rounded p-0"
                title="Send"
              >
                <ArrowUp className="size-3" />
              </Button>
            )}
          </div>
        </div>
        {active && (
          <label className="mt-2 flex cursor-pointer items-center gap-1.5 px-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
            <input
              type="checkbox"
              checked={attachContext}
              onChange={(e) => setAttachContext(e.target.checked)}
              className="size-3 accent-foreground"
            />
            <span className="truncate">
              attach{" "}
              <span className="font-mono">
                {active.root}/{active.path}
              </span>
            </span>
          </label>
        )}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px] leading-none text-muted-foreground">
      {children}
    </kbd>
  );
}

function StateDot({ state }: { state: AgentState }) {
  const color =
    state === "ready"
      ? "bg-emerald-500"
      : state === "starting"
        ? "bg-amber-500 animate-pulse"
        : state === "error"
          ? "bg-destructive"
          : "bg-muted-foreground/40";
  return <span className={cn("size-1.5 rounded-full", color)} />;
}

function Message({ msg }: { msg: Msg }) {
  if (msg.role === "user") return <UserMessage msg={msg} />;
  return <AssistantMessage msg={msg} />;
}

function UserMessage({ msg }: { msg: Msg }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        You
      </span>
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed">
        <div className="whitespace-pre-wrap">{msg.content}</div>
        {msg.contextPath && (
          <div className="mt-1.5 border-t border-border/60 pt-1.5 font-mono text-[10px] text-muted-foreground">
            {msg.contextPath}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ msg }: { msg: Msg }) {
  const html = useMemo(() => {
    if (msg.streaming) return null;
    return msg.content ? (marked.parse(msg.content) as string) : "";
  }, [msg.content, msg.streaming]);

  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Chat
      </span>
      {msg.streaming ? (
        <div className="whitespace-pre-wrap px-1 text-sm leading-relaxed text-foreground">
          {msg.content}
          <Caret />
        </div>
      ) : html ? (
        <div
          className="markdown-body px-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="px-1 text-sm italic text-muted-foreground">…</div>
      )}
    </div>
  );
}

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-[1em] w-[2px] -mb-[2px] translate-y-[2px] animate-pulse bg-foreground/70 align-baseline" />
  );
}
