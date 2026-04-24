import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
type Resolved = "light" | "dark";

export const THEME_KEY = "meta.txt:theme";

export function getStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

export function resolveMode(mode: ThemeMode): Resolved {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

export function applyTheme(mode: ThemeMode): Resolved {
  const resolved = resolveMode(mode);
  const el = document.documentElement;
  el.classList.toggle("dark", resolved === "dark");
  el.style.colorScheme = resolved;
  return resolved;
}

const listeners = new Set<(r: Resolved) => void>();

function emit(r: Resolved) {
  for (const l of listeners) l(r);
}

const modeListeners = new Set<(m: ThemeMode) => void>();
let currentMode: ThemeMode = getStoredMode();

function setModeGlobal(m: ThemeMode) {
  currentMode = m;
  try {
    localStorage.setItem(THEME_KEY, m);
  } catch {}
  const r = applyTheme(m);
  for (const l of modeListeners) l(m);
  emit(r);
}

if (typeof window !== "undefined") {
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener?.("change", () => {
    if (currentMode !== "system") return;
    const r = applyTheme("system");
    emit(r);
  });
}

export function useTheme(): {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
} {
  const [mode, setMode] = useState<ThemeMode>(currentMode);
  const [resolved, setResolved] = useState<Resolved>(() => resolveMode(mode));

  useEffect(() => {
    modeListeners.add(setMode);
    const unsub = subscribeResolved(setResolved);
    // Sync on mount in case another hook changed state before we subscribed.
    setMode(currentMode);
    setResolved(currentResolved());
    return () => {
      modeListeners.delete(setMode);
      unsub();
    };
  }, []);

  const cycle = () => {
    const next =
      currentMode === "system"
        ? "light"
        : currentMode === "light"
          ? "dark"
          : "system";
    setModeGlobal(next);
  };

  return { mode, resolved, setMode: setModeGlobal, cycle };
}

export function subscribeResolved(fn: (r: Resolved) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function currentResolved(): Resolved {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
