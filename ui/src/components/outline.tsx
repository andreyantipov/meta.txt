import { memo, useEffect, useMemo, useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { DocRef } from "@/lib/api";
import type { Heading } from "@/lib/toc";
import { useOutline } from "@/lib/outlines";
import { TreeGuides } from "@/lib/tree-guides";
import { cn } from "@/lib/utils";

type OutlineNode = {
  heading: Heading;
  children: OutlineNode[];
};

function buildTree(headings: Heading[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const h of headings) {
    const node: OutlineNode = { heading: h, children: [] };
    while (
      stack.length > 0 &&
      stack[stack.length - 1]!.heading.depth >= h.depth
    ) {
      stack.pop();
    }
    if (stack.length > 0) {
      stack[stack.length - 1]!.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  }
  return roots;
}

const BASE_PAD = 8;
const INDENT = 14;
const CHEV_COL = 14;
const CHEV_HALF = 7;
const STUB = INDENT - CHEV_HALF;

type Props = {
  active: DocRef | null;
  expanded: boolean;
  onToggle: () => void;
};

export function Outline({ active, expanded, onToggle }: Props) {
  const headings = useOutline(active);
  const tree = useMemo(() => buildTree(headings), [headings]);

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedIds(new Set());
  }, [active?.root, active?.path]);

  if (!active || headings.length === 0) return null;

  const toggleNode = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        title={expanded ? "Collapse outline" : "Expand outline"}
        className="flex h-[42px] shrink-0 items-center gap-1.5 border-b border-border bg-background px-3 text-xs font-medium text-foreground/80 hover:bg-muted"
      >
        {expanded ? (
          <CaretDown className="size-3 shrink-0" weight="bold" />
        ) : (
          <CaretRight className="size-3 shrink-0" weight="bold" />
        )}
        <span>Outline</span>
        <span className="ml-auto tabular-nums text-muted-foreground/60">
          {headings.length}
        </span>
      </button>
      {expanded && (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <ul>
            {tree.map((node, i) => (
              <TreeNodeView
                key={`${node.heading.id}-${i}`}
                node={node}
                depth={0}
                collapsedIds={collapsedIds}
                onToggleNode={toggleNode}
                onSelect={scrollTo}
              />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

type NodeProps = {
  node: OutlineNode;
  depth: number;
  collapsedIds: Set<string>;
  onToggleNode: (id: string) => void;
  onSelect: (id: string) => void;
};

const TreeNodeView = memo(function TreeNodeView({
  node,
  depth,
  collapsedIds,
  onToggleNode,
  onSelect,
}: NodeProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.heading.id);
  const padLeft = BASE_PAD + depth * INDENT;

  return (
    <li>
      <div
        className={cn(
          "group/row relative flex h-6 cursor-pointer items-center gap-1 pr-2 text-[12px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        style={{ paddingLeft: `${padLeft}px` }}
        onClick={() => onSelect(node.heading.id)}
      >
        <TreeGuides
          depth={depth}
          basePad={BASE_PAD}
          indent={INDENT}
          chevHalf={CHEV_HALF}
          stubWidth={STUB - 1}
        />
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleNode(node.heading.id);
            }}
            className="flex size-3.5 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground"
            style={{ width: `${CHEV_COL}px` }}
          >
            {isCollapsed ? (
              <CaretRight className="size-2.5" weight="bold" />
            ) : (
              <CaretDown className="size-2.5" weight="bold" />
            )}
          </button>
        ) : (
          <span
            className="shrink-0"
            style={{ width: `${CHEV_COL}px` }}
            aria-hidden
          />
        )}
        <span className="truncate" title={node.heading.text}>
          {node.heading.text}
        </span>
      </div>
      {hasChildren && !isCollapsed && (
        <ul>
          {node.children.map((child, i) => (
            <TreeNodeView
              key={`${child.heading.id}-${i}`}
              node={child}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              onToggleNode={onToggleNode}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
});
