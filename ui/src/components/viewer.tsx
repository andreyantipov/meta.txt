import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchDoc } from "@/lib/api";

marked.setOptions({ gfm: true, breaks: false });

type Props = { path: string | null };

export function Viewer({ path }: Props) {
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      setRaw(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDoc(path)
      .then((text) => {
        if (!cancelled) setRaw(text);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const html = useMemo(() => (raw ? marked.parse(raw) : ""), [raw]);

  return (
    <div className="flex h-screen flex-1 flex-col">
      <header className="flex h-10 shrink-0 items-center border-b border-border px-6 font-mono text-xs text-muted-foreground">
        {path ?? "select a document"}
      </header>
      <ScrollArea className="flex-1">
        <article className="mx-auto max-w-3xl px-8 py-8">
          {loading && <div className="text-muted-foreground">loading…</div>}
          {error && <div className="text-destructive">{error}</div>}
          {!loading && !error && html && (
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: html as string }}
            />
          )}
          {!loading && !error && !path && (
            <div className="text-muted-foreground">
              pick a document on the left
            </div>
          )}
        </article>
      </ScrollArea>
    </div>
  );
}
