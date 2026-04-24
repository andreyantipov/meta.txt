import { useEffect, useState } from "react";

export type Chord = {
  key: string;
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export type ShortcutDef = {
  id: string;
  label: string;
  group: string;
  defaults: Chord[];
};

export const DEFINITIONS: ShortcutDef[] = [
  {
    id: "palette.toggle",
    group: "Navigation",
    label: "Command palette",
    defaults: [{ alt: true, key: "k" }],
  },
  {
    id: "chat.toggle",
    group: "Panels",
    label: "Toggle chat",
    defaults: [{ alt: true, key: "j" }],
  },
  {
    id: "sidebar.toggle",
    group: "Panels",
    label: "Toggle sidebar",
    defaults: [{ alt: true, key: "b" }],
  },
  {
    id: "outline.toggle",
    group: "Panels",
    label: "Toggle outline",
    defaults: [{ alt: true, key: "o" }],
  },
  {
    id: "refs.toggle",
    group: "Panels",
    label: "Toggle references",
    defaults: [{ alt: true, key: "r" }],
  },
  {
    id: "tab.close",
    group: "Tabs",
    label: "Close tab",
    defaults: [{ alt: true, key: "w" }],
  },
  {
    id: "tab.next",
    group: "Tabs",
    label: "Next tab",
    defaults: [{ alt: true, key: "]" }],
  },
  {
    id: "tab.prev",
    group: "Tabs",
    label: "Previous tab",
    defaults: [{ alt: true, key: "[" }],
  },
  {
    id: "zoom.in",
    group: "View",
    label: "Zoom in",
    defaults: [{ alt: true, key: "=" }],
  },
  {
    id: "zoom.out",
    group: "View",
    label: "Zoom out",
    defaults: [{ alt: true, key: "-" }],
  },
  {
    id: "zoom.reset",
    group: "View",
    label: "Reset zoom",
    defaults: [{ alt: true, key: "0" }],
  },
  {
    id: "shortcuts.show",
    group: "Help",
    label: "Show keyboard shortcuts",
    defaults: [{ key: "?" }],
  },
];

const STORAGE_KEY = "meta.txt:keymap:v2";

type Overrides = Record<string, Chord[]>;

let overrides: Overrides = loadOverrides();
const subs = new Set<() => void>();

function loadOverrides(): Overrides {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOverrides() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {}
}

function notify() {
  for (const fn of subs) fn();
}

function defOf(id: string): ShortcutDef | undefined {
  return DEFINITIONS.find((d) => d.id === id);
}

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return t.isContentEditable;
}

const CODE_TO_KEY: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Backquote: "`",
};

export function normalizeEventKey(e: KeyboardEvent): string {
  // Physical-key fallback: Alt on Mac rewrites e.key to unicode (Alt+B → ∫).
  // Use e.code to recover the bare letter/digit/symbol.
  const code = e.code ?? "";
  const letter = code.match(/^Key([A-Z])$/)?.[1];
  if (letter) return letter.toLowerCase();
  const digit = code.match(/^Digit(\d)$/)?.[1];
  if (digit) return digit;
  if (CODE_TO_KEY[code]) return CODE_TO_KEY[code]!;
  return e.key.toLowerCase();
}

export function chordMatches(c: Chord, e: KeyboardEvent): boolean {
  const mod = e.metaKey || e.ctrlKey;
  if (!!c.mod !== mod) return false;
  if (!!c.alt !== e.altKey) return false;
  return normalizeEventKey(e) === c.key.toLowerCase();
}

export function chordEqual(a: Chord, b: Chord): boolean {
  return (
    !!a.mod === !!b.mod &&
    !!a.alt === !!b.alt &&
    !!a.shift === !!b.shift &&
    a.key.toLowerCase() === b.key.toLowerCase()
  );
}

export function getChords(id: string): Chord[] {
  const ov = overrides[id];
  if (ov) return ov;
  return defOf(id)?.defaults ?? [];
}

export function isOverridden(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, id);
}

export function findConflicts(chord: Chord, excludeId: string): string[] {
  const out: string[] = [];
  for (const d of DEFINITIONS) {
    if (d.id === excludeId) continue;
    const chords = getChords(d.id);
    if (chords.some((c) => chordEqual(c, chord))) out.push(d.id);
  }
  return out;
}

export function setChord(id: string, chord: Chord) {
  const next: Overrides = { ...overrides };
  for (const d of DEFINITIONS) {
    if (d.id === id) continue;
    const cur = next[d.id] ?? d.defaults;
    const filtered = cur.filter((c) => !chordEqual(c, chord));
    if (filtered.length !== cur.length) next[d.id] = filtered;
  }
  next[id] = [chord];
  overrides = next;
  saveOverrides();
  notify();
}

export function resetChord(id: string) {
  if (!Object.prototype.hasOwnProperty.call(overrides, id)) return;
  const next = { ...overrides };
  delete next[id];
  overrides = next;
  saveOverrides();
  notify();
}

export function resetAll() {
  overrides = {};
  saveOverrides();
  notify();
}

export function matchShortcut(e: KeyboardEvent): string | null {
  const editable = isEditable(e.target);
  for (const d of DEFINITIONS) {
    const chords = getChords(d.id);
    for (const c of chords) {
      if (editable && !c.mod && !c.alt) continue;
      if (chordMatches(c, e)) return d.id;
    }
  }
  return null;
}

export function useKeymap() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  }, []);
  return {
    getChords,
    setChord,
    resetChord,
    resetAll,
    isOverridden,
    findConflicts,
  };
}

export type Platform = "mac" | "pc";

export function getPlatform(): Platform {
  if (typeof navigator === "undefined") return "pc";
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "mac" : "pc";
}

function formatKey(k: string): string {
  const map: Record<string, string> = {
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    escape: "Esc",
    enter: "↵",
    backspace: "⌫",
    tab: "Tab",
    " ": "Space",
    space: "Space",
  };
  const low = k.toLowerCase();
  return map[low] ?? (k.length === 1 ? k.toUpperCase() : k);
}

export function formatChord(c: Chord, platform: Platform): string[] {
  const parts: string[] = [];
  if (c.mod) parts.push(platform === "mac" ? "⌘" : "Ctrl");
  if (c.alt) parts.push(platform === "mac" ? "⌥" : "Alt");
  if (c.shift) parts.push(platform === "mac" ? "⇧" : "Shift");
  parts.push(formatKey(c.key));
  return parts;
}

export function useShortcut(id: string): {
  chord: Chord | null;
  parts: string[];
  title: string;
} {
  useKeymap();
  const platform = getPlatform();
  const chords = getChords(id);
  const chord = chords[0] ?? null;
  if (!chord) return { chord: null, parts: [], title: "" };
  const parts = formatChord(chord, platform);
  const title = platform === "mac" ? parts.join("") : parts.join("+");
  return { chord, parts, title };
}
