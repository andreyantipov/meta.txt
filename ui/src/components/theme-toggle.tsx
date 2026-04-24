import { useEffect, useRef, useState } from "react";
import { CaretUp, Check, Monitor, Moon, Sun } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeMode } from "@/lib/theme";

const OPTIONS: Array<{ mode: ThemeMode; label: string }> = [
  { mode: "system", label: "Auto" },
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
];

function Icon({ mode, className }: { mode: ThemeMode; className?: string }) {
  if (mode === "light") return <Sun className={className} weight="bold" />;
  if (mode === "dark") return <Moon className={className} weight="bold" />;
  return <Monitor className={className} weight="bold" />;
}

function labelOf(mode: ThemeMode): string {
  return OPTIONS.find((o) => o.mode === mode)?.label ?? "Auto";
}

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Theme: ${labelOf(mode)}`}
        className={cn(
          "flex h-4 shrink-0 items-center gap-1 self-center rounded bg-foreground/5 px-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground",
          open && "bg-foreground/10 text-foreground",
        )}
      >
        <Icon mode={mode} className="size-3" />
        <span className="text-[11px] leading-none">{labelOf(mode)}</span>
        <CaretUp
          className={cn(
            "size-2.5 transition-transform",
            open ? "rotate-0" : "rotate-180",
          )}
          weight="bold"
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+4px)] right-0 z-50 w-32 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          {OPTIONS.map((opt) => {
            const active = opt.mode === mode;
            return (
              <button
                key={opt.mode}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setMode(opt.mode);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                  active && "text-foreground",
                )}
              >
                <Icon mode={opt.mode} className="size-3.5 shrink-0" />
                <span className="flex-1">{opt.label}</span>
                {active && <Check className="size-3 shrink-0" weight="bold" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
