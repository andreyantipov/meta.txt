import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CaretDown,
  CaretRight,
  FileText,
  Folder,
  FolderOpen,
} from "@phosphor-icons/react";
import {
  TreeRow,
  TREE_BASE_PAD,
  TREE_CHEV_COL,
} from "@/components/tree-row";
import type { DocRef, RootEntry } from "@/lib/api";
import { rootColor } from "@/lib/root-color";
import { cn } from "@/lib/utils";

type TreeNode = {
  name: string;
  fullPath: string;
  isDir: boolean;
  children: TreeNode[];
};

const ROW_HEIGHT = 24;

type FlatRow =
  | {
      kind: "root";
      key: string;
      rootName: string;
      rootPath: string;
      open: boolean;
    }
  | {
      kind: "dir";
      key: string;
      rootName: string;
      depth: number;
      path: string;
      name: string;
      open: boolean;
      lastMask: boolean[];
      hasOpenChildren: boolean;
    }
  | {
      kind: "file";
      key: string;
      rootName: string;
      depth: number;
      path: string;
      name: string;
      lastMask: boolean[];
    }
  | {
      kind: "empty";
      key: string;
      rootName: string;
    };

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode = { name: "", fullPath: "", isDir: true, children: [] };
  const childIndex = new WeakMap<TreeNode, Map<string, TreeNode>>();
  childIndex.set(root, new Map());

  for (const file of files) {
    let node = root;
    let cursor = 0;
    const len = file.length;
    while (cursor <= len) {
      const nextSlash = file.indexOf("/", cursor);
      const end = nextSlash === -1 ? len : nextSlash;
      const name = file.slice(cursor, end);
      const isLast = nextSlash === -1;
      const fullPath = isLast ? file : file.slice(0, end);
      const idx = childIndex.get(node)!;
      let child = idx.get(name);
      if (!child) {
        child = { name, fullPath, isDir: !isLast, children: [] };
        idx.set(name, child);
        node.children.push(child);
        if (!isLast) childIndex.set(child, new Map());
      }
      node = child;
      if (isLast) break;
      cursor = end + 1;
    }
  }

  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of n.children) sort(c);
  };
  sort(root);
  return root.children;
}

type BuiltTree = { root: RootEntry; tree: TreeNode[] };

function flattenBuilt(
  trees: BuiltTree[],
  rootOpen: Record<string, boolean>,
  expanded: Record<string, Set<string>>,
  multi: boolean,
): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const { root, tree } of trees) {
    const rOpen = rootOpen[root.name] ?? true;
    if (multi) {
      rows.push({
        kind: "root",
        key: `r:${root.name}`,
        rootName: root.name,
        rootPath: root.path,
        open: rOpen,
      });
      if (!rOpen) continue;
    } else if (!rOpen) {
      continue;
    }
    if (tree.length === 0) {
      rows.push({ kind: "empty", key: `e:${root.name}`, rootName: root.name });
      continue;
    }
    const rootExp = expanded[root.name] ?? new Set<string>();
    const walk = (
      nodes: TreeNode[],
      depth: number,
      parentMask: boolean[],
    ) => {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        const isLast = i === nodes.length - 1;
        const mask = [...parentMask, isLast];
        if (n.isDir) {
          const dOpen = rootExp.has(n.fullPath);
          rows.push({
            kind: "dir",
            key: `d:${root.name}:${n.fullPath}`,
            rootName: root.name,
            depth,
            path: n.fullPath,
            name: n.name,
            open: dOpen,
            lastMask: mask,
            hasOpenChildren: dOpen && n.children.length > 0,
          });
          if (dOpen) walk(n.children, depth + 1, mask);
        } else {
          rows.push({
            kind: "file",
            key: `f:${root.name}:${n.fullPath}`,
            rootName: root.name,
            depth,
            path: n.fullPath,
            name: n.name,
            lastMask: mask,
          });
        }
      }
    };
    walk(tree, 0, []);
  }
  return rows;
}

function ancestorPaths(path: string): string[] {
  const parts = path.split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

const STORAGE_KEY = "meta.txt:expanded";
const SCROLL_KEY = "meta.txt:file-tree-scroll";

function loadExpanded(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveExpanded(state: Record<string, Set<string>>) {
  try {
    const obj: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(state)) obj[k] = [...v];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

type Props = {
  roots: RootEntry[];
  active: DocRef | null;
  onSelect: (ref: DocRef) => void;
};

export function FileTree({ roots, active, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Record<string, Set<string>>>(() => {
    const obj = loadExpanded();
    const out: Record<string, Set<string>> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = new Set(v);
    return out;
  });

  const [rootOpen, setRootOpen] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}:roots`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const saveScrollTimerRef = useRef<number | null>(null);
  const scrollRestoredRef = useRef(false);

  useEffect(() => {
    saveExpanded(expanded);
  }, [expanded]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}:roots`, JSON.stringify(rootOpen));
    } catch {}
  }, [rootOpen]);

  // When the user opens a file, open its root group and expand ancestor dirs.
  useEffect(() => {
    if (!active) return;
    setRootOpen((r) =>
      r[active.root] === false ? { ...r, [active.root]: true } : r,
    );
    const ancestors = ancestorPaths(active.path);
    if (ancestors.length === 0) return;
    setExpanded((prev) => {
      const cur = prev[active.root] ?? new Set<string>();
      let changed = false;
      const next = new Set(cur);
      for (const a of ancestors)
        if (!next.has(a)) {
          next.add(a);
          changed = true;
        }
      if (!changed) return prev;
      return { ...prev, [active.root]: next };
    });
  }, [active?.root, active?.path]);

  const multi = roots.length > 1;

  const builtTrees = useMemo<BuiltTree[]>(
    () => roots.map((r) => ({ root: r, tree: buildTree(r.files) })),
    [roots],
  );

  const rows = useMemo(
    () => flattenBuilt(builtTrees, rootOpen, expanded, multi),
    [builtTrees, rootOpen, expanded, multi],
  );

  const fileCountByRoot = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of roots) m.set(r.name, r.files.length);
    return m;
  }, [roots]);

  const sections = useMemo(() => {
    if (!multi) return [];
    const out: Array<{
      name: string;
      path: string;
      open: boolean;
      rowIndex: number;
      contentSpan: number;
      fileCount: number;
    }> = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (r.kind === "root") {
        out.push({
          name: r.rootName,
          path: r.rootPath,
          open: r.open,
          rowIndex: i,
          contentSpan: 0,
          fileCount: fileCountByRoot.get(r.rootName) ?? 0,
        });
      }
    }
    for (let i = 0; i < out.length; i++) {
      const nextStart =
        out[i + 1]?.rowIndex ?? rows.length;
      out[i]!.contentSpan = nextStart - out[i]!.rowIndex - 1;
    }
    return out;
  }, [rows, multi, fileCountByRoot]);

  const rowIndexByFile = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (r.kind === "file") m.set(`${r.rootName}:${r.path}`, i);
    }
    return m;
  }, [rows]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  useEffect(() => {
    if (!active) return;
    const idx = rowIndexByFile.get(`${active.root}:${active.path}`);
    if (idx !== undefined) virtualizer.scrollToIndex(idx, { align: "auto" });
    // Deliberately omit rowIndexByFile/virtualizer: autoscroll only on active
    // file change, not on every tree rebuild (folder toggles must not jump).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.root, active?.path]);

  const toggleDir = useCallback((rootName: string, path: string) => {
    setExpanded((prev) => {
      const cur = new Set(prev[rootName] ?? []);
      if (cur.has(path)) cur.delete(path);
      else cur.add(path);
      return { ...prev, [rootName]: cur };
    });
  }, []);

  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const handleRootClick = useCallback(
    (rootName: string) => {
      const isOpen = rootOpen[rootName] ?? true;
      if (isOpen) {
        setRootOpen((r) => ({ ...r, [rootName]: false }));
        return;
      }
      setRootOpen((r) => ({ ...r, [rootName]: true }));
      const doScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const secs = sectionsRef.current;
        const idx = secs.findIndex((s) => s.name === rootName);
        if (idx < 0) return;
        const section = secs[idx]!;
        const target = section.rowIndex * ROW_HEIGHT - idx * ROW_HEIGHT;
        el.scrollTop = Math.max(0, target);
      };
      requestAnimationFrame(() => requestAnimationFrame(doScroll));
    },
    [rootOpen],
  );

  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollRef.current;
      if (!el) return;
      const st = el.scrollTop;
      if (saveScrollTimerRef.current)
        window.clearTimeout(saveScrollTimerRef.current);
      saveScrollTimerRef.current = window.setTimeout(() => {
        try {
          localStorage.setItem(SCROLL_KEY, String(st));
        } catch {}
      }, 200);
    });
  }, []);

  useEffect(() => {
    if (scrollRestoredRef.current || rows.length === 0) return;
    scrollRestoredRef.current = true;
    const saved = Number(localStorage.getItem(SCROLL_KEY) ?? "0");
    if (!saved || !scrollRef.current) return;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = saved;
    });
  }, [rows.length]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (saveScrollTimerRef.current)
        window.clearTimeout(saveScrollTimerRef.current);
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div
          className="relative"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {multi &&
            sections.map((s, i) => (
              <Fragment key={s.name}>
                <div
                  className="sticky z-10 bg-muted shadow-[inset_0_-1px_0_0_var(--border)]"
                  style={{
                    top: i * ROW_HEIGHT,
                    bottom: (sections.length - 1 - i) * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                  }}
                >
                  <RootGroupHeader
                    rootName={s.name}
                    rootPath={s.path}
                    fileCount={s.fileCount}
                    open={s.open}
                    onClick={() => handleRootClick(s.name)}
                  />
                </div>
                {s.contentSpan > 0 && (
                  <div style={{ height: s.contentSpan * ROW_HEIGHT }} />
                )}
              </Fragment>
            ))}
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index]!;
            if (row.kind === "root") return null;
            const isActive =
              row.kind === "file" &&
              active?.root === row.rootName &&
              active?.path === row.path;
            return (
              <div
                key={row.key}
                className="absolute inset-x-0 top-0"
                style={{
                  height: ROW_HEIGHT,
                  transform: `translateY(${v.start}px)`,
                }}
              >
                <Row
                  row={row}
                  isActive={isActive}
                  onSelect={onSelect}
                  onToggleDir={toggleDir}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type RowProps = {
  row: FlatRow;
  isActive: boolean;
  onSelect: (ref: DocRef) => void;
  onToggleDir: (root: string, path: string) => void;
};

function RootGroupHeader({
  rootName,
  rootPath,
  fileCount,
  open,
  onClick,
}: {
  rootName: string;
  rootPath: string;
  fileCount: number;
  open: boolean;
  onClick: () => void;
}) {
  const color = rootColor(rootName);
  return (
    <button
      type="button"
      onClick={onClick}
      title={rootPath}
      aria-expanded={open}
      className="flex h-full w-full cursor-pointer items-center gap-1.5 pr-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      style={{ paddingLeft: TREE_BASE_PAD }}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center"
        style={{ width: TREE_CHEV_COL }}
      >
        {open ? (
          <CaretDown className="size-2.5" weight="bold" />
        ) : (
          <CaretRight className="size-2.5" weight="bold" />
        )}
      </span>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="min-w-0 flex-1 truncate">{rootName}</span>
      {fileCount > 0 && (
        <span className="shrink-0 text-[10px] font-normal tabular-nums tracking-normal text-muted-foreground/70">
          {fileCount.toLocaleString()}
        </span>
      )}
    </button>
  );
}

const Row = memo(function Row({
  row,
  isActive,
  onSelect,
  onToggleDir,
}: RowProps) {
  if (row.kind === "root") return null;

  if (row.kind === "empty") {
    return (
      <div
        className="flex h-full items-center text-[12px] italic text-muted-foreground/70"
        style={{ paddingLeft: TREE_BASE_PAD + TREE_CHEV_COL + 4 }}
      >
        empty
      </div>
    );
  }

  if (row.kind === "dir") {
    return (
      <TreeRow
        depth={row.depth}
        lastMask={row.lastMask}
        hasOpenChildren={row.hasOpenChildren}
        indicator={
          row.open ? (
            <FolderOpen className="size-3.5" weight="duotone" />
          ) : (
            <Folder className="size-3.5" weight="duotone" />
          )
        }
        onClick={() => onToggleDir(row.rootName, row.path)}
      >
        {row.name}
      </TreeRow>
    );
  }

  return (
    <TreeRow
      depth={row.depth}
      lastMask={row.lastMask}
      hasOpenChildren={false}
      indicator={<FileText className="size-3.5 opacity-90" weight="duotone" />}
      active={isActive}
      title={row.path}
      onClick={() => onSelect({ root: row.rootName, path: row.path })}
    >
      {row.name}
    </TreeRow>
  );
});

