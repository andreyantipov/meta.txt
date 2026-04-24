// Per-root accent color. Hues are distributed evenly across the color wheel
// based on the registered roots, so N projects get N well-separated colors
// (no collisions from hashing). Falls back to a hash if a name isn't
// registered yet (e.g. a tab rendering before FileTree has mounted).
// Uses CSS light-dark() so the same dot renders readably on both themes.

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

let hueByName = new Map<string, number>();

export function setRootNames(names: readonly string[]): void {
  const m = new Map<string, number>();
  const n = Math.max(1, names.length);
  // Stable insertion-order-based spacing. Start at an offset that keeps the
  // first root from hitting pure red, which clashes with destructive states.
  const offset = 210;
  for (let i = 0; i < names.length; i++) {
    m.set(names[i]!, Math.floor((offset + (i * 360) / n) % 360));
  }
  hueByName = m;
}

export function rootColor(name: string): string {
  const hue = hueByName.get(name) ?? hashString(name) % 360;
  return `light-dark(hsl(${hue} 72% 40%), hsl(${hue} 82% 62%))`;
}
