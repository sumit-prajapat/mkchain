import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Check, Clock, ScanSearch, Terminal } from "lucide-react";
import { AddressBadge } from "@/components/AddressBadge";
import { ChainIcon, chainName } from "@/components/ChainIcon";
import { PipelineLoader } from "@/components/PipelineLoader";
import { RiskBadge } from "@/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { apiErrorMessage, endpoints } from "@/lib/api";
import { CHAINS, DEMO_WALLETS, relativeTime, validateAddress } from "@/lib/chain";
import type { Chain } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AnalyzeSearch {
  address?: string;
  chain?: string;
  hops?: number;
  autorun?: boolean;
}

export const Route = createFileRoute("/_authenticated/analyze")({
  validateSearch: (search: Record<string, unknown>): AnalyzeSearch => {
    const hops = Number(search["hops"]);
    return {
      ...(typeof search["address"] === "string" ? { address: search["address"] } : {}),
      ...(typeof search["chain"] === "string" ? { chain: search["chain"] } : {}),
      ...(Number.isFinite(hops) && hops >= 1 && hops <= 3 ? { hops: Math.round(hops) } : {}),
      ...(search["autorun"] === true || search["autorun"] === "true" ? { autorun: true } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Analyze Wallet — MKChain" },
      {
        name: "description",
        content:
          "Run a multi-hop forensic trace on an Ethereum, Bitcoin, or Polygon address with ML risk scoring and OSINT cross-checks.",
      },
      { property: "og:title", content: "Analyze Wallet — MKChain" },
      { property: "og:description", content: "Trace a wallet across up to three hops and score its risk." },
    ],
  }),
  component: AnalyzePage,
});

const HOP_LABEL = ["Fast (1 hop)", "Balanced (2 hops)", "Deep (3 hops)"];

function AnalyzePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [address, setAddress] = useState(search.address ?? "");
  const [chain, setChain] = useState<Chain>((search.chain as Chain) ?? "eth");
  const [hops, setHops] = useState(search.hops ?? 2);

  const validation = validateAddress(address, chain);
  const touched = address.trim().length > 0;

  const recent = useQuery({ queryKey: ["analyses", 6], queryFn: () => endpoints.listAnalyses(6), retry: 1 });

  const mutation = useMutation({
    mutationFn: (vars: { address: string; chain: Chain; hops: number }) =>
      endpoints.analyze({ address: vars.address.trim(), chain: vars.chain, hops: vars.hops }),
    onSuccess: (data) => {
      if (data?.id) navigate({ to: "/results/$id", params: { id: String(data.id) } });
    },
  });

  // One-shot autorun when the home command bar deep-links here.
  const autoran = useRef(false);
  useEffect(() => {
    if (autoran.current || !search.autorun || !search.address) return;
    const c = (search.chain as Chain) ?? "eth";
    if (!validateAddress(search.address, c).valid) return;
    autoran.current = true;
    mutation.mutate({ address: search.address, chain: c, hops: search.hops ?? 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.autorun, search.address, search.chain, search.hops]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validation.valid) return;
    mutation.mutate({ address, chain, hops });
  }

  const command = `mkchain analyze ${address.trim() || "<address>"} --chain ${chain} --hops ${hops}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-2">
        <ScanSearch className="h-4 w-4 text-primary" />
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">New analysis</p>
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Analyze Wallet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Traverses counterparties, runs nine pattern detectors, and scores the address against the OSINT corpus.
      </p>

      {mutation.isPending ? (
        <div className="mt-8 space-y-4">
          <CommandPreview command={command} running />
          <PipelineLoader />
        </div>
      ) : (
        <form onSubmit={submit} className="panel mt-8 space-y-7 p-6">
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={chain === "btc" ? "bc1… / 1… / 3…" : "0x…"}
              spellCheck={false}
              className={cn(
                "h-12 bg-muted-surface font-data text-sm",
                touched && (validation.valid ? "border-success/60" : "border-danger/60"),
              )}
              aria-invalid={touched && !validation.valid}
              aria-describedby="address-hint"
            />
            <p
              id="address-hint"
              className={cn(
                "flex items-center gap-1.5 text-xs",
                !touched ? "text-muted-foreground" : validation.valid ? "text-success" : "text-danger",
              )}
            >
              {touched ? (
                validation.valid ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )
              ) : null}
              {touched ? validation.hint : "Format is validated as you type."}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Chain</Label>
            <div className="grid grid-cols-3 gap-2">
              {CHAINS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChain(c.id)}
                  aria-pressed={chain === c.id}
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                    chain === c.id
                      ? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/40"
                      : "border-border bg-muted-surface/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ChainIcon chain={c.id} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="hops">Hop depth</Label>
              <span className="font-data text-xs text-primary">{HOP_LABEL[hops - 1]}</span>
            </div>
            <Slider id="hops" min={1} max={3} step={1} value={[hops]} onValueChange={(v) => setHops(v[0] ?? 2)} />
            <p className="text-xs text-muted-foreground">
              Higher hop counts widen the counterparty graph but take longer and consume more upstream explorer calls.
              Depth is clamped to 3.
            </p>
          </div>

          <CommandPreview command={command} />

          {mutation.isError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{apiErrorMessage(mutation.error, "Analysis failed.")}</span>
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={!validation.valid}
            className="bg-primary h-11 w-full font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            Run Analysis <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      )}

      {!mutation.isPending ? (
        <>
          <div className="mt-8">
            <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Reference cases</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DEMO_WALLETS.map((w) => (
                <button
                  key={w.address}
                  type="button"
                  onClick={() => {
                    setAddress(w.address);
                    setChain(w.chain);
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-muted-surface/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <ChainIcon chain={w.chain} className="h-3.5 w-3.5" />
                  {w.label}
                  <span className="font-data text-[10px] opacity-70">{w.expected}</span>
                </button>
              ))}
            </div>
          </div>

          {recent.data?.length ? (
            <div className="mt-10">
              <div className="flex items-center justify-between">
                <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Recent analyses</p>
                <Link to="/history" search={{}} className="text-xs text-primary hover:underline">
                  View all →
                </Link>
              </div>
              <ul className="panel mt-3 divide-y divide-border">
                {recent.data.map((a) => (
                  <li key={a.id}>
                    <Link
                      to="/results/$id"
                      params={{ id: String(a.id) }}
                      className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted-surface/60"
                    >
                      <ChainIcon chain={a.chain} className="h-3.5 w-3.5" />
                      <AddressBadge address={a.address} head={8} tail={6} />
                      <RiskBadge
                        {...(a.risk_score !== undefined ? { score: a.risk_score } : {})}
                        {...(a.risk_label !== undefined ? { label: a.risk_label } : {})}
                      />
                      <span className="ml-auto inline-flex items-center gap-1.5 font-data text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {relativeTime(a.created_at ?? a.analyzed_at)}
                      </span>
                      <span className="sr-only">{chainName(a.chain)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function CommandPreview({ command, running }: { command: string; running?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted-surface/60">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Terminal className="h-3.5 w-3.5 text-primary" />
        <span className="font-data text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          {running ? "executing" : "command"}
        </span>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 font-data text-[12px] text-foreground/90">
        <span className="text-primary">$ </span>
        {command}
      </pre>
    </div>
  );
}
