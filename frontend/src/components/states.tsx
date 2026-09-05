import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string | undefined;
  icon?: ReactNode | undefined;
  action?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted-surface/40 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
        {icon ?? <SearchX className="h-5 w-5" />}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something failed",
  message,
  onRetry,
  className,
}: {
  title?: string | undefined;
  message?: string | undefined;
  onRetry?: (() => void) | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn("rounded-lg border border-danger/40 bg-danger/5 px-5 py-6", className)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {message ? <p className="mt-1 text-sm break-words text-muted-foreground">{message}</p> : null}
          {onRetry ? (
            <Button variant="outline" size="sm" className="mt-4 min-h-11" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3 rounded-md border border-border bg-card/60 p-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className="h-4 w-full bg-muted-surface" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("panel space-y-3 p-5", className)} aria-busy="true">
      <Skeleton className="h-4 w-1/3 bg-muted-surface" />
      <Skeleton className="h-8 w-1/2 bg-muted-surface" />
      <Skeleton className="h-3 w-2/3 bg-muted-surface" />
    </div>
  );
}
