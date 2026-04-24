import {
  memo,
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { ArrowBendDownLeft, FileText, SplitHorizontal, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { DocRef } from "@/lib/api";
import { rootColor } from "@/lib/root-color";
import { useBackrefs } from "@/lib/refs";

export const TAB_MIME = "application/x-meta-tab";

export type TabDragData = {
  fromPaneIndex: number;
  ref: DocRef;
};

type Props = {
  paneIndex: number;
  tabs: DocRef[];
  active: DocRef | null;
  showRoot: boolean;
  canSplit: boolean;
  onSelect: (ref: DocRef) => void;
  onClose: (ref: DocRef) => void;
  onSplit?: () => void;
  onClosePane?: () => void;
  onTabDrop: (
    fromPaneIndex: number,
    ref: DocRef,
    insertIndex: number,
  ) => void;
};

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function sameRef(a: DocRef, b: DocRef): boolean {
  return a.root === b.root && a.path === b.path;
}

export function TabBar({
  paneIndex,
  tabs,
  active,
  showRoot,
  canSplit,
  onSelect,
  onClose,
  onSplit,
  onClosePane,
  onTabDrop,
}: Props) {
  const tabRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const computeDropIndex = useCallback(
    (e: DragEvent<HTMLDivElement>): number => {
      const clientX = e.clientX;
      for (let i = 0; i < tabs.length; i++) {
        const key = `${tabs[i]!.root}:${tabs[i]!.path}`;
        const el = tabRefs.current.get(key);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) return i;
      }
      return tabs.length;
    },
    [tabs],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes(TAB_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropIndex(computeDropIndex(e));
    },
    [computeDropIndex],
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDropIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const raw = e.dataTransfer.getData(TAB_MIME);
      setDropIndex(null);
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
        const idx = computeDropIndex(e);
        onTabDrop(data.fromPaneIndex, data.ref, idx);
      } catch {}
    },
    [computeDropIndex, onTabDrop],
  );

  return (
    <div
      className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-border bg-muted/20 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {tabs.map((tab, i) => {
        const isActive = !!active && sameRef(tab, active);
        const key = `${tab.root}:${tab.path}`;
        return (
          <div key={key} className="relative flex">
            {dropIndex === i && <DropIndicator />}
            <Tab
              tab={tab}
              paneIndex={paneIndex}
              isActive={isActive}
              showRoot={showRoot}
              onSelect={onSelect}
              onClose={onClose}
              tabRef={(el) => {
                if (el) tabRefs.current.set(key, el);
                else tabRefs.current.delete(key);
              }}
            />
          </div>
        );
      })}
      <div className="relative flex flex-1 items-center justify-end gap-0.5 px-1">
        {dropIndex === tabs.length && <DropIndicator />}
        {canSplit && onSplit && tabs.length > 0 && (
          <button
            type="button"
            onClick={onSplit}
            title="Split right"
            className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <SplitHorizontal className="size-3.5" />
          </button>
        )}
        {onClosePane && (
          <button
            type="button"
            onClick={onClosePane}
            title="Close split pane"
            className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-foreground"
          >
            <X className="size-3" weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}

function DropIndicator() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 -left-px z-10 w-0.5 bg-foreground/70"
    />
  );
}

type TabProps = {
  tab: DocRef;
  paneIndex: number;
  isActive: boolean;
  showRoot: boolean;
  onSelect: (ref: DocRef) => void;
  onClose: (ref: DocRef) => void;
  tabRef: (el: HTMLDivElement | null) => void;
};

const Tab = memo(function Tab({
  tab,
  paneIndex,
  isActive,
  showRoot,
  onSelect,
  onClose,
  tabRef,
}: TabProps) {
  const name = basename(tab.path);
  const title = showRoot ? `${tab.root}/${tab.path}` : tab.path;
  const color = showRoot ? rootColor(tab.root) : null;
  const backrefs = useBackrefs(tab);
  const backCount = backrefs.length;

  const handleClose = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onClose(tab);
    },
    [onClose, tab],
  );

  const handleAuxClick = useCallback(
    (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        onClose(tab);
      }
    },
    [onClose, tab],
  );

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const data: TabDragData = { fromPaneIndex: paneIndex, ref: tab };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(TAB_MIME, JSON.stringify(data));
      window.dispatchEvent(
        new CustomEvent<TabDragData>("meta-tab-drag-start", { detail: data }),
      );
    },
    [paneIndex, tab],
  );

  const handleDragEnd = useCallback(() => {
    window.dispatchEvent(new CustomEvent("meta-tab-drag-end"));
  }, []);

  return (
    <div
      ref={tabRef}
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => onSelect(tab)}
      onAuxClick={handleAuxClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(tab);
        }
      }}
      title={title}
      className={cn(
        "group relative flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 text-xs outline-none transition-colors",
        "max-w-[220px]",
        isActive
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
      )}
    >
      <FileText
        className={cn(
          "size-3.5 shrink-0",
          isActive ? "text-foreground/80" : "text-muted-foreground",
        )}
      />
      {color && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          title={tab.root}
        />
      )}
      <span className="truncate">{name}</span>
      {backCount > 0 && (
        <span
          className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground/80"
          title={`${backCount} incoming reference${backCount === 1 ? "" : "s"}`}
        >
          <ArrowBendDownLeft className="size-2.5" />
          {backCount}
        </span>
      )}
      <button
        type="button"
        onClick={handleClose}
        title="Close (⌘W)"
        className={cn(
          "-mr-1 flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-all",
          "hover:bg-foreground/10 hover:text-foreground",
          isActive ? "opacity-70" : "opacity-0 group-hover:opacity-70",
        )}
      >
        <X className="size-2.5" weight="bold" />
      </button>
      {isActive && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-foreground/40"
        />
      )}
    </div>
  );
});
