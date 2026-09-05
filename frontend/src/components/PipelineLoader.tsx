import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const ANALYSIS_STEPS = [
  "Fetching transactions",
  "Building transaction graph",
  "Running pattern detectors",
  "Scoring risk (Random Forest, 21 features)",
  "Checking dark web OSINT database",
  "Generating analyst summary",
];

interface Props {
  steps?: string[] | undefined;
  intervalMs?: number | undefined;
  title?: string | undefined;
  note?: string | undefined;
}

/** Turns backend dead time into a readable pipeline trace. */
export function PipelineLoader({
  steps = ANALYSIS_STEPS,
  intervalMs = 2600,
  title = "Analysis in progress",
  note = "Runtime scales with hop depth and upstream API latency.",
}: Props) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
    const id = setInterval(() => {
      setActive((a) => (a < steps.length - 1 ? a + 1 : a));
    }, intervalMs);
    return () => clearInterval(id);
  }, [steps, intervalMs]);

  return (
    <div className="panel p-6" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((step, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <li key={step} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  done && "border-success/60 bg-success/15 text-success",
                  current && "border-primary/60 bg-primary/10 text-primary",
                  !done && !current && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : current ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
              </span>
              <span
                className={cn(
                  "font-data text-xs",
                  done ? "text-muted-foreground line-through decoration-border" : current ? "text-foreground" : "text-muted-foreground/70",
                )}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
