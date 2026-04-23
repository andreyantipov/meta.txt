import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { TreeGuides } from "@/lib/tree-guides";
import { cn } from "@/lib/utils";

// Shared row geometry for the sidebar tree views (FileTree + Outline).
// One indicator column followed by content. Same paddings, same hover/active,
// same tree guides. Differences are expressed via the `indicator` slot.

export const TREE_BASE_PAD = 14;
export const TREE_INDENT = 14;
export const TREE_CHEV_COL = 14;
export const TREE_CHEV_HALF = 7;
// Stub reaches the indicator column's center so it visually meets whatever
// marker sits there (caret, folder icon, or a leaf dot).
export const TREE_STUB = TREE_INDENT - 1;

type Props = {
  depth: number;
  lastMask: boolean[];
  hasOpenChildren: boolean;
  indicator: ReactNode;
  active?: boolean;
  title?: string;
  className?: string;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
};

export function TreeRow({
  depth,
  lastMask,
  hasOpenChildren,
  indicator,
  active,
  title,
  className,
  onClick,
  children,
}: Props) {
  const style: CSSProperties = {
    paddingLeft: TREE_BASE_PAD + depth * TREE_INDENT,
  };

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={title}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e as unknown as MouseEvent<HTMLDivElement>);
              }
            }
          : undefined
      }
      className={cn(
        "relative flex h-6 items-center gap-1 pr-2 text-left text-[12px] leading-none",
        "text-muted-foreground",
        onClick && "cursor-pointer hover:bg-foreground/5 hover:text-foreground",
        active && "bg-foreground/10 text-foreground",
        className,
      )}
      style={style}
    >
      <TreeGuides
        depth={depth}
        lastMask={lastMask}
        hasOpenChildren={hasOpenChildren}
        basePad={TREE_BASE_PAD}
        indent={TREE_INDENT}
        chevHalf={TREE_CHEV_HALF}
        stubWidth={TREE_STUB}
      />
      <span
        className="relative flex shrink-0 items-center justify-center"
        style={{ width: TREE_CHEV_COL }}
      >
        {indicator}
      </span>
      <span className="truncate">{children}</span>
    </div>
  );
}

// A subtle 4px square placed where an indicator would be — used by Outline
// leaves so the horizontal stub visually terminates at a marker.
export function TreeLeafDot() {
  return (
    <span
      aria-hidden
      className="size-1 rounded-full bg-foreground/30"
    />
  );
}
