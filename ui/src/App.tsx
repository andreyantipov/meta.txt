import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Viewer } from "@/components/viewer";
import type { DocStats } from "@/components/doc-content";
import type { PaneState } from "@/components/split-viewer";
import { CommandPalette } from "@/components/command-palette";
import { ChatPanel } from "@/components/chat-panel";
import { Layout } from "@/components/layout";
import { StatusBar } from "@/components/status-bar";
import { fetchDocs, type DocRef, type RootEntry } from "@/lib/api";
import { subscribe } from "@/lib/events";

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
      .map((p: { tabs?: unknown; active?: unknown }) => ({
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
    return { tabs, active };
  });
}

export default function App() {
  const [roots, setRoots] = useState<RootEntry[]>([]);
  const [version, setVersion] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [docStats, setDocStats] = useState<DocStats | null>(null);

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
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (active) history.replaceState(null, "", `#${encodeRef(active)}`);
  }, [active]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "k") {
        e.preventDefault();
        e.stopPropagation();
        setPaletteOpen((v) => !v);
      } else if (mod && k === "j") {
        e.preventDefault();
        e.stopPropagation();
        setChatOpen((v) => !v);
      } else if (mod && k === "b") {
        e.preventDefault();
        e.stopPropagation();
        setSidebarOpen((v) => !v);
      } else if (mod && k === "w") {
        e.preventDefault();
        e.stopPropagation();
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
      } else if (mod && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        e.stopPropagation();
        setPanes((prev) => {
          const idx = Math.min(activePaneIndex, prev.length - 1);
          const pane = prev[idx];
          if (!pane || pane.tabs.length < 2 || !pane.active) return prev;
          const ai = pane.tabs.findIndex((t) => sameRef(t, pane.active));
          if (ai === -1) return prev;
          const n = pane.tabs.length;
          const nextIdx =
            e.key === "]" ? (ai + 1) % n : (ai - 1 + n) % n;
          const next = [...prev];
          next[idx] = { ...pane, active: pane.tabs[nextIdx]! };
          return next;
        });
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activePaneIndex]);

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

  const [mod, setMod] = useState("⌘");
  useEffect(() => {
    setMod(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl");
  }, []);

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
              onTabMove={handleTabMove}
              mod={mod}
            />
          }
          right={
            <ChatPanel active={active} onClose={() => setChatOpen(false)} />
          }
          rightOpen={chatOpen}
        />
      </div>
      <StatusBar
        version={version}
        roots={roots}
        active={active}
        stats={docStats}
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
