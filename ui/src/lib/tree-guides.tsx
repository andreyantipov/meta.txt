import type { CSSProperties, ReactNode } from "react";

const DOT_COLOR = "currentColor";
const DOT = 1;
const GAP = 2;

export const GUIDE_VERT_STYLE: CSSProperties = {
  backgroundImage: `linear-gradient(to bottom, ${DOT_COLOR} ${DOT}px, transparent ${DOT}px)`,
  backgroundSize: `1px ${DOT + GAP}px`,
  backgroundRepeat: "repeat-y",
};

export const GUIDE_HORIZ_STYLE: CSSProperties = {
  backgroundImage: `linear-gradient(to right, ${DOT_COLOR} ${DOT}px, transparent ${DOT}px)`,
  backgroundSize: `${DOT + GAP}px 1px`,
  backgroundRepeat: "repeat-x",
};

type Props = {
  depth: number;
  basePad: number;
  indent: number;
  chevHalf: number;
  stubWidth: number;
};

export function TreeGuides({
  depth,
  basePad,
  indent,
  chevHalf,
  stubWidth,
}: Props) {
  if (depth === 0) return null;
  const nodes: ReactNode[] = [];
  for (let i = 0; i < depth; i++) {
    const x = basePad + i * indent + chevHalf;
    const isLast = i === depth - 1;
    nodes.push(
      <span
        key={`v-${i}`}
        aria-hidden
        className="pointer-events-none absolute top-0 h-full w-px text-foreground/20"
        style={{ ...GUIDE_VERT_STYLE, left: x }}
      />,
    );
    if (isLast && stubWidth > 0) {
      nodes.push(
        <span
          key={`h-${i}`}
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-px text-foreground/20"
          style={{ ...GUIDE_HORIZ_STYLE, left: x + 1, width: stubWidth }}
        />,
      );
    }
  }
  return <>{nodes}</>;
}
