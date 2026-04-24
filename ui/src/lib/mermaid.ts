import { currentResolved, subscribeResolved } from "@/lib/theme";

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
let lastTheme: "light" | "dark" | null = null;

function initWith(
  m: typeof import("mermaid").default,
  resolved: "light" | "dark",
) {
  m.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: resolved === "dark" ? "dark" : "default",
    fontFamily: "inherit",
    suppressErrorRendering: true,
  });
  lastTheme = resolved;
}

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      initWith(m.default, currentResolved());
      return m.default;
    });
  }
  return mermaidPromise;
}

subscribeResolved((resolved) => {
  if (!mermaidPromise) return;
  void mermaidPromise.then((m) => initWith(m, resolved));
});

let counter = 0;

export async function renderMermaid(container: HTMLElement, signal?: AbortSignal): Promise<void> {
  const fresh = Array.from(
    container.querySelectorAll<HTMLElement>("pre > code.language-mermaid"),
  );
  const rendered = Array.from(
    container.querySelectorAll<HTMLElement>(
      "div.mermaid-block[data-mermaid-source]",
    ),
  );
  if (fresh.length === 0 && rendered.length === 0) return;

  const mermaid = await loadMermaid();
  if (signal?.aborted) return;

  const wanted = currentResolved();
  if (lastTheme !== wanted) initWith(mermaid, wanted);

  const renderOne = async (source: string, target: HTMLElement): Promise<HTMLElement | null> => {
    const id = `mmd-${Date.now().toString(36)}-${counter++}`;
    try {
      const { svg } = await mermaid.render(id, source);
      if (signal?.aborted) return null;
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-block";
      wrapper.dataset.mermaidSource = source;
      wrapper.dataset.mermaidTheme = wanted;
      wrapper.innerHTML = svg;
      target.replaceWith(wrapper);
      return wrapper;
    } catch (err) {
      if (signal?.aborted) return null;
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
      const msg = err instanceof Error ? err.message : String(err);
      const fallback = document.createElement("div");
      fallback.className = "mermaid-error";
      fallback.textContent = `mermaid: ${msg}`;
      target.replaceWith(fallback);
      return null;
    }
  };

  for (const code of fresh) {
    const pre = code.parentElement;
    if (!pre) continue;
    const source = code.textContent ?? "";
    await renderOne(source, pre);
    if (signal?.aborted) return;
  }

  // Re-render already-rendered diagrams when theme changed under them.
  for (const wrapper of rendered) {
    if (wrapper.dataset.mermaidTheme === wanted) continue;
    const source = wrapper.dataset.mermaidSource ?? "";
    if (!source) continue;
    await renderOne(source, wrapper);
    if (signal?.aborted) return;
  }
}
