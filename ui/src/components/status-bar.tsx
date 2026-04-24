import { Keyboard, Minus, Plus } from "@phosphor-icons/react";
import type { DocStats } from "@/components/viewer";
import { ThemeToggle } from "@/components/theme-toggle";
import type { DocRef, GitInfo, RootEntry } from "@/lib/api";
import { useShortcut } from "@/lib/keymap";
import { cn } from "@/lib/utils";

const CONTEXT_BUDGETS: Array<{ label: string; tokens: number }> = [
  { label: "Sonnet 200k", tokens: 200_000 },
  { label: "Opus 1M", tokens: 1_000_000 },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 10) return `${kb.toFixed(2)} KB`;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens.toLocaleString()} tokens`;
  if (tokens < 10_000) return `${(tokens / 1000).toFixed(1)}k tokens`;
  return `${Math.round(tokens / 1000).toLocaleString()}k tokens`;
}

function formatReadTime(minutes: number): string {
  if (minutes < 1) return "<1 min read";
  if (minutes < 60) return `≈${Math.round(minutes)} min read`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `≈${h}h read` : `≈${h}h ${m}m read`;
}

function formatBudgets(tokens: number): string {
  return CONTEXT_BUDGETS.map((b) => {
    const pct = (tokens / b.tokens) * 100;
    const label =
      pct < 0.1 ? "<0.1" : pct < 10 ? pct.toFixed(1) : Math.round(pct).toString();
    return `${label}% of ${b.label}`;
  }).join(" · ");
}

type Props = {
  version: string;
  roots: RootEntry[];
  active: DocRef | null;
  stats: DocStats | null;
  git: GitInfo | null;
  zoom: number;
  canZoom: boolean;
  onZoom: (delta: -1 | 0 | 1) => void;
  onShowShortcuts: () => void;
  onShowChangelog: () => void;
};

export function StatusBar({
  version,
  roots,
  active,
  stats,
  git,
  zoom,
  canZoom,
  onZoom,
  onShowShortcuts,
  onShowChangelog,
}: Props) {
  const totalFiles = roots.reduce((s, r) => s + r.files.length, 0);
  const rootLabel =
    roots.length === 0
      ? "no roots"
      : roots.length === 1
        ? `${totalFiles.toLocaleString()} doc${totalFiles === 1 ? "" : "s"}`
        : `${roots.length} roots · ${totalFiles.toLocaleString()} docs`;

  const branch = git?.ok ? git.branch : null;
  const sha = git?.ok && git.sha ? git.sha.slice(0, 7) : null;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-2 border-t border-border bg-muted/30 px-3 text-[11px] text-muted-foreground">
      <button
        type="button"
        onClick={onShowChangelog}
        title="What's new"
        className="flex shrink-0 items-center gap-2 rounded px-1 -mx-1 transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <span className="font-medium text-foreground/70">meta.txt</span>
        <span className="font-mono tabular-nums">v{version}</span>
      </button>
      <Sep />
      <span className="shrink-0 tabular-nums">{rootLabel}</span>

      {branch || sha ? (
        <>
          <Sep />
          <span className="shrink-0 font-mono" title={`git: ${branch ?? "(detached)"}${sha ? ` @ ${sha}` : ""}`}>
            {branch ?? "(detached)"}
            {sha && (
              <span className="text-muted-foreground/60"> ({sha})</span>
            )}
          </span>
          <span className="shrink-0 text-muted-foreground/40">→</span>
        </>
      ) : (
        <Sep />
      )}

      {active ? (
        <span className="min-w-0 flex-1 truncate font-mono text-foreground/70">
          {active.path}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-muted-foreground/50">
          no document selected
        </span>
      )}

      {active && stats && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="uppercase tracking-wider">{stats.kind}</span>
          <Sep />
          <span className="tabular-nums">{formatBytes(stats.bytes)}</span>
          <Sep />
          <span
            className="tabular-nums"
            title={
              stats.approx
                ? `≈${stats.tokens.toLocaleString()} tokens (chars/4, exact loading…)\n${formatBudgets(stats.tokens)}`
                : `${stats.tokens.toLocaleString()} tokens (o200k_base BPE)\n${formatBudgets(stats.tokens)}`
            }
          >
            {stats.approx ? "≈" : ""}
            {formatTokens(stats.tokens)}
          </span>
          <Sep />
          <span
            className="tabular-nums"
            title={`${stats.words.toLocaleString()} words at 200 wpm`}
          >
            {formatReadTime(stats.readMinutes)}
          </span>
        </div>
      )}

      <Sep />
      <div className="flex shrink-0 items-center gap-1">
        {canZoom && <ZoomGroup zoom={zoom} onZoom={onZoom} />}
        <ThemeToggle />
        <ShortcutsButton onClick={onShowShortcuts} />
      </div>
    </footer>
  );
}

function ShortcutsButton({ onClick }: { onClick: () => void }) {
  const sc = useShortcut("shortcuts.show");
  return (
    <button
      type="button"
      onClick={onClick}
      title={sc.title ? `Keyboard shortcuts (${sc.title})` : "Keyboard shortcuts"}
      className="flex h-4 shrink-0 items-center self-center rounded bg-foreground/5 px-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
    >
      <Keyboard className="size-3" weight="bold" />
    </button>
  );
}

function ZoomGroup({
  zoom,
  onZoom,
}: {
  zoom: number;
  onZoom: (delta: -1 | 0 | 1) => void;
}) {
  const zoomIn = useShortcut("zoom.in");
  const zoomOut = useShortcut("zoom.out");
  const zoomReset = useShortcut("zoom.reset");
  return (
    <div className="flex h-4 shrink-0 items-stretch self-center rounded bg-foreground/5">
      <button
        type="button"
        onClick={() => onZoom(-1)}
        title={zoomOut.title ? `Zoom out (${zoomOut.title})` : "Zoom out"}
        className="flex w-5 items-center justify-center rounded-l text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <Minus className="size-2.5" weight="bold" />
      </button>
      <button
        type="button"
        onClick={() => onZoom(0)}
        title={zoomReset.title ? `Reset zoom (${zoomReset.title})` : "Reset zoom"}
        className={cn(
          "flex min-w-[34px] items-center justify-center px-1 font-mono text-[11px] leading-none tabular-nums transition-colors hover:bg-foreground/10 hover:text-foreground",
          zoom !== 1 ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => onZoom(1)}
        title={zoomIn.title ? `Zoom in (${zoomIn.title})` : "Zoom in"}
        className="flex w-5 items-center justify-center rounded-r text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <Plus className="size-2.5" weight="bold" />
      </button>
    </div>
  );
}

function Sep() {
  return <span className="text-foreground/20">·</span>;
}
