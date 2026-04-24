import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { X } from "@phosphor-icons/react";
import { fetchChangelog } from "@/lib/api";
import { cmpVersion } from "@/lib/version";

type Props = {
  open: boolean;
  onClose: () => void;
  sinceVersion?: string | null;
};

type Section = { version: string; body: string };

function parseSections(md: string): Section[] {
  const out: Section[] = [];
  const lines = md.split("\n");
  const re = /^##\s+\[?(\d+\.\d+\.\d+[^\]\s]*)\]?/;
  let cur: { version: string; body: string[] } | null = null;
  for (const l of lines) {
    const m = l.match(re);
    if (m) {
      if (cur) out.push({ version: cur.version, body: cur.body.join("\n") });
      cur = { version: m[1]!, body: [l] };
    } else if (cur) {
      cur.body.push(l);
    }
  }
  if (cur) out.push({ version: cur.version, body: cur.body.join("\n") });
  return out;
}

export function ChangelogDialog({ open, onClose, sinceVersion }: Props) {
  const [md, setMd] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMd(null);
    setErr(null);
    fetchChangelog()
      .then(setMd)
      .catch((e) => setErr(String(e)));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const html = useMemo(() => {
    if (!md) return "";
    const sections = parseSections(md);
    const pick = sinceVersion
      ? sections.filter((s) => cmpVersion(s.version, sinceVersion) > 0)
      : sections;
    if (pick.length === 0) return "";
    return marked.parse(pick.map((s) => s.body).join("\n\n")) as string;
  }, [md, sinceVersion]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
          <div className="text-sm font-medium">
            {sinceVersion ? `What's new since v${sinceVersion}` : "Changelog"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            title="Close"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
          {err && <div className="text-sm text-destructive">{err}</div>}
          {!md && !err && (
            <div className="text-sm text-muted-foreground">loading…</div>
          )}
          {md && html === "" && (
            <div className="text-sm text-muted-foreground">
              You're up to date.
            </div>
          )}
          {md && html !== "" && (
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
