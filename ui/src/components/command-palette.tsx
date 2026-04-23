import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Fzf, type FzfResultItem } from "fzf";
import {
  CircleNotch,
  FileText,
  MagnifyingGlass,
  Sparkle,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { ContentHit, DocRef } from "@/lib/api";
import { fetchDoc, searchContent } from "@/lib/api";

const MAX_INLINE_HITS = 20;
const SNIPPET_WINDOW = 80;

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    .replace(/<script[\s\S]*?<\/script>/gi, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    .replace(/<!--[\s\S]*?-->/g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function findInlineHits(
  text: string,
  path: string,
  ref: DocRef,
  query: string,
): ContentHit[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const body = /\.html?$/i.test(path) ? htmlToText(text) : text;
  const lines = body.split("\n");
  const out: ContentHit[] = [];
  for (let i = 0; i < lines.length && out.length < MAX_INLINE_HITS; i++) {
    const raw = lines[i]!;
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const idx = line.toLowerCase().indexOf(needle);
    if (idx === -1) continue;
    const windowStart = Math.max(0, idx - Math.floor(SNIPPET_WINDOW / 2));
    const windowEnd = Math.min(line.length, windowStart + SNIPPET_WINDOW);
    let snippet = line.slice(windowStart, windowEnd);
    let matchStart = idx - windowStart;
    if (windowStart > 0) {
      snippet = "…" + snippet;
      matchStart += 1;
    }
    if (windowEnd < line.length) snippet += "…";
    out.push({
      root: ref.root,
      path: ref.path,
      line: i + 1,
      snippet,
      matchStart,
      matchEnd: matchStart + query.length,
    });
  }
  return out;
}

type Props = {
  open: boolean;
  refs: DocRef[];
  openTabs: DocRef[];
  onSelect: (ref: DocRef) => void;
  onClose: () => void;
  showRoot: boolean;
};

type Item = {
  root: string;
  path: string;
  key: string;
  nameMatch: boolean;
  nameScore: number;
  hits: ContentHit[];
};

const MAX_ITEMS = 60;
const DEBOUNCE_MS = 150;

export function CommandPalette({
  open,
  refs,
  openTabs,
  onSelect,
  onClose,
  showRoot,
}: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [contentHits, setContentHits] = useState<ContentHit[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setContentHits([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setContentHits([]);
      setContentLoading(false);
      return;
    }
    setContentLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchContent(q, controller.signal)
        .then((hits) => {
          setContentHits(hits);
          setContentLoading(false);
        })
        .catch(() => setContentLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const fzf = useMemo(
    () =>
      new Fzf(refs, {
        selector: (r) => (showRoot ? `${r.root}/${r.path}` : r.path),
        limit: MAX_ITEMS,
        casing: "smart-case",
      }),
    [refs, showRoot],
  );

  const items: Item[] = useMemo(() => {
    const q = query.trim();

    if (q.length === 0) {
      return openTabs.map((t) => ({
        root: t.root,
        path: t.path,
        key: `${t.root}:${t.path}`,
        nameMatch: false,
        nameScore: 0,
        hits: [],
      }));
    }

    const map = new Map<string, Item>();

    const results: FzfResultItem<DocRef>[] = fzf.find(q);
    for (const r of results) {
      const key = `${r.item.root}:${r.item.path}`;
      map.set(key, {
        root: r.item.root,
        path: r.item.path,
        key,
        nameMatch: true,
        nameScore: r.score,
        hits: [],
      });
    }

    for (const h of contentHits) {
      const key = `${h.root}:${h.path}`;
      const existing = map.get(key);
      if (existing) existing.hits.push(h);
      else
        map.set(key, {
          root: h.root,
          path: h.path,
          key,
          nameMatch: false,
          nameScore: 0,
          hits: [h],
        });
    }

    const arr = [...map.values()];
    arr.sort((a, b) => {
      if (a.nameMatch !== b.nameMatch) return a.nameMatch ? -1 : 1;
      if (a.nameMatch) return b.nameScore - a.nameScore;
      if (b.hits.length !== a.hits.length) return b.hits.length - a.hits.length;
      return a.path.localeCompare(b.path);
    });
    return arr.slice(0, MAX_ITEMS);
  }, [fzf, contentHits, query, openTabs]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 46,
    overscan: 8,
  });

  useEffect(() => {
    if (items.length === 0) return;
    rowVirtualizer.scrollToIndex(index, { align: "auto" });
    if (previewRef.current) previewRef.current.scrollTop = 0;
  }, [index, items.length, rowVirtualizer]);

  if (!open) return null;

  const pick = (i: number) => {
    const item = items[i];
    if (!item) return;
    onSelect({ root: item.root, path: item.path });
  };

  const qLen = query.trim().length;
  const active = items[index];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-border">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(index);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="search files or content…"
            className="h-11 w-full bg-transparent pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex min-h-[18rem] flex-1 overflow-hidden">
          {items.length === 0 ? (
            <PaletteEmpty qLen={qLen} contentLoading={contentLoading} />
          ) : (
            <>
              <div
                ref={listRef}
                className="w-[44%] shrink-0 overflow-y-auto border-r border-border"
              >
                <div
                  className="relative p-1"
                  style={{ height: rowVirtualizer.getTotalSize() }}
                >
                  {rowVirtualizer.getVirtualItems().map((v) => {
                    const item = items[v.index]!;
                    return (
                      <div
                        key={item.key}
                        data-idx={v.index}
                        className="absolute left-1 right-1 top-0"
                        style={{ transform: `translateY(${v.start}px)` }}
                      >
                        <LeftRow
                          item={item}
                          active={v.index === index}
                          onMouseEnter={() => setIndex(v.index)}
                          onClick={() => pick(v.index)}
                          showRoot={showRoot}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                ref={previewRef}
                className="flex min-w-0 flex-1 flex-col overflow-y-auto"
              >
                {active ? (
                  <Preview item={active} showRoot={showRoot} query={query} />
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          <span>
            {items.length === 0
              ? ""
              : qLen === 0
                ? `${items.length} open ${items.length === 1 ? "tab" : "tabs"}`
                : `${items.length} ${items.length === 1 ? "file" : "files"}`}
          </span>
          <span className="flex items-center gap-2">
            <Hint k="↑↓">navigate</Hint>
            <Hint k="↵">open</Hint>
            <Hint k="esc">close</Hint>
          </span>
        </div>
      </div>
    </div>
  );
}

function PaletteEmpty({
  qLen,
  contentLoading,
}: {
  qLen: number;
  contentLoading: boolean;
}) {
  const { icon, label, hint } = (() => {
    if (contentLoading) {
      return {
        icon: (
          <CircleNotch
            size={28}
            weight="duotone"
            className="animate-spin text-muted-foreground/70"
          />
        ),
        label: "Searching…",
        hint: null,
      };
    }
    if (qLen === 0) {
      return {
        icon: (
          <MagnifyingGlass
            size={28}
            weight="duotone"
            className="text-muted-foreground/50"
          />
        ),
        label: "Type to search",
        hint: "files by name or content across all roots",
      };
    }
    if (qLen < 2) {
      return {
        icon: (
          <Sparkle
            size={28}
            weight="duotone"
            className="text-muted-foreground/50"
          />
        ),
        label: "Keep typing",
        hint: "content search needs 2+ characters",
      };
    }
    return {
      icon: (
        <Sparkle
          size={28}
          weight="duotone"
          className="text-muted-foreground/40"
        />
      ),
      label: "No matches",
      hint: null,
    };
  })();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      {icon}
      <div className="text-sm text-muted-foreground">{label}</div>
      {hint && (
        <div className="text-[11px] text-muted-foreground/70">{hint}</div>
      )}
    </div>
  );
}

function LeftRow({
  item,
  active,
  onMouseEnter,
  onClick,
  showRoot,
}: {
  item: Item;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
  showRoot: boolean;
}) {
  const slash = item.path.lastIndexOf("/");
  const name = slash === -1 ? item.path : item.path.slice(slash + 1);
  const dir = slash === -1 ? "" : item.path.slice(0, slash);
  const dirLabel = showRoot ? (dir ? `${item.root}/${dir}` : item.root) : dir;

  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left",
        active && "bg-accent text-accent-foreground",
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{name}</span>
        {item.hits.length > 0 && (
          <span
            className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground"
            title={`${item.hits.length} content ${item.hits.length === 1 ? "match" : "matches"}`}
          >
            {item.hits.length}
          </span>
        )}
      </div>
      {dirLabel && (
        <span className="truncate pl-[22px] text-[11px] text-muted-foreground">
          {dirLabel}
        </span>
      )}
    </button>
  );
}

function Preview({
  item,
  showRoot,
  query,
}: {
  item: Item;
  showRoot: boolean;
  query: string;
}) {
  const [inlineHits, setInlineHits] = useState<ContentHit[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item.hits.length > 0 || !query.trim()) {
      setInlineHits(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setInlineHits(null);
    fetchDoc({ root: item.root, path: item.path })
      .then((text) => {
        if (cancelled) return;
        setInlineHits(
          findInlineHits(text, item.path, { root: item.root, path: item.path }, query),
        );
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.root, item.path, item.hits.length, query]);

  const hits = item.hits.length > 0 ? item.hits : (inlineHits ?? []);

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center gap-2 text-xs">
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-muted-foreground">
          {showRoot ? `${item.root}/${item.path}` : item.path}
        </span>
      </div>
      {hits.length === 0 ? (
        <div className="px-1 py-4 text-xs text-muted-foreground">
          {loading
            ? "scanning file…"
            : query.trim()
              ? "no content matches"
              : "select to preview"}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/50">
          {hits.map((hit, i) => {
            const before = hit.snippet.slice(0, hit.matchStart);
            const match = hit.snippet.slice(hit.matchStart, hit.matchEnd);
            const after = hit.snippet.slice(hit.matchEnd);
            return (
              <div key={i} className="flex gap-2 py-1.5">
                <span className="shrink-0 select-none font-mono text-[10px] text-muted-foreground">
                  :{hit.line}
                </span>
                <div className="min-w-0 font-mono text-xs leading-relaxed">
                  <span className="text-muted-foreground">{before}</span>
                  <span className="rounded-sm bg-amber-500/20 px-0.5 text-foreground">
                    {match}
                  </span>
                  <span className="text-muted-foreground">{after}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


function Hint({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px] leading-none">
        {k}
      </kbd>
      <span>{children}</span>
    </span>
  );
}
