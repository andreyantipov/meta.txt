import type { CSSProperties, ReactNode } from "react";

const DOT_COLOR = "currentColor";
const DOT = 1;
const GAP = 3;
const PERIOD = DOT + GAP;

export const GUIDE_VERT_STYLE: CSSProperties = {
  backgroundImage: `linear-gradient(to bottom, ${DOT_COLOR} ${DOT}px, transparent ${DOT}px)`,
  backgroundSize: `1px ${PERIOD}px`,
  backgroundRepeat: "repeat-y",
};

export const GUIDE_HORIZ_STYLE: CSSProperties = {
  backgroundImage: `linear-gradient(to right, ${DOT_COLOR} ${DOT}px, transparent ${DOT}px)`,
  backgroundSize: `${PERIOD}px 1px`,
  backgroundRepeat: "repeat-x",
};

type Props = {
  depth: number;
  // length = depth + 1. lastMask[i] = true if the ancestor (or self at i = depth)
  // at depth i is the last sibling at its level.
  lastMask: boolean[];
  // True if this row has children rendered below it.
  hasOpenChildren: boolean;
  basePad: number;
  indent: number;
  chevHalf: number;
  stubWidth: number;
};

const GUIDE_CLASS =
  "pointer-events-none absolute w-px text-foreground/[0.17]";

export function TreeGuides({
  depth,
  lastMask,
  hasOpenChildren,
  basePad,
  indent,
  chevHalf,
  stubWidth,
}: Props) {
  const nodes: ReactNode[] = [];

  for (let c = 0; c < depth; c++) {
    const x = basePad + c * indent + chevHalf;
    const isOwn = c === depth - 1;
    const closedHere = lastMask[c + 1];

    // Ancestor column whose branch has already ended — skip entirely.
    if (!isOwn && closedHere) continue;

    // Own column on a last sibling — draw only top half, stub takes over.
    const halfOnly = isOwn && closedHere;

    nodes.push(
      <span
        key={`v-${c}`}
        aria-hidden
        className={GUIDE_CLASS}
        style={{
          ...GUIDE_VERT_STYLE,
          left: x,
          top: 0,
          // halfOnly: extend a hair past 50% so the dot at the row's
          // mid-line renders and meets the horizontal stub cleanly.
          height: halfOnly ? "calc(50% + 1px)" : "100%",
        }}
      />,
    );
  }

  // Horizontal T-stub at this row's middle, reaching into the label.
  if (depth > 0 && stubWidth > 0) {
    const x = basePad + (depth - 1) * indent + chevHalf;
    nodes.push(
      <span
        key="h"
        aria-hidden
        className="pointer-events-none absolute top-1/2 h-px text-foreground/[0.17]"
        style={{ ...GUIDE_HORIZ_STYLE, left: x + 1, width: stubWidth }}
      />,
    );
  }

  // Parent → first child connector: bottom half of this row at the children's column.
  if (hasOpenChildren) {
    const x = basePad + depth * indent + chevHalf;
    nodes.push(
      <span
        key="p"
        aria-hidden
        className={GUIDE_CLASS}
        style={{
          ...GUIDE_VERT_STYLE,
          left: x,
          top: "50%",
          height: "50%",
        }}
      />,
    );
  }

  return <>{nodes}</>;
}
