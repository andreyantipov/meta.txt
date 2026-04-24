import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Viewer } from "@/components/viewer";
import type { DocStats } from "@/components/doc-content";
import type { PaneState } from "@/components/split-viewer";
import { CommandPalette } from "@/components/command-palette";
import { ChatPanel } from "@/components/chat-panel";
import { Layout } from "@/components/layout";
import { StatusBar } from "@/components/status-bar";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { matchShortcut } from "@/lib/keymap";
import { setRootNames } from "@/lib/root-color";
import { cmpVersion } from "@/lib/version";
import {
  fetchDocs,
  fetchGit,
  type DocRef,
  type GitInfo,
  type RootEntry,
} from "@/lib/api";
import { subscribe } from "@/lib/events";
import { invalidateRefs } from "@/lib/refs";

function encodeRef(ref: DocRef): string {
  return `${encodeURIComponent(ref.root)}/${encodeURIComponent(ref.path)}`;
}

function decodeRef(hash: string): DocRef | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!h) return null;
  const slash = h.indexOf("/");
  if (slash === -1) return null;
  try {
    return {
      root: decodeURIComponent(h.slice(0, slash)),
      path: decodeURIComponent(h.slice(slash + 1)),
    };
  } catch {
    return null;
  }
}

function refExists(roots: RootEntry[], ref: DocRef): boolean {
  const r = roots.find((x) => x.name === ref.root);
  return !!r && r.files.includes(ref.path);
}

const README_RE = /^readme\.(md|mdx|markdown|txt)$/i;

function firstRef(roots: RootEntry[]): DocRef | null {
  for (const r of roots) {
    const rootReadme = r.files.find((f) => README_RE.test(f));
    if (rootReadme) return { root: r.name, path: rootReadme };
  }
  for (const r of roots) {
    const anyReadme = r.files.find((f) => {
      const base = f.slice(f.lastIndexOf("/") + 1);
      return README_RE.test(base);
    });
    if (anyReadme) return { root: r.name, path: anyReadme };
  }
  for (const r of roots) {
    if (r.files.length > 0) return { root: r.name, path: r.files[0]! };
  }
  return null;
}

function sameRef(a: DocRef | null, b: DocRef | null): boolean {
  return !!a && !!b && a.root === b.root && a.path === b.path;
}

const CHAT_OPEN_KEY = "meta.txt:chat-open";
const SIDEBAR_OPEN_KEY = "meta.txt:sidebar-open";
const PANES_KEY = "meta.txt:panes";
const ACTIVE_PANE_KEY = "meta.txt:active-pane";
const LAST_SEEN_VERSION_KEY = "meta.txt:last-seen-version";

const ZOOM_LEVELS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0] as const;

function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.max(ZOOM_LEVELS[0], Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!, z));
}

function stepZoom(current: number, delta: -1 | 1): number {
  const cur = clampZoom(current);
  // snap to nearest level, then step
  let idx = 0;
  let best = Infinity;
  for (let i = 0; i < ZOOM_LEVELS.length; i++) {
    const d = Math.abs(ZOOM_LEVELS[i]! - cur);
    if (d < best) {
      best = d;
      idx = i;
    }
  }
  const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + delta));
  return ZOOM_LEVELS[next]!;
}

type PersistedPanes = {
  panes: PaneState[];
  activePaneIndex: number;
};

function loadPanes(): PersistedPanes | null {
  try {
    const raw = localStorage.getItem(PANES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.panes)) return null;
    const panes: PaneState[] = parsed.panes
      .filter((p: unknown) => p && typeof p === "object")
      .map((p: { tabs?: unknown; active?: unknown; zoom?: unknown }) => ({
        tabs: Array.isArray(p.tabs)
          ? p.tabs.filter(
              (t: unknown) =>
                t &&
                typeof (t as DocRef).root === "string" &&
                typeof (t as DocRef).path === "string",
            )
          : [],
        active:
          p.active &&
          typeof (p.active as DocRef).root === "string" &&
          typeof (p.active as DocRef).path === "string"
            ? (p.active as DocRef)
            : null,
        zoom: typeof p.zoom === "number" ? clampZoom(p.zoom) : 1,
      }));
    if (panes.length === 0) return null;
    const activePaneIndex =
      typeof parsed.activePaneIndex === "number" &&
      parsed.activePaneIndex >= 0 &&
      parsed.activePaneIndex < panes.length
        ? parsed.activePaneIndex
        : 0;
    return { panes, activePaneIndex };
  } catch {
    return null;
  }
}

function filterPanes(panes: PaneState[], roots: RootEntry[]): PaneState[] {
  return panes.map((p) => {
    const tabs = p.tabs.filter((t) => refExists(roots, t));
    const active =
      p.active && tabs.some((t) => sameRef(t, p.active))
        ? p.active
        : tabs[0] ?? null;
    return { tabs, active, zoom: p.zoom };
  });
}

export default function App() {
  const [roots, setRoots] = useState<RootEntry[]>([]);
  const [version, setVersion] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogSince, setChangelogSince] = useState<string | null>(null);
  const [docStats, setDocStats] = useState<DocStats | null>(null);
  const [git, setGit] = useState<GitInfo | null>(null);

  const [panes, setPanes] = useState<PaneState[]>([{ tabs: [], active: null }]);
  const [activePaneIndex, setActivePaneIndex] = useState(0);

  const [chatOpen, setChatOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CHAT_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_OPEN_KEY, chatOpen ? "1" : "0");
    } catch {}
  }, [chatOpen]);
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_OPEN_KEY, sidebarOpen ? "1" : "0");
    } catch {}
  }, [sidebarOpen]);

  useEffect(() => {
    setRootNames(roots.map((r) => r.name));
  }, [roots]);

  useEffect(() => {
    const set = () =>
      document.documentElement.setAttribute("data-shortcut-hints", "");
    const unset = () =>
      document.documentElement.removeAttribute("data-shortcut-hints");
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey) set();
      else unset();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", unset);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", unset);
      unset();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PANES_KEY, JSON.stringify({ panes, activePaneIndex }));
    } catch {}
  }, [panes, activePaneIndex]);
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_PANE_KEY, String(activePaneIndex));
    } catch {}
  }, [activePaneIndex]);

  const active = panes[activePaneIndex]?.active ?? null;

  const stepPaneZoom = useCallback((paneIdx: number, delta: -1 | 0 | 1) => {
    setPanes((prev) => {
      if (paneIdx < 0 || paneIdx >= prev.length) return prev;
      const pane = prev[paneIdx]!;
      const cur = pane.zoom ?? 1;
      const nextZoom = delta === 0 ? 1 : stepZoom(cur, delta);
      if (nextZoom === cur) return prev;
      const next = [...prev];
      next[paneIdx] = { ...pane, zoom: nextZoom };
      return next;
    });
  }, []);

  const stepActivePaneZoom = useCallback(
    (delta: -1 | 0 | 1) => {
      const idx = Math.min(activePaneIndex, panes.length - 1);
      stepPaneZoom(idx, delta);
    },
    [activePaneIndex, panes.length, stepPaneZoom],
  );

  const openDoc = useCallback(
    (ref: DocRef | null) => {
      if (!ref) return;
      setPanes((prev) => {
        // if already open anywhere, focus that pane's tab (no duplication)
        const existingPane = prev.findIndex((p) =>
          p.tabs.some((t) => sameRef(t, ref)),
        );
        if (existingPane !== -1) {
          setActivePaneIndex(existingPane);
          if (sameRef(prev[existingPane]!.active, ref)) return prev;
          const next = [...prev];
          next[existingPane] = { ...next[existingPane]!, active: ref };
          return next;
        }
        // otherwise, open in the active pane
        const idx = Math.min(activePaneIndex, prev.length - 1);
        const target = prev[idx]!;
        const next = [...prev];
        next[idx] = { tabs: [...target.tabs, ref], active: ref };
        return next;
      });
    },
    [activePaneIndex],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<DocRef>;
      if (!ce.detail?.root || !ce.detail?.path) return;
      openDoc(ce.detail);
    };
    window.addEventListener("meta-open-ref", handler);
    return () => window.removeEventListener("meta-open-ref", handler);
  }, [openDoc]);

  const handleTabSelect = useCallback((paneIdx: number, ref: DocRef) => {
    setActivePaneIndex(paneIdx);
    setPanes((prev) => {
      const next = [...prev];
      next[paneIdx] = { ...next[paneIdx]!, active: ref };
      return next;
    });
  }, []);

  const handleTabClose = useCallback(
    (paneIdx: number, ref: DocRef) => {
      setPanes((prev) => {
        const pane = prev[paneIdx]!;
        const idx = pane.tabs.findIndex((t) => sameRef(t, ref));
        if (idx === -1) return prev;
        const tabs = pane.tabs.filter((_, i) => i !== idx);
        const activeStill = !sameRef(pane.active, ref)
          ? pane.active
          : tabs[idx] ?? tabs[idx - 1] ?? null;
        const updated = { tabs, active: activeStill };

        // close empty secondary pane
        if (tabs.length === 0 && prev.length > 1) {
          const next = prev.filter((_, i) => i !== paneIdx);
          setActivePaneIndex((cur) =>
            cur === paneIdx ? 0 : cur > paneIdx ? cur - 1 : cur,
          );
          return next;
        }
        const next = [...prev];
        next[paneIdx] = updated;
        return next;
      });
    },
    [],
  );

  const handleTabMove = useCallback(
    (
      fromPaneIndex: number,
      toPaneIndex: number,
      ref: DocRef,
      insertIndex: number,
    ) => {
      setPanes((prev) => {
        if (
          fromPaneIndex < 0 ||
          fromPaneIndex >= prev.length ||
          toPaneIndex < 0 ||
          toPaneIndex >= prev.length
        ) {
          return prev;
        }

        const fromPane = prev[fromPaneIndex]!;
        const srcTabIdx = fromPane.tabs.findIndex((t) => sameRef(t, ref));
        if (srcTabIdx === -1) return prev;

        // no-op: dropping at own position in same pane
        if (
          fromPaneIndex === toPaneIndex &&
          (insertIndex === srcTabIdx || insertIndex === srcTabIdx + 1)
        ) {
          return prev;
        }

        const next = prev.map((p) => ({ ...p, tabs: [...p.tabs] }));
        const srcPane = next[fromPaneIndex]!;
        srcPane.tabs.splice(srcTabIdx, 1);

        let adjustedInsert = insertIndex;
        if (fromPaneIndex === toPaneIndex && insertIndex > srcTabIdx) {
          adjustedInsert -= 1;
        }

        const dstPane = next[toPaneIndex]!;
        const clamped = Math.max(
          0,
          Math.min(adjustedInsert, dstPane.tabs.length),
        );
        dstPane.tabs.splice(clamped, 0, ref);
        dstPane.active = ref;

        // refresh src active if the moved tab was active
        if (sameRef(srcPane.active, ref)) {
          srcPane.active =
            srcPane.tabs[srcTabIdx] ??
            srcPane.tabs[srcTabIdx - 1] ??
            null;
        }

        // collapse source pane if now empty and more than one pane
        if (srcPane.tabs.length === 0 && next.length > 1) {
          const collapsed = next.filter((_, i) => i !== fromPaneIndex);
          const newActiveIdx =
            toPaneIndex > fromPaneIndex ? toPaneIndex - 1 : toPaneIndex;
          setActivePaneIndex(newActiveIdx);
          return collapsed;
        }

        setActivePaneIndex(toPaneIndex);
        return next;
      });
    },
    [],
  );

  const handleSplit = useCallback((_fromPaneIdx: number) => {
    setPanes((prev) => {
      if (prev.length >= 2) return prev;
      const newPane: PaneState = { tabs: [], active: null };
      const next = [...prev, newPane];
      setActivePaneIndex(next.length - 1);
      return next;
    });
  }, []);

  const handleTabDropNewPane = useCallback(
    (fromPaneIndex: number, ref: DocRef) => {
      setPanes((prev) => {
        if (prev.length >= 2) return prev;
        if (fromPaneIndex < 0 || fromPaneIndex >= prev.length) return prev;
        const src = prev[fromPaneIndex]!;
        if (src.tabs.length < 2) return prev;
        const srcTabs = src.tabs.filter((t) => !sameRef(t, ref));
        const srcActive = sameRef(src.active, ref)
          ? srcTabs[0] ?? null
          : src.active;
        const next: PaneState[] = [
          ...prev.slice(0, fromPaneIndex),
          { ...src, tabs: srcTabs, active: srcActive },
          ...prev.slice(fromPaneIndex + 1),
          { tabs: [ref], active: ref, zoom: src.zoom },
        ];
        setActivePaneIndex(next.length - 1);
        return next;
      });
    },
    [],
  );

  const handlePaneFocus = useCallback((idx: number) => {
    setActivePaneIndex((cur) => (cur === idx ? cur : idx));
  }, []);

  const handleStatsChange = useCallback(
    (s: DocStats | null) => setDocStats(s),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let bootstrapped = false;
    const load = (initial: boolean) =>
      fetchDocs()
        .then(({ roots, version }) => {
          if (cancelled) return;
          setRoots(roots);
          if (version) setVersion(version);

          if (initial && !bootstrapped) {
            bootstrapped = true;
            const persisted = loadPanes();
            if (persisted) {
              const filtered = filterPanes(persisted.panes, roots);
              const nonEmpty = filtered.filter(
                (p, i) => i === 0 || p.tabs.length > 0,
              );
              if (nonEmpty.length > 0 && nonEmpty[0]!.tabs.length > 0) {
                setPanes(nonEmpty);
                setActivePaneIndex(
                  Math.min(persisted.activePaneIndex, nonEmpty.length - 1),
                );
                return;
              }
            }
            const fromHash = decodeRef(location.hash);
            const target =
              fromHash && refExists(roots, fromHash)
                ? fromHash
                : firstRef(roots);
            if (target) {
              setPanes([{ tabs: [target], active: target }]);
              setActivePaneIndex(0);
            }
            return;
          }

          // non-initial: drop missing tabs
          setPanes((prev) => filterPanes(prev, roots));
        })
        .catch((e) => {
          if (!cancelled) setErr(String(e));
        })
        .finally(() => {
          if (!cancelled && initial) setLoading(false);
        });

    load(true);
    const unsub = subscribe((evt) => {
      if (evt.type === "docs:changed") load(false);
      else if (evt.type === "refs:changed") {
        invalidateRefs();
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!version) return;
    try {
      const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
      if (!lastSeen) {
        localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
        return;
      }
      if (cmpVersion(version, lastSeen) > 0) {
        setChangelogSince(lastSeen);
        setChangelogOpen(true);
        localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
      }
    } catch {}
  }, [version]);

  useEffect(() => {
    if (active) history.replaceState(null, "", `#${encodeRef(active)}`);
  }, [active]);

  useEffect(() => {
    const root = active?.root ?? roots[0]?.name;
    if (!root) {
      setGit(null);
      return;
    }
    let cancelled = false;
    fetchGit(root).then((info) => {
      if (!cancelled) setGit(info);
    });
    return () => {
      cancelled = true;
    };
  }, [active?.root, roots]);

  const handleClosePane = useCallback((paneIdx: number) => {
    setPanes((prev) => {
      if (prev.length < 2) return prev;
      const next = prev.filter((_, i) => i !== paneIdx);
      setActivePaneIndex((cur) =>
        cur === paneIdx ? 0 : cur > paneIdx ? cur - 1 : cur,
      );
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutsOpen) return;
      if (e.key === "Escape") {
        setPaletteOpen(false);
      }
      const id = matchShortcut(e);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      switch (id) {
        case "palette.toggle":
          setPaletteOpen((v) => !v);
          break;
        case "chat.toggle":
          setChatOpen((v) => !v);
          break;
        case "sidebar.toggle":
          setSidebarOpen((v) => !v);
          break;
        case "outline.toggle":
          window.dispatchEvent(new CustomEvent("meta:outline-toggle"));
          break;
        case "shortcuts.show":
          setShortcutsOpen(true);
          break;
        case "tab.close":
          setPanes((prev) => {
            const idx = Math.min(activePaneIndex, prev.length - 1);
            const cur = prev[idx]?.active;
            if (!cur) return prev;
            const pane = prev[idx]!;
            const tabIdx = pane.tabs.findIndex((t) => sameRef(t, cur));
            if (tabIdx === -1) return prev;
            const tabs = pane.tabs.filter((_, i) => i !== tabIdx);
            const nextActive = tabs[tabIdx] ?? tabs[tabIdx - 1] ?? null;
            if (tabs.length === 0 && prev.length > 1) {
              const next = prev.filter((_, i) => i !== idx);
              setActivePaneIndex(0);
              return next;
            }
            const next = [...prev];
            next[idx] = { tabs, active: nextActive };
            return next;
          });
          break;
        case "tab.next":
        case "tab.prev":
          setPanes((prev) => {
            const idx = Math.min(activePaneIndex, prev.length - 1);
            const pane = prev[idx];
            if (!pane || pane.tabs.length < 2 || !pane.active) return prev;
            const ai = pane.tabs.findIndex((t) => sameRef(t, pane.active));
            if (ai === -1) return prev;
            const n = pane.tabs.length;
            const nextIdx =
              id === "tab.next" ? (ai + 1) % n : (ai - 1 + n) % n;
            const next = [...prev];
            next[idx] = { ...pane, active: pane.tabs[nextIdx]! };
            return next;
          });
          break;
        case "zoom.in":
          stepActivePaneZoom(1);
          break;
        case "zoom.out":
          stepActivePaneZoom(-1);
          break;
        case "zoom.reset":
          stepActivePaneZoom(0);
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activePaneIndex, stepActivePaneZoom, shortcutsOpen]);

  const allRefs = useMemo<DocRef[]>(
    () => roots.flatMap((r) => r.files.map((p) => ({ root: r.name, path: p }))),
    [roots],
  );

  const openPanels = useMemo<DocRef[]>(() => {
    const seen = new Set<string>();
    const out: DocRef[] = [];
    for (const pane of panes) {
      for (const t of pane.tabs) {
        const key = `${t.root}\u0000${t.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
      }
    }
    return out;
  }, [panes]);

  if (err) {
    return (
      <div className="flex h-screen items-center justify-center text-destructive">
        {err}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <Layout
          left={
            <Sidebar
              roots={roots}
              active={active}
              loading={loading}
              onSelect={openDoc}
              onClose={() => setSidebarOpen(false)}
            />
          }
          leftOpen={sidebarOpen}
          center={
            <Viewer
              panes={panes}
              activePaneIndex={activePaneIndex}
              showRoot={roots.length > 1}
              chatOpen={chatOpen}
              sidebarOpen={sidebarOpen}
              onToggleChat={() => setChatOpen((v) => !v)}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
              onStatsChange={handleStatsChange}
              onOpenPalette={() => setPaletteOpen(true)}
              onPaneFocus={handlePaneFocus}
              onTabSelect={handleTabSelect}
              onTabClose={handleTabClose}
              onSplit={handleSplit}
              onClosePane={handleClosePane}
              onTabMove={handleTabMove}
              onTabDropNewPane={handleTabDropNewPane}
            />
          }
          right={
            <ChatPanel
              active={active}
              open={chatOpen}
              onClose={() => setChatOpen(false)}
            />
          }
          rightOpen={chatOpen}
        />
      </div>
      <StatusBar
        version={version}
        roots={roots}
        active={active}
        stats={docStats}
        git={git}
        zoom={panes[activePaneIndex]?.zoom ?? 1}
        canZoom={!!active}
        onZoom={stepActivePaneZoom}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onShowChangelog={() => {
          setChangelogSince(null);
          setChangelogOpen(true);
        }}
      />
      <ShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <ChangelogDialog
        open={changelogOpen}
        sinceVersion={changelogSince}
        onClose={() => setChangelogOpen(false)}
      />
      <CommandPalette
        open={paletteOpen}
        refs={allRefs}
        openTabs={openPanels}
        onSelect={(ref) => {
          openDoc(ref);
          setPaletteOpen(false);
        }}
        onClose={() => setPaletteOpen(false)}
        showRoot={roots.length > 1}
      />
    </div>
  );
}
