import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  left?: ReactNode;
  leftOpen?: boolean;
  center: ReactNode;
  right?: ReactNode;
  rightOpen?: boolean;
};

const STORAGE_KEY = "meta.txt:layout";

type Sizes = { left: number; right: number };

const DEFAULT_SIZES: Sizes = { left: 288, right: 360 };
const LIMITS = {
  left: { min: 200, max: 480 },
  right: { min: 280, max: 640 },
};

function loadSizes(): Sizes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SIZES;
    const parsed = JSON.parse(raw);
    return {
      left: clamp(Number(parsed.left) || DEFAULT_SIZES.left, LIMITS.left),
      right: clamp(Number(parsed.right) || DEFAULT_SIZES.right, LIMITS.right),
    };
  } catch {
    return DEFAULT_SIZES;
  }
}

function clamp(v: number, l: { min: number; max: number }) {
  return Math.max(l.min, Math.min(l.max, v));
}

export function Layout({
  left,
  leftOpen = true,
  center,
  right,
  rightOpen = true,
}: Props) {
  const [sizes, setSizes] = useState<Sizes>(() => loadSizes());
  const dragRef = useRef<null | { side: "left" | "right"; startX: number; startSize: number }>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
    } catch {}
  }, [sizes]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const delta = e.clientX - d.startX;
      if (d.side === "left") {
        const next = clamp(d.startSize + delta, LIMITS.left);
        setSizes((s) => ({ ...s, left: next }));
      } else {
        const next = clamp(d.startSize - delta, LIMITS.right);
        setSizes((s) => ({ ...s, right: next }));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = useCallback(
    (side: "left" | "right") => (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = {
        side,
        startX: e.clientX,
        startSize: side === "left" ? sizes.left : sizes.right,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [sizes.left, sizes.right],
  );

  return (
    <div className="flex h-full w-full overflow-hidden">
      {left && (
        <>
          <div
            style={{ width: sizes.left }}
            className={cn("shrink-0", !leftOpen && "hidden")}
          >
            {left}
          </div>
          {leftOpen && <Handle onMouseDown={startDrag("left")} />}
        </>
      )}
      <div className="min-w-0 flex-1">{center}</div>
      {right && (
        <>
          {rightOpen && <Handle onMouseDown={startDrag("right")} />}
          <div
            style={{ width: sizes.right }}
            className={cn("shrink-0", !rightOpen && "hidden")}
          >
            {right}
          </div>
        </>
      )}
    </div>
  );
}

function Handle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "group w-px shrink-0 cursor-col-resize bg-border",
        "hover:bg-ring active:bg-ring",
      )}
    >
      <div className="h-full w-1 -translate-x-0.5" />
    </div>
  );
}
