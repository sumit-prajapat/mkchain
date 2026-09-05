import { riskLabelFor, riskToneClass } from "@/lib/chain";
import { cn } from "@/lib/utils";

interface Props {
  score?: number | undefined;
  label?: string | undefined;
  showScore?: boolean | undefined;
  className?: string | undefined;
}

export function RiskBadge({ score, label, showScore = true, className }: Props) {
  const resolved = (label ?? riskLabelFor(score)).toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        riskToneClass(resolved),
        className,
      )}
    >
      {resolved}
      {showScore && typeof score === "number" ? (
        <span className="font-data text-[11px] opacity-80">{Math.round(score)}</span>
      ) : null}
    </span>
  );
}
