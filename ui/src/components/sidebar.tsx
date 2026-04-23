import { useMemo, useState } from "react";
import { FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Props = {
  files: string[];
  activePath: string | null;
  onSelect: (path: string) => void;
};

function groupByDir(files: string[]): Array<[string, string[]]> {
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const idx = f.lastIndexOf("/");
    const dir = idx === -1 ? "." : f.slice(0, idx);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(f);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function Sidebar({ files, activePath, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? files.filter((f) => f.toLowerCase().includes(q)) : files;
    return groupByDir(filtered);
  }, [files, query]);

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border p-3">
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            knol
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter…"
            className="h-8 pl-8"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <nav className="px-1.5 py-2">
          {groups.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              no .md files
            </div>
          )}
          {groups.map(([dir, items]) => (
            <div key={dir} className="mb-2">
              <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {dir}
              </div>
              {items.map((f) => {
                const name = dir === "." ? f : f.slice(dir.length + 1);
                const active = f === activePath;
                return (
                  <button
                    key={f}
                    onClick={() => onSelect(f)}
                    title={f}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      active &&
                        "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                    )}
                  >
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{name}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}
