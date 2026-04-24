import { useMemo } from "react";
import {
  ArrowBendDownLeft,
  ArrowRight,
  CaretDown,
  CaretRight,
  Circle,
  Link as LinkIcon,
  Warning,
} from "@phosphor-icons/react";
import type { DocRef, Edge, EdgeKind, EdgeStatus } from "@/lib/api";
import { useBackrefs, useRefs } from "@/lib/refs";
import { CountBadge } from "@/components/count-badge";
import { useShortcut } from "@/lib/keymap";
import { cn } from "@/lib/utils";

type Props = {
  active: DocRef | null;
  expanded: boolean;
  onToggle: () => void;
};

type Direction = "incoming" | "outgoing";

type Group = {
  key: string;
  root: string;
  path: string;
  anchor?: string;
  kind: EdgeKind;
  status: EdgeStatus;
  count: number;
};

const KIND_RANK: Record<EdgeKind, number> = { link: 3, ref: 2, mention: 1 };
const STATUS_RANK: Record<EdgeStatus, number> = {
  "broken-target": 4,
  "broken-anchor": 3,
  "out-of-scope": 2,
  ok: 1,
};

function dedupe(edges: Edge[], direction: Direction): Group[] {
  const map = new Map<string, Group>();
  for (const e of edges) {
    const ep = direction === "incoming" ? e.from : e.to;
    const anchor = direction === "outgoing" ? e.to.anchor : undefined;
    const key = `${ep.root} ${ep.path} ${anchor ?? ""}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        root: ep.root,
        path: ep.path,
        anchor,
        kind: e.kind,
        status: e.status,
        count: 1,
      });
      continue;
    }
    existing.count++;
    if (KIND_RANK[e.kind] > KIND_RANK[existing.kind]) existing.kind = e.kind;
    if (STATUS_RANK[e.status] > STATUS_RANK[existing.status])
      existing.status = e.status;
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function SidebarReferences({ active, expanded, onToggle }: Props) {
  const outgoingAll = useRefs(active);
  const incoming = useBackrefs(active);
  const sc = useShortcut("refs.toggle");

  const buckets = useMemo(() => {
    const all = dedupe(outgoingAll, "outgoing");
    return {
      incoming: dedupe(incoming, "incoming"),
      okOut: all.filter((g) => g.status === "ok"),
      broken: all.filter(
        (g) => g.status === "broken-target" || g.status === "broken-anchor",
      ),
      oos: all.filter((g) => g.status === "out-of-scope"),
    };
  }, [outgoingAll, incoming]);

  const totalVisible =
    buckets.incoming.length +
    buckets.okOut.length +
    buckets.broken.length +
    buckets.oos.length;
  const hasAny = !!active && totalVisible > 0;

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        title={
          sc.title
            ? `${expanded ? "Collapse" : "Expand"} references (${sc.title})`
            : expanded
              ? "Collapse references"
              : "Expand references"
        }
        className="flex h-[42px] shrink-0 items-center gap-1.5 border-t border-border bg-background px-3 text-xs font-medium text-foreground/80 hover:bg-muted"
      >
        {expanded ? (
          <CaretDown className="size-3 shrink-0" weight="bold" />
        ) : (
          <CaretRight className="size-3 shrink-0" weight="bold" />
        )}
        <span>References</span>
        <span className="ml-auto flex items-center gap-1">
          {sc.parts.length > 0 && (
            <span className="shortcut-hint pointer-events-none shrink-0 items-center gap-0.5 mr-1">
              {sc.parts.map((p, i) => (
                <kbd
                  key={i}
                  className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px] leading-none text-muted-foreground"
                >
                  {p}
                </kbd>
              ))}
            </span>
          )}
          {buckets.incoming.length > 0 && (
            <CountBadge
              count={buckets.incoming.length}
              icon={<ArrowBendDownLeft className="size-2.5" />}
              title={`Referenced by ${buckets.incoming.length}`}
            />
          )}
          {buckets.okOut.length > 0 && (
            <CountBadge
              count={buckets.okOut.length}
              icon={<ArrowRight className="size-2.5" />}
              title={`Links to ${buckets.okOut.length}`}
            />
          )}
          {buckets.broken.length > 0 && (
            <CountBadge
              count={buckets.broken.length}
              tone="destructive"
              icon={<Warning className="size-2.5" weight="bold" />}
              title={`Broken ${buckets.broken.length}`}
            />
          )}
          {buckets.oos.length > 0 && (
            <CountBadge
              count={buckets.oos.length}
              icon={<Circle className="size-2.5" weight="fill" />}
              title={`Out of scope ${buckets.oos.length}`}
            />
          )}
        </span>
      </button>
      {expanded &&
        (hasAny ? (
          <div className="min-h-0 flex-1 overflow-y-auto py-1 text-xs">
            {buckets.incoming.length > 0 && (
              <Section
                icon={<ArrowBendDownLeft className="size-3" />}
                title="Referenced by"
                groups={buckets.incoming}
              />
            )}
            {buckets.okOut.length > 0 && (
              <Section
                icon={<ArrowRight className="size-3" />}
                title="Links to"
                groups={buckets.okOut}
              />
            )}
            {buckets.broken.length > 0 && (
              <Section
                icon={<Warning className="size-3 text-destructive" />}
                title="Broken"
                groups={buckets.broken}
                badgeTone="destructive"
              />
            )}
            {buckets.oos.length > 0 && (
              <Section
                icon={<Circle className="size-3" weight="fill" />}
                title="Out of scope"
                groups={buckets.oos}
              />
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <LinkIcon
              size={24}
              weight="duotone"
              className="text-muted-foreground/40"
            />
            <div className="text-xs text-muted-foreground/70">
              {active ? "No references" : "No document selected"}
            </div>
          </div>
        ))}
    </>
  );
}

type SectionProps = {
  icon: React.ReactNode;
  title: string;
  groups: Group[];
  badgeTone?: "muted" | "destructive";
};

function Section({ icon, title, groups, badgeTone = "muted" }: SectionProps) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/80">
        {icon}
        <span>{title}</span>
        <CountBadge
          count={groups.length}
          tone={badgeTone}
          className="ml-auto normal-case tracking-normal"
        />
      </div>
      <ul>
        {groups.map((g) => (
          <GroupRow key={g.key} group={g} />
        ))}
      </ul>
    </div>
  );
}

function GroupRow({ group }: { group: Group }) {
  const label = group.anchor ? `${group.path}#${group.anchor}` : group.path;
  const isBroken =
    group.status === "broken-target" || group.status === "broken-anchor";
  const isOos = group.status === "out-of-scope";
  const clickable = !isBroken && !isOos;
  const open = () => {
    if (!clickable) return;
    window.dispatchEvent(
      new CustomEvent("meta-open-ref", {
        detail: { root: group.root, path: group.path },
      }),
    );
  };
  return (
    <li>
      <button
        type="button"
        onClick={open}
        title={`${group.root}/${label}${group.count > 1 ? ` (×${group.count})` : ""}`}
        className={cn(
          "flex w-full items-center gap-1.5 px-3 py-0.5 text-left transition-colors",
          isBroken
            ? "text-destructive/90 hover:bg-destructive/5"
            : isOos
              ? "text-muted-foreground/80 hover:bg-muted/30"
              : group.kind === "mention"
                ? "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                : "text-foreground/90 hover:bg-muted/50",
        )}
      >
        {isBroken && (
          <Warning
            className="size-3 shrink-0 text-destructive"
            weight="bold"
          />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            isBroken && "line-through decoration-destructive/60",
          )}
        >
          {label}
        </span>
        {group.count > 1 && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
            ×{group.count}
          </span>
        )}
        {group.kind === "ref" && (
          <span className="shrink-0 rounded border border-border px-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            ref
          </span>
        )}
        {group.kind === "mention" && (
          <span className="shrink-0 text-[10px] text-muted-foreground/70">
            ~
          </span>
        )}
      </button>
    </li>
  );
}
