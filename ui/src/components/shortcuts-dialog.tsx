import { useEffect, useMemo, useState } from "react";
import { ArrowCounterClockwise, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  DEFINITIONS,
  formatChord,
  getPlatform,
  normalizeEventKey,
  useKeymap,
  type Chord,
  type Platform,
  type ShortcutDef,
} from "@/lib/keymap";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ShortcutsDialog({ open, onClose }: Props) {
  const keymap = useKeymap();
  const [captureFor, setCaptureFor] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const platform = useMemo<Platform>(() => getPlatform(), []);

  useEffect(() => {
    if (!open) {
      setCaptureFor(null);
      setConflictMsg(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (captureFor) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key === "Escape") {
          setCaptureFor(null);
          return;
        }
        if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return;
        const chord: Chord = {
          mod: e.metaKey || e.ctrlKey,
          alt: e.altKey,
          shift: e.shiftKey,
          key: normalizeEventKey(e),
        };
        const conflicts = keymap.findConflicts(chord, captureFor);
        keymap.setChord(captureFor, chord);
        if (conflicts.length > 0) {
          const victimLabels = conflicts
            .map((id) => DEFINITIONS.find((d) => d.id === id)?.label)
            .filter(Boolean)
            .join(", ");
          setConflictMsg(`Unbound from: ${victimLabels}`);
        } else {
          setConflictMsg(null);
        }
        setCaptureFor(null);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, captureFor, keymap, onClose]);

  const groups = useMemo(() => {
    const m = new Map<string, ShortcutDef[]>();
    for (const d of DEFINITIONS) {
      const arr = m.get(d.group) ?? [];
      arr.push(d);
      m.set(d.group, arr);
    }
    return [...m.entries()];
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
          <div className="text-sm font-medium">Keyboard shortcuts</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                keymap.resetAll();
                setConflictMsg(null);
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
              title="Reset all to defaults"
            >
              reset all
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
              title="Close"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-border/60 bg-muted/30 px-4 py-2 text-[11px] leading-snug text-muted-foreground">
          Hold{" "}
          <kbd className="inline-flex h-4 items-center rounded border border-border bg-background px-1 font-mono text-[10px] text-foreground">
            {platform === "mac" ? "⌥" : "Alt"}
          </kbd>{" "}
          to reveal inline shortcut hints next to buttons. The full list lives
          here.
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {groups.map(([group, defs]) => (
            <div key={group} className="mb-4 last:mb-0">
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {group}
              </div>
              <div className="flex flex-col divide-y divide-border/50">
                {defs.map((def) => (
                  <ShortcutRow
                    key={def.id}
                    def={def}
                    keymap={keymap}
                    platform={platform}
                    capturing={captureFor === def.id}
                    onCapture={() => {
                      setConflictMsg(null);
                      setCaptureFor(def.id);
                    }}
                    onCancelCapture={() => setCaptureFor(null)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">
            {captureFor
              ? "Press new shortcut… (Esc to cancel)"
              : conflictMsg ?? "Click a binding to change it"}
          </span>
          <span className="shrink-0">{platform === "mac" ? "⌘/⌥/⇧ + key" : "Ctrl/Alt/Shift + key"}</span>
        </div>
      </div>
    </div>
  );
}

type RowProps = {
  def: ShortcutDef;
  keymap: ReturnType<typeof useKeymap>;
  platform: Platform;
  capturing: boolean;
  onCapture: () => void;
  onCancelCapture: () => void;
};

function ShortcutRow({
  def,
  keymap,
  platform,
  capturing,
  onCapture,
  onCancelCapture,
}: RowProps) {
  const chords = keymap.getChords(def.id);
  const overridden = keymap.isOverridden(def.id);

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1 truncate text-[13px]">{def.label}</div>

      <div className="flex shrink-0 items-center gap-1.5">
        {capturing ? (
          <button
            type="button"
            onClick={onCancelCapture}
            className="inline-flex h-6 items-center rounded border border-dashed border-primary/60 bg-primary/5 px-2 text-[11px] text-primary"
          >
            press keys…
          </button>
        ) : chords.length === 0 ? (
          <button
            type="button"
            onClick={onCapture}
            className="inline-flex h-6 items-center rounded border border-dashed border-border px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            unbound · set
          </button>
        ) : (
          <button
            type="button"
            onClick={onCapture}
            title="Click to change"
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded border border-border bg-muted/50 px-1.5 hover:border-primary/60",
            )}
          >
            {chords.flatMap((c, ci) => {
              const parts = formatChord(c, platform);
              return parts.map((p, pi) => (
                <span
                  key={`${ci}-${pi}`}
                  className="font-mono text-[11px] leading-none text-foreground/80"
                >
                  {p}
                </span>
              ));
            })}
          </button>
        )}

        <button
          type="button"
          onClick={() => keymap.resetChord(def.id)}
          disabled={!overridden}
          title={overridden ? "Reset to default" : "Default binding"}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
            !overridden && "pointer-events-none opacity-20",
          )}
        >
          <ArrowCounterClockwise size={11} weight="bold" />
        </button>
      </div>
    </div>
  );
}
