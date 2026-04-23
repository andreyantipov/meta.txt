import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  for (const file of files) {
    const parts = file.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");
      let child = node.children.find((c) => c.name === name);
      if (!child) {
        child = { name, fullPath, isDir: !isLast, children: [] };
        node.children.push(child);
      }
      node = child;
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
  const out: FlatRow[] = [];
  for (const { root, tree } of trees) {
    const rOpen = rootOpen[root.name] ?? true;
    if (multi) {
      out.push({
        kind: "root",
        key: `r:${root.name}`,
        rootName: root.name,
        rootPath: root.path,
        open: rOpen,
      });
      if (!rOpen) continue;
    }
    if (tree.length === 0) {
      out.push({ kind: "empty", key: `e:${root.name}`, rootName: root.name });
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
          out.push({
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
          out.push({
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
  return out;
}

function ancestorPaths(path: string): string[] {
  const parts = path.split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

const STORAGE_KEY = "meta.txt:expanded";

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

  useEffect(() => {
    saveExpanded(expanded);
  }, [expanded]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}:roots`, JSON.stringify(rootOpen));
    } catch {}
  }, [rootOpen]);

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
  }, [active?.root, active?.path, rowIndexByFile, virtualizer]);

  const toggleDir = useCallback((rootName: string, path: string) => {
    setExpanded((prev) => {
      const cur = new Set(prev[rootName] ?? []);
      if (cur.has(path)) cur.delete(path);
      else cur.add(path);
      return { ...prev, [rootName]: cur };
    });
  }, []);

  const toggleRoot = useCallback((rootName: string) => {
    setRootOpen((r) => ({ ...r, [rootName]: !(r[rootName] ?? true) }));
  }, []);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto py-1">
      <div
        className="relative"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((v) => {
          const row = rows[v.index]!;
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
                onToggleRoot={toggleRoot}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type RowProps = {
  row: FlatRow;
  isActive: boolean;
  onSelect: (ref: DocRef) => void;
  onToggleDir: (root: string, path: string) => void;
  onToggleRoot: (root: string) => void;
};

const Row = memo(function Row({
  row,
  isActive,
  onSelect,
  onToggleDir,
  onToggleRoot,
}: RowProps) {
  if (row.kind === "root") {
    return (
      <button
        type="button"
        onClick={() => onToggleRoot(row.rootName)}
        title={row.rootPath}
        className="flex h-full w-full items-center gap-1 pr-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        style={{ paddingLeft: TREE_BASE_PAD }}
      >
        <span
          className="flex shrink-0 items-center justify-center"
          style={{ width: TREE_CHEV_COL }}
        >
          {row.open ? (
            <CaretDown className="size-2.5" weight="bold" />
          ) : (
            <CaretRight className="size-2.5" weight="bold" />
          )}
        </span>
        <span className="truncate">{row.rootName}</span>
      </button>
    );
  }

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

