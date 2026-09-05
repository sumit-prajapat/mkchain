import {
  ArrowLeftRight,
  Blend,
  CircleDollarSign,
  Clock,
  Gauge,
  Globe,
  Layers,
  Share2,
  ShieldAlert,
  Waves,
} from "lucide-react";
import type { RiskFactor } from "@/lib/types";
import { cn } from "@/lib/utils";

const DETECTORS: Record<string, { title: string; icon: typeof Waves; blurb: string }> = {
  mixer_interaction: { title: "Mixer Interaction", icon: Waves, blurb: "Funds moved directly through a known mixing service." },
  peel_chain: { title: "Peel Chain", icon: Layers, blurb: "Sequential small peels off a large balance — classic layering." },
  high_velocity: { title: "High Velocity", icon: Gauge, blurb: "Abnormal transaction rate over a short window." },
  round_amount_structuring: { title: "Round Amount Structuring", icon: CircleDollarSign, blurb: "Repeated round-number transfers below reporting thresholds." },
  structuring: { title: "Round Amount Structuring", icon: CircleDollarSign, blurb: "Repeated round-number transfers below reporting thresholds." },
  layered_mixer_routing: { title: "Layered Mixer Routing", icon: Blend, blurb: "Multi-hop routing through chained mixing services." },
  dormancy_then_activity: { title: "Dormancy Then Activity", icon: Clock, blurb: "Long dormancy followed by a sudden burst of movement." },
  high_fan_out: { title: "High Fan-Out", icon: Share2, blurb: "Funds dispersed across an unusually large set of recipients." },
  darkweb_match: { title: "Dark Web Match", icon: Globe, blurb: "Address appears in the OSINT known-bad database." },
  bridge_hop: { title: "Bridge Hop", icon: ArrowLeftRight, blurb: "Cross-chain bridge usage detected in the flow." },
};

function normalize(key?: string) {
  return (key ?? "").toLowerCase().replace(/[\s-]+/g, "_");
}

export function RiskFactorCard({ factor }: { factor: RiskFactor }) {
  const key = normalize(factor.type ?? factor.name);
  const meta = DETECTORS[key];
  const Icon = meta?.icon ?? ShieldAlert;
  const title = meta?.title ?? (factor.name ?? factor.type ?? "Risk pattern").replace(/_/g, " ");
  const severity = (factor.severity ?? "").toUpperCase();

  const tone =
    severity === "CRITICAL"
      ? "border-l-critical"
      : severity === "HIGH"
        ? "border-l-danger"
        : severity === "MEDIUM"
          ? "border-l-warning"
          : "border-l-primary";

  const badgeTone =
    severity === "CRITICAL"
      ? "text-critical bg-critical/10 border-critical/40"
      : severity === "HIGH"
        ? "text-danger bg-danger/10 border-danger/40"
        : severity === "MEDIUM"
          ? "text-warning bg-warning/10 border-warning/40"
          : "text-primary bg-primary/10 border-primary/40";

  return (
    <div className={cn("panel border-l-2 p-4", tone)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold capitalize">{title}</p>
        </div>
        {severity ? (
          <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase", badgeTone)}>
            {severity}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {factor.description ?? meta?.blurb ?? "Pattern flagged by the detection engine."}
      </p>
      {typeof factor.score === "number" ? (
        <p className="mt-3 font-data text-[11px] text-muted-foreground">contribution +{factor.score}</p>
      ) : null}
    </div>
  );
}
