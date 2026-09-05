export const NODE_COLORS: Record<string, string> = {
  root: "#22d3ee",
  mixer: "#f87171",
  darkweb: "#fb923c",
  exchange: "#60a5fa",
  clean: "#34d399",
  unknown: "#8b93a7",
};

export function nodeColor(type?: string) {
  const t = (type ?? "unknown").toLowerCase();
  return NODE_COLORS[t] ?? NODE_COLORS["unknown"]!;
}

export function GraphLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-muted-surface/60 px-3 py-2">
      {Object.entries(NODE_COLORS).map(([key, color]) => (
        <span key={key} className="inline-flex items-center gap-1.5 font-data text-[11px] text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          {key}
        </span>
      ))}
    </div>
  );
}
