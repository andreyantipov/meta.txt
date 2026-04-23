import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { Readability } from "@mozilla/readability";
import { fetchDoc, type DocRef } from "@/lib/api";
import { subscribe } from "@/lib/events";
import { cn } from "@/lib/utils";

marked.setOptions({ gfm: true, breaks: false });

export type DocKind = "markdown" | "text" | "html";

export type DocStats = {
  kind: DocKind;
  bytes: number;
  tokens: number;
  approx: boolean;
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
  onStats: (stats: DocStats | null) => void;
};

export function DocContent({ doc, onStats }: Props) {
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const markdownHtml = useMemo(
    () => (kind === "markdown" && raw ? (marked.parse(raw) as string) : ""),
    [kind, raw],
  );

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
    return { kind, bytes, tokens, approx: exactTokens === null };
  }, [kind, raw, exactTokens]);

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
    return (
      <iframe
        ref={iframeRef}
        srcDoc={raw ?? ""}
        title={`${doc.root}/${doc.path}`}
        className="h-full w-full border-0 bg-white"
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
      >
        {loading && <div className="text-muted-foreground">loading…</div>}
        {error && <div className="text-destructive">{error}</div>}
        {!loading && !error && kind === "markdown" && markdownHtml && (
          <div
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
          <div className="markdown-body">
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
