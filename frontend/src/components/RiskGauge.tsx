import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { riskLabelFor } from "@/lib/chain";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  score?: number | undefined;
  label?: string | undefined;
  ofacBoost?: boolean | undefined;
  boostReason?: string | undefined;
  className?: string | undefined;
}

const R = 78;
const CIRC = Math.PI * R; // half circle

export function RiskGauge({ score = 0, label, ofacBoost, boostReason, className }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const [animated, setAnimated] = useState(0);
  const resolved = (label ?? riskLabelFor(clamped)).toUpperCase();

  useEffect(() => {
    const t = setTimeout(() => setAnimated(clamped), 60);
    return () => clearTimeout(t);
  }, [clamped]);

  const tone = clamped > 70 ? "var(--danger)" : clamped >= 40 ? "var(--warning)" : "var(--success)";
  const offset = CIRC - (animated / 100) * CIRC;

  return (
    <div className={cn("panel flex flex-col items-center p-6", className)}>
      <div className="flex w-full items-center justify-between">
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Composite risk score</p>
        {ofacBoost ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Why was a score floor applied?"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-warning hover:bg-warning/10"
              >
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              {boostReason ?? "Score floor applied due to an OFAC / dark web match. The model output was raised to the sanctioned-entity minimum."}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <div className="relative mt-4" style={{ width: 200, height: 116 }}>
        <svg viewBox="0 0 200 110" width="200" height="110" aria-hidden="true">
          <path
            d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`}
            fill="none"
            stroke="var(--border)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`}
            fill="none"
            stroke={tone}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }}
          />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="font-data text-4xl leading-none font-semibold" style={{ color: tone }}>
            {Math.round(animated)}
          </span>
          <span className="mt-1 text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: tone }}>
            {resolved}
          </span>
        </div>
      </div>

      <div className="mt-4 flex w-full items-center justify-between font-data text-[10px] text-muted-foreground">
        <span>0 · LOW</span>
        <span>40 · MEDIUM</span>
        <span>70+ · HIGH</span>
      </div>
      {ofacBoost ? (
        <p className="mt-3 w-full rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          Score floor applied due to OFAC match.
        </p>
      ) : null}
    </div>
  );
}
