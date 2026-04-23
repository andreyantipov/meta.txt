import { useEffect, useMemo, useState } from "react";
import { Files, SidebarSimple } from "@phosphor-icons/react";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { FileTree } from "@/components/file-tree";
import { Outline } from "@/components/outline";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useOutline } from "@/lib/outlines";
import type { DocRef, RootEntry } from "@/lib/api";
import { subscribe } from "@/lib/events";

type ScanState = {
  roots: Array<{
    name: string;
    path: string;
    count: number;
    currentFile: string | null;
    done: boolean;
  }>;
};

type Props = {
  roots: RootEntry[];
  active: DocRef | null;
  loading: boolean;
  onSelect: (ref: DocRef) => void;
  onClose: () => void;
};

export function Sidebar({
  roots,
  active,
  loading,
  onSelect,
  onClose,
}: Props) {
  const totalFiles = useMemo(
    () => roots.reduce((s, r) => s + r.files.length, 0),
    [roots],
  );

  const [scan, setScan] = useState<ScanState | null>(null);

  useEffect(() => {
    if (!loading) {
      setScan(null);
      return;
    }
    return subscribe((evt) => {
      if (evt.type === "scan:start") {
        setScan({
          roots: evt.roots.map((r) => ({
            name: r.name,
            path: r.path,
            count: 0,
            currentFile: null,
            done: false,
          })),
        });
      } else if (evt.type === "scan:file") {
        setScan((s) => {
          if (!s) return s;
          return {
            roots: s.roots.map((r) =>
              r.name === evt.root
                ? { ...r, count: evt.count, currentFile: evt.path }
                : r,
            ),
          };
        });
      } else if (evt.type === "scan:root-done") {
        setScan((s) => {
          if (!s) return s;
          return {
            roots: s.roots.map((r) =>
              r.name === evt.root
                ? { ...r, count: evt.total, done: true, currentFile: null }
                : r,
            ),
          };
        });
      }
    });
  }, [loading]);

  return (
    <aside className="flex h-full min-w-0 flex-col bg-background text-foreground">
      <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-border bg-background px-3 text-xs">
        <span className="font-medium text-foreground/80">Files</span>
        <button
          type="button"
          onClick={onClose}
          title="Collapse sidebar (⌘B)"
          className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <SidebarSimple className="size-3.5" />
        </button>
      </div>

      {loading ? (
        <ScanProgress scan={scan} rootCount={roots.length} />
      ) : totalFiles === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <Files
            size={36}
            weight="duotone"
            className="text-muted-foreground/50"
          />
          <div className="text-sm text-muted-foreground">
            No documents found
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            supports .md, .mdx, .txt, .html
          </div>
        </div>
      ) : (
        <SidebarBody roots={roots} active={active} onSelect={onSelect} />
      )}
    </aside>
  );
}

type BodyProps = {
  roots: RootEntry[];
  active: DocRef | null;
  onSelect: (ref: DocRef) => void;
};

function SidebarBody({ roots, active, onSelect }: BodyProps) {
  const headings = useOutline(active);
  const hasOutline = !!active && headings.length > 0;

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "meta.txt:sidebar-panels",
    storage: typeof localStorage !== "undefined" ? localStorage : undefined,
    panelIds: ["files", "outline"],
  });

  const outlineRef = usePanelRef();
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);

  const syncCollapsed = () => {
    const p = outlineRef.current;
    if (!p) return;
    setOutlineCollapsed(p.isCollapsed());
  };

  const toggleOutline = () => {
    const p = outlineRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
    queueMicrotask(syncCollapsed);
  };

  if (!hasOutline) {
    return (
      <nav className="min-h-0 flex-1">
        <FileTree roots={roots} active={active} onSelect={onSelect} />
      </nav>
    );
  }

  return (
    <ResizablePanelGroup
      orientation="vertical"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="min-h-0 flex-1"
    >
      <ResizablePanel id="files" defaultSize={65} minSize={20}>
        <nav className="h-full min-h-0">
          <FileTree roots={roots} active={active} onSelect={onSelect} />
        </nav>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        id="outline"
        panelRef={outlineRef}
        collapsible
        collapsedSize="42px"
        defaultSize={35}
        minSize={15}
        onResize={syncCollapsed}
      >
        <div className="flex h-full min-h-0 flex-col">
          <Outline
            active={active}
            expanded={!outlineCollapsed}
            onToggle={toggleOutline}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function ScanProgress({
  scan,
  rootCount,
}: {
  scan: ScanState | null;
  rootCount: number;
}) {
  const totalFound =
    scan?.roots.reduce((s, r) => s + r.count, 0) ?? 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="flex flex-col items-center gap-0.5">
        <div className="text-sm text-muted-foreground">
          Scanning documents…
        </div>
        {totalFound > 0 && (
          <div className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
            {totalFound.toLocaleString()}{" "}
            {totalFound === 1 ? "file" : "files"} found
          </div>
        )}
      </div>

      {scan && scan.roots.length > 0 && (
        <div className="flex w-full max-w-full flex-col gap-1 px-1">
          {scan.roots.map((r) => (
            <div
              key={r.name}
              className="flex min-w-0 flex-col gap-0.5 rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-left"
            >
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-medium">{r.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {r.done ? (
                    <span className="text-emerald-500/80">
                      {r.count.toLocaleString()} ✓
                    </span>
                  ) : (
                    r.count.toLocaleString()
                  )}
                </span>
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground/70">
                {r.done
                  ? "done"
                  : r.currentFile
                    ? `…/${r.currentFile.slice(-40)}`
                    : "starting…"}
              </div>
            </div>
          ))}
        </div>
      )}

      {!scan && rootCount > 0 && (
        <div className="text-[11px] text-muted-foreground/70">
          {rootCount} {rootCount === 1 ? "root" : "roots"}
        </div>
      )}
    </div>
  );
}
