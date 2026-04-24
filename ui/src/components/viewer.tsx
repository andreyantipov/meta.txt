import {
  ChatCircleText,
  MagnifyingGlass,
  SidebarSimple,
} from "@phosphor-icons/react";
import { SplitViewer, type PaneState } from "@/components/split-viewer";
import type { DocStats } from "@/components/doc-content";
import type { DocRef } from "@/lib/api";
import { useShortcut } from "@/lib/keymap";

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
  onTabDropNewPane: (fromPaneIndex: number, ref: DocRef) => void;
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
  onTabDropNewPane,
}: Props) {
  const paletteSc = useShortcut("palette.toggle");
  const sidebarSc = useShortcut("sidebar.toggle");
  const chatSc = useShortcut("chat.toggle");

  return (
    <div className="flex h-full flex-1 flex-col">
      <header className="flex h-[42px] shrink-0 items-center gap-2 border-b border-border px-2 text-xs">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={sidebarSc.title ? `Expand sidebar (${sidebarSc.title})` : "Expand sidebar"}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-[12px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          >
            <SidebarSimple className="size-3.5" />
            <span>Files</span>
            {sidebarSc.parts.length > 0 && (
              <span className="shortcut-hint pointer-events-none shrink-0 items-center gap-0.5">
                {sidebarSc.parts.map((p, i) => (
                  <kbd
                    key={i}
                    className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px] leading-none"
                  >
                    {p}
                  </kbd>
                ))}
              </span>
            )}
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
            {paletteSc.parts.length > 0 && (
              <span className="shortcut-hint pointer-events-none shrink-0 items-center gap-0.5">
                {paletteSc.parts.map((p, i) => (
                  <kbd
                    key={i}
                    className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px] leading-none"
                  >
                    {p}
                  </kbd>
                ))}
              </span>
            )}
          </button>
        </div>

        {!chatOpen && (
          <button
            type="button"
            onClick={onToggleChat}
            title={chatSc.title ? `Open chat (${chatSc.title})` : "Open chat"}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-[12px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          >
            <ChatCircleText className="size-3.5" />
            <span>Chat</span>
            {chatSc.parts.length > 0 && (
              <span className="shortcut-hint pointer-events-none shrink-0 items-center gap-0.5">
                {chatSc.parts.map((p, i) => (
                  <kbd
                    key={i}
                    className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px] leading-none"
                  >
                    {p}
                  </kbd>
                ))}
              </span>
            )}
          </button>
        )}
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
          onTabDropNewPane={onTabDropNewPane}
          onStatsChange={onStatsChange}
        />
      </div>
    </div>
  );
}
