import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "muted" | "destructive" | "foreground";

type Props = {
  count: number;
  tone?: Tone;
  icon?: React.ReactNode;
  className?: string;
  title?: string;
};

const TONE_CLASS: Record<Tone, string> = {
  muted: "bg-muted/60 text-muted-foreground",
  destructive: "bg-destructive/10 text-destructive",
  foreground: "bg-muted/60 text-foreground",
};

export function CountBadge({ count, tone = "muted", icon, className, title }: Props) {
  return (
    <Badge
      variant="secondary"
      title={title}
      className={cn(
        "h-[18px] gap-1 rounded-md border-0 px-1.5 py-0 text-[10px] font-medium tabular-nums",
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon}
      {count.toLocaleString()}
    </Badge>
  );
}
