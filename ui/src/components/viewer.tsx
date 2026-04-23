import {
  ChatCircleText,
  MagnifyingGlass,
  SidebarSimple,
} from "@phosphor-icons/react";
import { SplitViewer, type PaneState } from "@/components/split-viewer";
import type { DocStats } from "@/components/doc-content";
import type { DocRef } from "@/lib/api";
import { cn } from "@/lib/utils";

export type { DocStats } from "@/components/doc-content";

type Props = {
  panes: PaneState[];
  activePaneIndex: number;
  showRoot: boolean;
  chatOpen: boolean;
  sidebarOpen: boolean;
  onToggleChat: () => void;
  onToggleSidebar: () => void;
  onStatsChange: (stats: DocStats | null) => void;
  onOpenPalette: () => void;
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
  mod: string;
};

export function Viewer({
  panes,
  activePaneIndex,
  showRoot,
  chatOpen,
  sidebarOpen,
  onToggleChat,
  onToggleSidebar,
  onStatsChange,
  onOpenPalette,
  onPaneFocus,
  onTabSelect,
  onTabClose,
  onSplit,
  onClosePane,
  onTabMove,
  mod,
}: Props) {
  return (
    <div className="flex h-full flex-1 flex-col">
      <header className="flex h-[42px] shrink-0 items-center gap-2 border-b border-border px-2 text-xs">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title="Expand sidebar (⌘B)"
            className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SidebarSimple className="size-3.5" />
          </button>
        )}

        <div className="mx-auto flex w-full max-w-md justify-center">
          <button
            type="button"
            onClick={onOpenPalette}
            className="group flex h-7 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-2 text-left text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          >
            <MagnifyingGlass className="size-3.5 shrink-0" />
            <span className="flex-1 truncate text-[12px]">
              Search files or content…
            </span>
            <span className="pointer-events-none flex shrink-0 items-center gap-0.5">
              <kbd className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px] leading-none">
                {mod}
              </kbd>
              <kbd className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px] leading-none">
                K
              </kbd>
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleChat}
          title="Toggle chat (⌘J)"
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
            chatOpen
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <ChatCircleText className="size-3.5" />
          <span>Chat</span>
        </button>
      </header>

      <div className="min-h-0 flex-1">
        <SplitViewer
          panes={panes}
          activePaneIndex={activePaneIndex}
          showRoot={showRoot}
          onPaneFocus={onPaneFocus}
          onTabSelect={onTabSelect}
          onTabClose={onTabClose}
          onSplit={onSplit}
          onClosePane={onClosePane}
          onTabMove={onTabMove}
          onStatsChange={onStatsChange}
        />
      </div>
    </div>
  );
}
