import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import {
  ArrowUp,
  CaretDown,
  ChatCircleText,
  Check,
  HandPalm,
  Lightning,
  Notepad,
  PencilSimpleLine,
  ShieldCheck,
  Sparkle,
  Square,
  Trash,
  Warning,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { subscribe, sendWs } from "@/lib/events";
import type { DocRef } from "@/lib/api";
import { useShortcut } from "@/lib/keymap";
import { cn } from "@/lib/utils";

type PermissionOption = {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
};

type PermissionRequest = {
  id: string;
  options: PermissionOption[];
  toolCall: {
    toolCallId: string;
    title?: string | null;
    kind?: string | null;
    rawInput?: unknown;
  };
};

type SessionMode = {
  id: string;
  name: string;
  description?: string | null;
};

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
  open: boolean;
  onClose: () => void;
};

const REVEAL_PER_FRAME = 4;
const CATCHUP_DIVISOR = 20;

export function ChatPanel({ active, open, onClose }: Props) {
  const chatSc = useShortcut("chat.toggle");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<AgentState>("idle");
  const [busy, setBusy] = useState(false);
  const [attachContext, setAttachContext] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [modes, setModes] = useState<{
    available: SessionMode[];
    currentId: string | null;
  }>({ available: [], currentId: null });
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    // Defer one frame so the panel is unhidden before we focus.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);
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
      } else if (evt.type === "chat:permission") {
        setPermissions((p) =>
          p.some((x) => x.id === evt.id)
            ? p
            : [
                ...p,
                {
                  id: evt.id,
                  options: evt.options,
                  toolCall: evt.toolCall,
                },
              ],
        );
      } else if (evt.type === "chat:permission-resolved") {
        setPermissions((p) => p.filter((x) => x.id !== evt.id));
      } else if (evt.type === "chat:modes") {
        setModes({ available: evt.available, currentId: evt.currentId });
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, permissions]);

  const resolvePermission = (id: string, optionId: string | null) => {
    sendWs({ type: "chat:permission-response", id, optionId });
    setPermissions((p) => p.filter((x) => x.id !== id));
  };

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
  const setMode = (modeId: string) => {
    sendWs({ type: "chat:set-mode", modeId });
    setModes((m) => ({ ...m, currentId: modeId }));
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <header className="flex h-[42px] shrink-0 items-center justify-between border-b border-border px-4 text-xs">
        <div className="flex items-center gap-1.5">
          <ChatCircleText
            className={cn(
              "size-3.5",
              state === "ready"
                ? "text-foreground/80"
                : state === "starting"
                  ? "animate-pulse text-amber-500"
                  : state === "error"
                    ? "text-destructive"
                    : "text-muted-foreground/60",
            )}
          />
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
            title={chatSc.title ? `Close (${chatSc.title})` : "Close"}
            className="flex shrink-0 items-center gap-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
            {chatSc.parts.length > 0 && (
              <span className="shortcut-hint pointer-events-none shrink-0 items-center gap-0.5">
                {chatSc.parts.map((p, i) => (
                  <kbd
                    key={i}
                    className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px] leading-none"
                  >
                    {p}
                  </kbd>
                ))}
              </span>
            )}
          </button>
        </div>
      </header>

      {messages.length === 0 && !error && permissions.length === 0 ? (
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
        <div
          ref={listRef}
          className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden px-4 py-6"
        >
          {messages.map((m) => (
            <Message key={m.id} msg={m} />
          ))}
          {permissions.map((req) => (
            <PermissionCard
              key={req.id}
              req={req}
              onResolve={resolvePermission}
            />
          ))}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
      )}

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex flex-col rounded-md border border-input bg-transparent transition-colors focus-within:border-ring">
          <textarea
            ref={inputRef}
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
          <div className="flex items-center gap-2 px-1.5 pb-1.5">
            <ModePicker modes={modes} onSelect={setMode} />
            <div className="ml-auto flex items-center gap-2">
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
                  title="Send (↵)  ·  Newline (⇧↵)"
                >
                  <ArrowUp className="size-3" />
                </Button>
              )}
            </div>
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

function ModePicker({
  modes,
  onSelect,
}: {
  modes: { available: SessionMode[]; currentId: string | null };
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasModes = modes.available.length > 0;
  const current = hasModes
    ? modes.available.find((m) => m.id === modes.currentId) ?? modes.available[0]
    : null;
  const label = current?.name ?? "Default";
  const CurrentIcon = current ? modeIcon(current) : Lightning;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={!hasModes}
        onClick={() => hasModes && setOpen((o) => !o)}
        title={hasModes ? "Permission mode" : "Waiting for agent…"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-colors",
          hasModes
            ? "text-foreground hover:bg-muted"
            : "cursor-not-allowed text-muted-foreground/60",
        )}
      >
        <CurrentIcon className="size-3.5 shrink-0" weight="fill" />
        <span className="truncate max-w-[180px]">{label}</span>
        <CaretDown className="size-3 shrink-0 opacity-70" weight="bold" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-72 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Available Modes
          </div>
          {modes.available.map((m) => {
            const ModeIcon = modeIcon(m);
            const active = m.id === modes.currentId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onSelect(m.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-muted",
                  active && "bg-muted",
                )}
              >
                <ModeIcon
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  weight="fill"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[12px] font-medium text-foreground">
                    {m.name}
                  </span>
                  {m.description && (
                    <span className="text-[11px] leading-snug text-muted-foreground">
                      {m.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function modeIcon(mode: SessionMode): Icon {
  const key = `${mode.id} ${mode.name}`.toLowerCase();
  if (/bypass/.test(key)) return Lightning;
  if (/plan/.test(key)) return Notepad;
  if (/accept|edit/.test(key)) return PencilSimpleLine;
  if (/don't ?ask|dont_?ask|deny/.test(key)) return HandPalm;
  if (/auto|classifier/.test(key)) return Sparkle;
  return ShieldCheck;
}

function Message({ msg }: { msg: Msg }) {
  if (msg.role === "user") return <UserMessage msg={msg} />;
  return <AssistantMessage msg={msg} />;
}

function UserMessage({ msg }: { msg: Msg }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        You
      </span>
      <div className="min-w-0 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed">
        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        {msg.contextPath && (
          <div className="mt-1.5 break-all border-t border-border/60 pt-1.5 font-mono text-[10px] text-muted-foreground">
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
    <div className="flex min-w-0 flex-col gap-1">
      <span className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Chat
      </span>
      {msg.streaming ? (
        <div className="whitespace-pre-wrap break-words px-1 text-sm leading-relaxed text-foreground">
          {msg.content}
          <Caret />
        </div>
      ) : html ? (
        <div
          className="markdown-body min-w-0 px-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
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

function PermissionCard({
  req,
  onResolve,
}: {
  req: PermissionRequest;
  onResolve: (id: string, optionId: string | null) => void;
}) {
  const title = req.toolCall.title || req.toolCall.toolCallId;
  const rawInput = req.toolCall.rawInput;
  const inputPreview = useMemo(() => {
    if (rawInput == null) return null;
    try {
      const s =
        typeof rawInput === "string"
          ? rawInput
          : JSON.stringify(rawInput, null, 2);
      return s.length > 600 ? s.slice(0, 600) + "…" : s;
    } catch {
      return null;
    }
  }, [rawInput]);

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-amber-500">
        <Warning weight="duotone" className="size-3.5" />
        <span>Permission required</span>
      </div>
      <div className="min-w-0 break-words text-sm text-foreground">{title}</div>
      {inputPreview && (
        <pre className="min-w-0 overflow-x-auto rounded border border-border/60 bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
          {inputPreview}
        </pre>
      )}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {req.options.map((opt) => {
          const isAllow = opt.kind.startsWith("allow");
          return (
            <button
              key={opt.optionId}
              type="button"
              onClick={() => onResolve(req.id, opt.optionId)}
              className={cn(
                "inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors",
                isAllow
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {isAllow ? (
                <Check className="size-3" weight="bold" />
              ) : (
                <X className="size-3" weight="bold" />
              )}
              <span>{opt.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
