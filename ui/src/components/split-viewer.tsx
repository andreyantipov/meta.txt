import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { FileText, SplitHorizontal } from "@phosphor-icons/react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TabBar, TAB_MIME, type TabDragData } from "@/components/tab-bar";
import { DocContent, type DocStats } from "@/components/doc-content";
import type { DocRef } from "@/lib/api";
import { cn } from "@/lib/utils";

export type PaneState = {
  tabs: DocRef[];
  active: DocRef | null;
  zoom?: number;
};

type Props = {
  panes: PaneState[];
  activePaneIndex: number;
  showRoot: boolean;
  onPaneFocus: (idx: number) => void;
  onTabSelect: (paneIdx: number, ref: DocRef) => void;
  onTabClose: (paneIdx: number, ref: DocRef) => void;
  onSplit: (fromPaneIdx: number) => void;
  onClosePane: (paneIdx: number) => void;
  onTabMove: (
    fromPaneIndex: number,
    toPaneIndex: number,
    ref: DocRef,
    insertIndex: number,
  ) => void;
  onTabDropNewPane: (fromPaneIndex: number, ref: DocRef) => void;
  onStatsChange: (stats: DocStats | null) => void;
};

export function SplitViewer({
  panes,
  activePaneIndex,
  showRoot,
  onPaneFocus,
  onTabSelect,
  onTabClose,
  onSplit,
  onClosePane,
  onTabMove,
  onTabDropNewPane,
  onStatsChange,
}: Props) {
  const canSplit = panes.length < 2;
  const multiPane = panes.length > 1;
  const [draggingTab, setDraggingTab] = useState<TabDragData | null>(null);

  useEffect(() => {
    const onStart = (e: Event) => {
      const ce = e as CustomEvent<TabDragData>;
      setDraggingTab(ce.detail ?? null);
    };
    const onEnd = () => setDraggingTab(null);
    window.addEventListener("meta-tab-drag-start", onStart);
    window.addEventListener("meta-tab-drag-end", onEnd);
    return () => {
      window.removeEventListener("meta-tab-drag-start", onStart);
      window.removeEventListener("meta-tab-drag-end", onEnd);
    };
  }, []);

  const showNewPaneZone =
    canSplit &&
    !!draggingTab &&
    (panes[draggingTab.fromPaneIndex]?.tabs.length ?? 0) > 1;

  if (panes.length === 1) {
    const pane = panes[0]!;
    return (
      <div className="relative flex h-full w-full">
        <div className="min-w-0 flex-1">
          <Pane
            pane={pane}
            paneIndex={0}
            isActive={activePaneIndex === 0}
            isFocused={activePaneIndex === 0}
            multiPane={multiPane}
            showRoot={showRoot}
            canSplit={canSplit}
            onFocus={() => onPaneFocus(0)}
            onTabSelect={(ref) => onTabSelect(0, ref)}
            onTabClose={(ref) => onTabClose(0, ref)}
            onSplit={() => onSplit(0)}
            onClosePane={undefined}
            onTabDrop={(from, ref, insertIdx) =>
              onTabMove(from, 0, ref, insertIdx)
            }
            onStatsChange={onStatsChange}
          />
        </div>
        {showNewPaneZone && (
          <NewPaneDropZone
            onDrop={(from, ref) => {
              onTabDropNewPane(from, ref);
              setDraggingTab(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      id="meta.txt:panes"
      className="h-full w-full"
    >
      {panes.map((pane, i) => (
        <PaneItem
          key={i}
          pane={pane}
          index={i}
          isLast={i === panes.length - 1}
          activeIndex={activePaneIndex}
          multiPane={multiPane}
          showRoot={showRoot}
          canSplit={canSplit}
          onPaneFocus={onPaneFocus}
          onTabSelect={onTabSelect}
          onTabClose={onTabClose}
          onSplit={onSplit}
          onClosePane={onClosePane}
          onTabMove={onTabMove}
          onStatsChange={onStatsChange}
        />
      ))}
    </ResizablePanelGroup>
  );
}

type PaneItemProps = {
  pane: PaneState;
  index: number;
  isLast: boolean;
  activeIndex: number;
  multiPane: boolean;
  showRoot: boolean;
  canSplit: boolean;
  onPaneFocus: (idx: number) => void;
  onTabSelect: (idx: number, ref: DocRef) => void;
  onTabClose: (idx: number, ref: DocRef) => void;
  onSplit: (idx: number) => void;
  onClosePane: (idx: number) => void;
  onTabMove: (
    fromPaneIndex: number,
    toPaneIndex: number,
    ref: DocRef,
    insertIndex: number,
  ) => void;
  onStatsChange: (stats: DocStats | null) => void;
};

function PaneItem({
  pane,
  index,
  isLast,
  activeIndex,
  multiPane,
  showRoot,
  canSplit,
  onPaneFocus,
  onTabSelect,
  onTabClose,
  onSplit,
  onClosePane,
  onTabMove,
  onStatsChange,
}: PaneItemProps) {
  return (
    <>
      <ResizablePanel id={`pane-${index}`} defaultSize={50} minSize={20}>
        <Pane
          pane={pane}
          paneIndex={index}
          isActive={activeIndex === index}
          isFocused={activeIndex === index}
          multiPane={multiPane}
          showRoot={showRoot}
          canSplit={canSplit}
          onFocus={() => onPaneFocus(index)}
          onTabSelect={(ref) => onTabSelect(index, ref)}
          onTabClose={(ref) => onTabClose(index, ref)}
          onSplit={() => onSplit(index)}
          onClosePane={index === 0 ? undefined : () => onClosePane(index)}
          onTabDrop={(from, ref, insertIdx) =>
            onTabMove(from, index, ref, insertIdx)
          }
          onStatsChange={onStatsChange}
        />
      </ResizablePanel>
      {!isLast && <ResizableHandle />}
    </>
  );
}

type PaneProps = {
  pane: PaneState;
  paneIndex: number;
  isActive: boolean;
  isFocused: boolean;
  multiPane: boolean;
  showRoot: boolean;
  canSplit: boolean;
  onFocus: () => void;
  onTabSelect: (ref: DocRef) => void;
  onTabClose: (ref: DocRef) => void;
  onSplit: () => void;
  onClosePane: (() => void) | undefined;
  onTabDrop: (fromPaneIndex: number, ref: DocRef, insertIndex: number) => void;
  onStatsChange: (stats: DocStats | null) => void;
};

function Pane({
  pane,
  paneIndex,
  isActive,
  isFocused,
  multiPane,
  showRoot,
  canSplit,
  onFocus,
  onTabSelect,
  onTabClose,
  onSplit,
  onClosePane,
  onTabDrop,
  onStatsChange,
}: PaneProps) {
  const latestStatsRef = useRef<DocStats | null>(null);
  const onStatsChangeRef = useRef(onStatsChange);
  useEffect(() => {
    onStatsChangeRef.current = onStatsChange;
  }, [onStatsChange]);

  const handleStats = (s: DocStats | null) => {
    latestStatsRef.current = s;
    if (isActive) onStatsChangeRef.current(s);
  };

  useEffect(() => {
    if (isActive) onStatsChangeRef.current(latestStatsRef.current);
  }, [isActive]);

  return (
    <div
      className="relative flex h-full w-full flex-col"
      onMouseDown={onFocus}
    >
      {multiPane && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 transition-colors",
            isFocused ? "bg-primary/50" : "bg-transparent",
          )}
        />
      )}
      <TabBar
        paneIndex={paneIndex}
        tabs={pane.tabs}
        active={pane.active}
        showRoot={showRoot}
        canSplit={canSplit}
        onSelect={onTabSelect}
        onClose={onTabClose}
        onSplit={onSplit}
        onClosePane={onClosePane}
        onTabDrop={onTabDrop}
      />
      <div
        className={cn(
          "min-h-0 flex-1 transition-opacity",
          multiPane && !isFocused && "opacity-70",
        )}
      >
        {pane.active ? (
          <DocContent
            key={`${pane.active.root}:${pane.active.path}`}
            doc={pane.active}
            zoom={pane.zoom ?? 1}
            onStats={handleStats}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <FileText className="size-10 opacity-40" weight="thin" />
            <div className="text-sm">No document selected</div>
          </div>
        )}
      </div>
    </div>
  );
}

function NewPaneDropZone({
  onDrop,
}: {
  onDrop: (fromPaneIndex: number, ref: DocRef) => void;
}) {
  const [over, setOver] = useState(false);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(TAB_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const raw = e.dataTransfer.getData(TAB_MIME);
      setOver(false);
      if (!raw) return;
      try {
        const data = JSON.parse(raw) as TabDragData;
        if (
          !data ||
          typeof data.fromPaneIndex !== "number" ||
          !data.ref?.root ||
          !data.ref?.path
        )
          return;
        e.preventDefault();
        onDrop(data.fromPaneIndex, data.ref);
      } catch {}
    },
    [onDrop],
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "absolute inset-y-2 right-2 z-20 flex w-[38%] min-w-[160px] max-w-[360px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed backdrop-blur-[2px] transition-colors",
        over
          ? "border-primary/70 bg-primary/10 text-primary"
          : "border-border/60 bg-background/60 text-muted-foreground",
      )}
    >
      <SplitHorizontal className="size-6" weight="duotone" />
      <div className="text-xs font-medium">
        {over ? "Release to split" : "Drop to split"}
      </div>
    </div>
  );
}
