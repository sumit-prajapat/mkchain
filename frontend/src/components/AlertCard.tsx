import { ActivityIcon, Check, Globe, ShieldAlert, Waves } from "lucide-react";
import { AddressBadge } from "@/components/AddressBadge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/chain";
import type { AlertItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPES: Record<string, { label: string; icon: typeof Waves; tone: string }> = {
  new_tx: { label: "New transaction", icon: ActivityIcon, tone: "text-primary border-primary/40 bg-primary/10" },
  high_risk: { label: "High risk", icon: ShieldAlert, tone: "text-danger border-danger/40 bg-danger/10" },
  mixer: { label: "Mixer", icon: Waves, tone: "text-warning border-warning/40 bg-warning/10" },
  darkweb: { label: "Dark web", icon: Globe, tone: "text-purple border-purple/40 bg-purple/10" },
};

export function AlertCard({ alert, onRead }: { alert: AlertItem; onRead?: (a: AlertItem) => void }) {
  const type = (alert.type ?? alert.alert_type ?? "new_tx").toLowerCase();
  const meta = TYPES[type] ?? TYPES["new_tx"]!;
  const Icon = meta.icon;
  const read = alert.is_read ?? alert.read ?? false;

  return (
    <div className={cn("panel p-4 transition-colors", !read && "ring-1 ring-primary/25")}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", meta.tone)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase", meta.tone)}>{meta.label}</span>
            {!read ? <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" aria-label="Unread" /> : null}
            <span className="font-data text-[11px] text-muted-foreground">{relativeTime(alert.created_at ?? alert.timestamp)}</span>
          </div>
          <p className="mt-2 text-sm break-words text-foreground">{alert.message ?? "Activity detected on a watched address."}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {alert.address ? <AddressBadge address={alert.address} /> : null}
            {alert.value !== undefined && alert.value !== null ? (
              <span className="font-data text-xs text-muted-foreground">value {String(alert.value)}</span>
            ) : null}
          </div>
        </div>
        {!read && onRead ? (
          <Button variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={() => onRead(alert)}>
            <Check className="h-4 w-4" /> Read
          </Button>
        ) : null}
      </div>
    </div>
  );
}
