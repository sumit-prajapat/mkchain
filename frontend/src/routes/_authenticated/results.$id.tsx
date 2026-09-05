import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bitcoin, Boxes, Download, Loader2, RefreshCw, Share2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AddressBadge } from "@/components/AddressBadge";
import { ChainIcon, chainName } from "@/components/ChainIcon";
import { RiskFactorCard } from "@/components/RiskFactorCard";
import { RiskGauge } from "@/components/RiskGauge";
import { TransactionGraph2D } from "@/components/TransactionGraph2D";
import { TransactionGraph3D } from "@/components/TransactionGraph3D";
import { TransactionTable } from "@/components/TransactionTable";
import { CardSkeleton, EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiErrorMessage, endpoints } from "@/lib/api";
import { formatDate } from "@/lib/chain";
import type { Analysis } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/results/$id")({
  head: () => ({
    meta: [
      { title: "Analysis Results — MKChain" },
      { name: "description", content: "Risk score, detected laundering patterns, counterparty graph, and dark web matches for an analyzed wallet." },
      { property: "og:title", content: "Analysis Results — MKChain" },
      { property: "og:description", content: "Full forensic breakdown of an analyzed blockchain address." },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [pdfLoading, setPdfLoading] = useState(false);

  const q = useQuery({ queryKey: ["analysis", id], queryFn: () => endpoints.getAnalysis(id) });
  const data = q.data;

  const nodes = data?.graph_nodes ?? data?.nodes ?? [];
  const edges = data?.graph_edges ?? data?.edges ?? [];
  const factors = data?.risk_factors ?? data?.flags ?? [];
  const isBtc = (data?.chain ?? "").toLowerCase() === "btc";

  const regen = useMutation({
    mutationFn: () => endpoints.regenerateSummary(id),
    onSuccess: (res) => {
      toast.success("Analyst summary regenerated");
      queryClient.setQueryData<Analysis | undefined>(["analysis", id], (prev) =>
        prev ? { ...prev, ai_summary: res?.ai_summary ?? res?.summary ?? prev.ai_summary } : prev,
      );
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not regenerate the summary.")),
  });

  async function downloadPdf() {
    setPdfLoading(true);
    try {
      const blob = await endpoints.reportPdf(id);
      const url = URL.createObjectURL(blob as unknown as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mkchain-report-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch (e) {
      toast.error(apiErrorMessage(e, "Report generation failed."));
    } finally {
      setPdfLoading(false);
    }
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy the link.");
    }
  }

  if (q.isLoading) {
    return (
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <CardSkeleton />
          <TableSkeleton rows={5} cols={4} />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 bg-muted-surface" />
          <Skeleton className="h-28 bg-muted-surface" />
        </div>
      </div>
    );
  }

  if (q.isError || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <ErrorState title="Could not load this analysis" message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} />
        <Button asChild variant="outline" className="mt-4 h-11">
          <Link to="/history">Back to history</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <ChainIcon chain={data.chain} className="h-3.5 w-3.5" /> {chainName(data.chain)}
        </span>
        <AddressBadge address={data.address} head={12} tail={10} />
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Analysis Results</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <RiskGauge
            score={data.risk_score ?? 0}
            {...(data.risk_label !== undefined ? { label: data.risk_label } : {})}
            ofacBoost={!!data.ofac_boost || !!data.score_floor_reason}
            {...(data.score_floor_reason !== undefined ? { boostReason: data.score_floor_reason } : {})}
          />

          <section>
            <h2 className="text-sm font-semibold tracking-[0.14em] text-muted-foreground uppercase">Risk factors</h2>
            {factors.length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {factors.map((f, i) => (
                  <RiskFactorCard key={`-${i}`} factor={f} />
                ))}
              </div>
            ) : (
              <EmptyState
                className="mt-3"
                icon={<ShieldCheck className="h-5 w-5 text-success" />}
                title="No risk patterns detected"
                description="None of the nine detectors fired on this address at the analyzed hop depth."
              />
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold tracking-[0.14em] text-muted-foreground uppercase">Transaction graph</h2>
            <Tabs defaultValue="2d" className="mt-3">
              <TabsList className="bg-muted-surface">
                <TabsTrigger value="2d">2D force graph</TabsTrigger>
                <TabsTrigger value="3d">3D view</TabsTrigger>
                {isBtc ? <TabsTrigger value="btc">Bitcoin deep dive</TabsTrigger> : null}
              </TabsList>
              <TabsContent value="2d" className="mt-4">
                <TransactionGraph2D nodes={nodes} edges={edges} />
              </TabsContent>
              <TabsContent value="3d" className="mt-4">
                <TransactionGraph3D nodes={nodes} edges={edges} />
              </TabsContent>
              {isBtc ? (
                <TabsContent value="btc" className="mt-4">
                  <BtcDeepDive address={data.address} />
                </TabsContent>
              ) : null}
            </Tabs>
          </section>

          <section>
            <h2 className="text-sm font-semibold tracking-[0.14em] text-muted-foreground uppercase">Transactions</h2>
            <div className="mt-3">
              <TransactionTable transactions={data.transactions ?? []} />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Summary</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Address</dt>
                <dd className="mt-1"><AddressBadge address={data.address} full className="w-full" /></dd>
              </div>
              <Row label="Chain" value={chainName(data.chain)} />
              <Row label="Analyzed" value={formatDate(data.created_at ?? data.analyzed_at)} />
              <Row label="Hop depth" value={data.hops ? ` hop${data.hops > 1 ? "s" : ""}` : "—"} />
              <Row label="Transactions" value={String(data.transaction_count ?? data.transactions?.length ?? 0)} />
            </dl>
          </div>

          {data.darkweb_matches?.length ? (
            <div className="panel p-5">
              <h2 className="text-xs font-semibold tracking-[0.14em] text-warning uppercase">Dark web matches</h2>
              <ul className="mt-3 space-y-3">
                {data.darkweb_matches.map((m, i) => (
                  <li key={i} className="rounded-md border border-warning/30 bg-warning/5 p-3">
                    <p className="text-sm font-medium">{m.entity_name ?? m.name ?? "Known-bad entity"}</p>
                    <p className="mt-1 font-data text-[11px] text-muted-foreground">
                      {[m.category, m.source].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <Link to="/osint" search={{ q: m.entity_name ?? m.name ?? "" }} className="mt-2 inline-block text-xs text-primary hover:underline">
                      View in OSINT database →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-purple" />
              <h2 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Analyst note</h2>
            </div>
            {data.ai_summary || data.summary ? (
              <blockquote className="mt-3 border-l-2 border-purple/50 bg-muted-surface/60 py-2 pl-3 text-sm leading-relaxed text-foreground/90">
                {data.ai_summary ?? data.summary}
              </blockquote>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No generated narrative on file for this analysis.</p>
            )}
            
            {/* Feature gate for AI Summary regeneration */}
            <FeatureGate feature="ai_summary" mode="prompt">
              <Button variant="outline" className="mt-4 h-11 w-full" onClick={() => regen.mutate()} disabled={regen.isPending}>
                {regen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Regenerate AI Summary
              </Button>
            </FeatureGate>
          </div>

          <div className="panel space-y-2 p-5">
            {/* Feature gate for PDF Report generation */}
            <FeatureGate feature="pdf_report" mode="prompt">
              <Button className="bg-primary h-11 w-full font-medium text-primary-foreground hover:bg-primary/90" onClick={downloadPdf} disabled={pdfLoading}>
                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {pdfLoading ? "Building 7-section report…" : "Download PDF Report"}
              </Button>
            </FeatureGate>
            <Button variant="outline" className="h-11 w-full" onClick={share}>
              <Share2 className="h-4 w-4" /> Share
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-data text-xs text-foreground">{value}</dd>
    </div>
  );
}

function BtcDeepDive({ address }: { address: string }) {
  const q = useQuery({ queryKey: ["btc-deep", address], queryFn: () => endpoints.btcDeep(address) });

  if (q.isLoading) return <TableSkeleton rows={3} cols={3} />;
  if (q.isError) return <ErrorState title="Bitcoin deep dive unavailable" message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data ?? {};

  const cj = typeof d.coinjoin_confidence === "number" ? Math.round(d.coinjoin_confidence * (d.coinjoin_confidence <= 1 ? 100 : 1)) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Stat icon={Boxes} label="UTXO count" value={d.utxo_count ?? "—"} />
      <Stat icon={Bitcoin} label="Balance" value={d.balance ?? "—"} />
      <Stat icon={Boxes} label="Total received" value={d.total_received ?? "—"} />
      <Stat icon={Boxes} label="Total sent" value={d.total_sent ?? "—"} />
      <Stat icon={ShieldCheck} label={`Script type${d.privacy_level ? ` · ${d.privacy_level} privacy` : ""}`} value={d.script_type ?? "—"} />
      <Stat icon={Sparkles} label="CoinJoin confidence" value={cj === null ? "—" : `%`} />
      <Stat icon={Boxes} label="Coin age (days)" value={d.coin_age_days ?? "—"} />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string | number }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <p className="text-[11px] tracking-[0.12em] uppercase">{label}</p>
      </div>
      <p className="mt-2 font-data text-lg text-foreground">{String(value)}</p>
    </div>
  );
}

/** Keeps effect-based focus resets out of the render path. */
export function useScrollTopOnId(id: string) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);
}
