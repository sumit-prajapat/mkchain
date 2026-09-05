import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, GitCompareArrows, Link2, Unlink } from "lucide-react";
import { AddressBadge } from "@/components/AddressBadge";
import { ChainIcon } from "@/components/ChainIcon";
import { GraphLegend, nodeColor } from "@/components/GraphLegend";
import { PipelineLoader } from "@/components/PipelineLoader";
import { RiskGauge } from "@/components/RiskGauge";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage, endpoints } from "@/lib/api";
import { CHAINS, DEMO_WALLETS, validateAddress } from "@/lib/chain";
import type { Analysis, Chain, CompareResult } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/compare")({
  head: () => ({
    meta: [
      { title: "Wallet Comparison — MKChain" },
      { name: "description", content: "Run two wallet analyses in parallel and surface shared counterparties, shared risk flags, and direct on-chain links between them." },
      { property: "og:title", content: "Wallet Comparison — MKChain" },
      { property: "og:description", content: "Compare two blockchain wallets side by side." },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const [a, setA] = useState({ address: "", chain: "eth" as Chain });
  const [b, setB] = useState({ address: "", chain: "eth" as Chain });
  const { hasAccess } = useFeatureAccess('comparison');

  const mutation = useMutation({
    mutationFn: () =>
      endpoints.compare({ address_a: a.address.trim(), chain_a: a.chain, address_b: b.address.trim(), chain_b: b.chain }),
  });

  const validA = validateAddress(a.address, a.chain).valid;
  const validB = validateAddress(b.address, b.chain).valid;

  function loadDemo() {
    setA({ address: DEMO_WALLETS[0]!.address, chain: "eth" });
    setB({ address: DEMO_WALLETS[2]!.address, chain: "eth" });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-2">
        <GitCompareArrows className="h-4 w-4 text-primary" />
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Link analysis</p>
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Wallet Comparison</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Both wallets are traced concurrently, then intersected for shared counterparties and overlapping risk flags.
      </p>

      <form
        className="mt-6 grid gap-4 lg:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (validA && validB && hasAccess) mutation.mutate();
        }}
      >
        <WalletInput title="Wallet A" value={a} onChange={setA} />
        <WalletInput title="Wallet B" value={b} onChange={setB} />

        <div className="flex flex-wrap gap-3 lg:col-span-2">
          {/* Feature gate for comparison feature */}
          <FeatureGate feature="comparison" mode="prompt">
            <Button
              type="submit"
              disabled={!validA || !validB || mutation.isPending}
              className="bg-primary h-11 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              Compare Wallets
            </Button>
          </FeatureGate>
          <Button type="button" variant="outline" className="h-11" onClick={loadDemo}>
            Load reference pair
          </Button>
        </div>
      </form>

      {mutation.isPending ? (
        <div className="mt-8">
          <PipelineLoader
            title="Running both analyses in parallel"
            steps={["Dispatching wallet A trace", "Dispatching wallet B trace", "Intersecting counterparty sets", "Comparing risk flags", "Resolving relationship"]}
          />
        </div>
      ) : null}

      {mutation.isError ? (
        <div role="alert" className="mt-8 flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{apiErrorMessage(mutation.error, "Comparison failed.")}</span>
        </div>
      ) : null}

      {mutation.isSuccess && mutation.data ? <CompareOutput result={mutation.data} /> : null}
    </div>
  );
}

function WalletInput({
  title,
  value,
  onChange,
}: {
  title: string;
  value: { address: string; chain: Chain };
  onChange: (v: { address: string; chain: Chain }) => void;
}) {
  const v = validateAddress(value.address, value.chain);
  const touched = value.address.trim().length > 0;
  return (
    <div className="panel space-y-4 p-5">
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{title}</p>
      <div className="space-y-1.5">
        <Label htmlFor={`-addr`}>Address</Label>
        <Input
          id={`-addr`}
          value={value.address}
          spellCheck={false}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder={value.chain === "btc" ? "bc1…" : "0x…"}
          className={cn("h-11 bg-muted-surface font-data text-xs", touched && (v.valid ? "border-success/60" : "border-danger/60"))}
        />
        {touched ? <p className={cn("text-xs", v.valid ? "text-success" : "text-danger")}>{v.hint}</p> : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {CHAINS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange({ ...value, chain: c.id })}
            aria-pressed={value.chain === c.id}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs transition-colors",
              value.chain === c.id
                ? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/40"
                : "border-border bg-muted-surface/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <ChainIcon chain={c.id} className="h-3.5 w-3.5" />
            {c.short}
          </button>
        ))}
      </div>
    </div>
  );
}

function CompareOutput({ result }: { result: CompareResult }) {
  const a = result.analysis_a ?? result.wallet_a;
  const b = result.analysis_b ?? result.wallet_b;
  const shared = result.shared_counterparties ?? [];
  const relationship = (result.relationship ?? (shared.length ? ` SHARED COUNTERPARTIES` : "NO DIRECT LINK")).toUpperCase();
  const linked = relationship.includes("DIRECTLY LINKED");
  const some = linked || relationship.includes("SHARED");

  return (
    <div className="mt-8 space-y-6">
      <div
        className={cn(
          "panel flex flex-col items-center gap-3 p-8 text-center",
          some ? "border-danger/40 ring-1 ring-danger/20" : "border-success/40 ring-1 ring-success/20",
        )}
      >
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", some ? "border-danger/40 bg-danger/10 text-danger" : "border-success/40 bg-success/10 text-success")}>
          {some ? <Link2 className="h-5 w-5" /> : <Unlink className="h-5 w-5" />}
        </span>
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Relationship</p>
        <p className={cn("font-data text-2xl font-semibold tracking-tight sm:text-3xl", some ? "text-danger" : "text-success")}>{relationship}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WalletResult label="Wallet A" analysis={a} />
        <WalletResult label="Wallet B" analysis={b} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Shared counterparties</p>
          {shared.length ? (
            <ul className="mt-3 space-y-2">
              {shared.map((addr) => (
                <li key={addr}>
                  <AddressBadge address={addr} head={12} tail={8} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No overlapping counterparties within the traced hops.</p>
          )}
        </div>
        <div className="panel p-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Shared flags</p>
          {result.shared_flags?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {result.shared_flags.map((f) => (
                <span key={f} className="rounded border border-warning/40 bg-warning/10 px-2 py-1 font-data text-[11px] text-warning">
                  {f.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No risk patterns fired on both wallets.</p>
          )}
        </div>
      </div>

      <CombinedGraph a={a} b={b} shared={shared} />
    </div>
  );
}

function WalletResult({ label, analysis }: { label: string; analysis?: Analysis | undefined }) {
  if (!analysis) {
    return (
      <div className="panel p-5">
        <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
        <p className="mt-3 text-sm text-muted-foreground">No analysis payload returned for this wallet.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="panel flex flex-wrap items-center justify-between gap-2 p-4">
        <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
        <AddressBadge address={analysis.address} head={10} tail={6} />
      </div>
      <RiskGauge score={analysis.risk_score ?? 0} {...(analysis.risk_label !== undefined ? { label: analysis.risk_label } : {})} />
    </div>
  );
}

function CombinedGraph({ a, b, shared }: { a?: Analysis | undefined; b?: Analysis | undefined; shared: string[] }) {
  const width = 640;
  const height = 260;
  const sharedSet = new Set(shared);

  const others = [
    ...(a?.graph_nodes ?? a?.nodes ?? []).map((n) => ({ id: n.id ?? n.address ?? "", side: "a" as const, type: n.type })),
    ...(b?.graph_nodes ?? b?.nodes ?? []).map((n) => ({ id: n.id ?? n.address ?? "", side: "b" as const, type: n.type })),
  ].filter((n) => n.id && n.id !== a?.address && n.id !== b?.address);

  const merged = new Map<string, { id: string; sides: Set<string>; type?: string | undefined }>();
  others.forEach((n) => {
    const entry = merged.get(n.id) ?? { id: n.id, sides: new Set<string>(), type: n.type };
    entry.sides.add(n.side);
    merged.set(n.id, entry);
  });
  const nodes = [...merged.values()].slice(0, 26);

  return (
    <div className="panel space-y-3 p-5">
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Combined graph</p>
      {nodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No counterparty nodes returned to plot.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-background hairline-grid">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full min-w-[520px]" role="img" aria-label="Combined wallet graph">
            {nodes.map((n, i) => {
              const isShared = sharedSet.has(n.id) || n.sides.size > 1;
              const cols = Math.ceil(nodes.length / 3);
              const x = 120 + ((i % cols) / Math.max(1, cols - 1)) * (width - 240);
              const y = 55 + Math.floor(i / cols) * 75;
              return (
                <g key={n.id}>
                  <line x1={40} y1={height / 2} x2={x} y2={y} stroke={n.sides.has("a") ? "#22d3ee44" : "transparent"} strokeWidth="1" />
                  <line x1={width - 40} y1={height / 2} x2={x} y2={y} stroke={n.sides.has("b") ? "#a78bfa44" : "transparent"} strokeWidth="1" />
                  <circle cx={x} cy={y} r={isShared ? 8 : 5} fill={isShared ? "#f87171" : nodeColor(n.type)} stroke="#0a0f1e" strokeWidth="1.5" />
                  {isShared ? <circle cx={x} cy={y} r={13} fill="none" stroke="#f87171" strokeOpacity="0.4" strokeWidth="1" /> : null}
                  <title>{n.id}</title>
                </g>
              );
            })}
            <circle cx={40} cy={height / 2} r={13} fill="#22d3ee" stroke="#0a0f1e" strokeWidth="2" />
            <text x={40} y={height / 2 + 32} fontSize="10" fill="#8b93a7" textAnchor="middle" fontFamily="var(--font-mono)">A</text>
            <circle cx={width - 40} cy={height / 2} r={13} fill="#a78bfa" stroke="#0a0f1e" strokeWidth="2" />
            <text x={width - 40} y={height / 2 + 32} fontSize="10" fill="#8b93a7" textAnchor="middle" fontFamily="var(--font-mono)">B</text>
          </svg>
        </div>
      )}
      <GraphLegend />
    </div>
  );
}
