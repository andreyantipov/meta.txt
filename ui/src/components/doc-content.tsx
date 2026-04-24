import { useEffect, useMemo, useRef, useState } from "react";
import { Readability } from "@mozilla/readability";
// Direct import avoids `reading-time/lib/stream` (Node-only Transform) being
// pulled in by the package's CJS entry, which Vite externalizes and crashes on.
// @ts-expect-error — no .d.ts for the lib path
import readingTime from "reading-time/lib/reading-time";
import { fetchDoc, type DocRef } from "@/lib/api";
import { subscribe } from "@/lib/events";
import { cn } from "@/lib/utils";
import { renderMermaid } from "@/lib/mermaid";
import {
  extractHtmlHeadings,
  extractMarkdownHeadings,
  injectHeadingIds,
  parseMarkdown,
} from "@/lib/toc";
import { setOutline, clearOutline } from "@/lib/outlines";
import { useTheme } from "@/lib/theme";

export type DocKind = "markdown" | "text" | "html";

export type DocStats = {
  kind: DocKind;
  bytes: number;
  tokens: number;
  approx: boolean;
  readMinutes: number;
  words: number;
};

function kindOf(path: string): DocKind {
  const lower = path.toLowerCase();
  if (/\.html?$/i.test(lower)) return "html";
  if (/\.txt$/i.test(lower)) return "text";
  return "markdown";
}

type Encoder = (text: string) => number[];
let encoderPromise: Promise<Encoder> | null = null;
function loadEncoder(): Promise<Encoder> {
  if (!encoderPromise) {
    encoderPromise = import("gpt-tokenizer/model/gpt-4o").then(
      (m) => m.encode as Encoder,
    );
  }
  return encoderPromise;
}

const FAKE_BASE = "http://meta-txt.local/";

// Injected as the last <head> child so author styles can't easily win.
// Tuned to be safe — only colors and link/code defaults; leaves layout alone.
const DARK_INJECT = `<style>
:root { color-scheme: dark; }
html, body { background: #0b0b0c !important; color: #e6e6e6 !important; }
a { color: #7aa2f7 !important; }
a:visited { color: #bb9af7 !important; }
hr { border-color: #2a2a2d !important; }
code, kbd, samp, pre, tt { background: #1a1a1c !important; color: #e6e6e6 !important; }
table, th, td { border-color: #2a2a2d !important; }
th { background: #1a1a1c !important; }
blockquote { border-left-color: #3a3a3d !important; color: #a8a8ad !important; }
::selection { background: #2c4f8a !important; color: #fff !important; }
</style>`;

function withDarkTheme(html: string): string {
  // Inject just before </head>; if no </head>, prepend at start of <body> or doc.
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${DARK_INJECT}</head>`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${DARK_INJECT}`);
  }
  return DARK_INJECT + html;
}

type Article = {
  title: string | null;
  byline: string | null;
  content: string;
};

function extractReader(html: string): Article | null {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const base = doc.createElement("base");
    base.href = FAKE_BASE;
    doc.head.insertBefore(base, doc.head.firstChild);
    const reader = new Readability(doc, { charThreshold: 200 });
    const article = reader.parse();
    if (!article?.content) return null;
    const container = document.createElement("div");
    container.innerHTML = article.content;
    container
      .querySelectorAll("img, picture, figure, svg, video, iframe")
      .forEach((el) => el.remove());
    container.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href");
      if (!href) return;
      if (/^https?:/i.test(href)) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }
    });
    return {
      title: article.title ?? null,
      byline: article.byline ?? null,
      content: container.innerHTML,
    };
  } catch {
    return null;
  }
}

type Props = {
  doc: DocRef;
  zoom?: number;
  onStats: (stats: DocStats | null) => void;
};

export function DocContent({ doc, zoom = 1, onStats }: Props) {
  const { resolved: themeResolved } = useTheme();
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const markdownRef = useRef<HTMLDivElement>(null);
  const htmlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = (withSpinner: boolean) => {
      if (withSpinner) setLoading(true);
      setError(null);
      return fetchDoc(doc)
        .then((text) => {
          if (!cancelled) setRaw(text);
        })
        .catch((err) => {
          if (!cancelled) setError(String(err));
        })
        .finally(() => {
          if (!cancelled && withSpinner) setLoading(false);
        });
    };
    load(true);
    const unsub = subscribe((evt) => {
      if (
        evt.type === "doc:changed" &&
        evt.root === doc.root &&
        evt.path === doc.path
      )
        load(false);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [doc.root, doc.path]);

  const kind: DocKind = useMemo(() => kindOf(doc.path), [doc.path]);

  const [markdownHtml, setMarkdownHtml] = useState<string>("");

  useEffect(() => {
    if (kind !== "markdown") {
      setMarkdownHtml("");
      return;
    }
    if (raw === null) {
      setMarkdownHtml("");
      return;
    }
    // Fast pass: regex-scan headings so the outline appears before the full parse.
    setOutline(doc, extractMarkdownHeadings(raw));

    // Full parse runs after paint so large docs don't block the shell.
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const { html, headings } = parseMarkdown(raw);
      if (cancelled) return;
      setMarkdownHtml(html);
      setOutline(doc, headings);
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    let handle: number;
    if (typeof w.requestIdleCallback === "function") {
      handle = w.requestIdleCallback(run, { timeout: 200 });
    } else {
      handle = window.setTimeout(run, 0);
    }
    return () => {
      cancelled = true;
      if (typeof w.cancelIdleCallback === "function") {
        try {
          w.cancelIdleCallback(handle);
        } catch {}
      }
      clearTimeout(handle);
    };
  }, [kind, raw, doc.root, doc.path]);

  const [exactTokens, setExactTokens] = useState<number | null>(null);

  useEffect(() => {
    if (raw === null) {
      setExactTokens(null);
      return;
    }
    let cancelled = false;
    setExactTokens(null);
    loadEncoder()
      .then((encode) => {
        if (cancelled) return;
        setExactTokens(encode(raw).length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [raw]);

  const stats = useMemo<DocStats | null>(() => {
    if (raw === null) return null;
    const bytes = new Blob([raw]).size;
    const tokens = exactTokens ?? Math.ceil(raw.length / 4);
    const rt = readingTime(raw);
    return {
      kind,
      bytes,
      tokens,
      approx: exactTokens === null,
      readMinutes: rt.minutes,
      words: rt.words,
    };
  }, [kind, raw, exactTokens]);

  useEffect(() => {
    if (kind !== "markdown" || !markdownHtml) return;
    const el = markdownRef.current;
    if (!el) return;
    const controller = new AbortController();
    renderMermaid(el, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [kind, markdownHtml, themeResolved]);

  useEffect(() => {
    if (kind !== "markdown") return;
    return () => {
      clearOutline(doc);
    };
  }, [kind, doc.root, doc.path]);

  useEffect(() => {
    if (kind !== "html" || raw === null) return;
    // Always populate outline from raw HTML so iframe-fallback files still
    // get a TOC. When Readability renders into the DOM, the post-mount effect
    // below replaces these with the live elements (so click-to-scroll works).
    setOutline(doc, extractHtmlHeadings(raw));
    return () => {
      clearOutline(doc);
    };
  }, [kind, raw, doc.root, doc.path]);

  useEffect(() => {
    if (kind !== "html") return;
    const el = htmlRef.current;
    if (!el) return;
    const headings = injectHeadingIds(el);
    setOutline(doc, headings);
  }, [kind, raw, doc.root, doc.path]);

  const onStatsRef = useRef(onStats);
  useEffect(() => {
    onStatsRef.current = onStats;
  }, [onStats]);
  useEffect(() => {
    onStatsRef.current(stats);
  }, [stats]);

  const article = useMemo(
    () =>
      kind === "html" && raw ? extractReader(raw) : null,
    [kind, raw, doc.root, doc.path],
  );

  const iframeFallback = kind === "html" && raw && !article;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeFallback) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const forward = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && (k === "k" || k === "j" || k === "b")) {
        e.preventDefault();
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: e.key,
            code: e.code,
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
          }),
        );
      }
    };

    const attach = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      win.addEventListener("keydown", forward);
    };

    iframe.addEventListener("load", attach);
    if (iframe.contentDocument?.readyState === "complete") attach();

    return () => {
      iframe.removeEventListener("load", attach);
      try {
        iframe.contentWindow?.removeEventListener("keydown", forward);
      } catch {}
    };
  }, [iframeFallback, raw]);

  if (iframeFallback) {
    const src = themeResolved === "dark" ? withDarkTheme(raw ?? "") : (raw ?? "");
    return (
      <iframe
        ref={iframeRef}
        srcDoc={src}
        title={`${doc.root}/${doc.path}`}
        className={cn(
          "h-full w-full border-0",
          themeResolved === "dark" ? "bg-[#0b0b0c]" : "bg-white",
        )}
      />
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden">
      <article
        className={cn(
          "mx-auto py-8",
          kind === "text" ? "max-w-4xl px-8" : "max-w-3xl px-8",
        )}
        style={zoom !== 1 ? { zoom } : undefined}
      >
        {loading && <div className="text-muted-foreground">loading…</div>}
        {error && <div className="text-destructive">{error}</div>}
        {!loading && !error && kind === "markdown" && markdownHtml && (
          <div
            ref={markdownRef}
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: markdownHtml }}
          />
        )}
        {!loading && !error && kind === "text" && raw !== null && (
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">
            {raw}
          </pre>
        )}
        {!loading && !error && kind === "html" && article && (
          <div ref={htmlRef} className="markdown-body">
            {article.title && <h1>{article.title}</h1>}
            {article.byline && (
              <p className="text-muted-foreground">{article.byline}</p>
            )}
            <div dangerouslySetInnerHTML={{ __html: article.content }} />
          </div>
        )}
      </article>
    </div>
  );
}
