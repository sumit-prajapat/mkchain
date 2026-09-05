import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AddressBadge } from "@/components/AddressBadge";
import { ChainIcon, chainName } from "@/components/ChainIcon";
import { RiskBadge } from "@/components/RiskBadge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiErrorMessage, endpoints } from "@/lib/api";
import { formatDate, riskLabelFor } from "@/lib/chain";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Analysis History — MKChain" },
      { name: "description", content: "Review, filter, and re-open every wallet analysis you have run on MKChain." },
      { property: "og:title", content: "Analysis History — MKChain" },
      { property: "og:description", content: "Your saved blockchain forensic analyses." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [chain, setChain] = useState("all");
  const [risk, setRisk] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["analyses"], queryFn: () => endpoints.listAnalyses(50) });

  const del = useMutation({
    mutationFn: (id: string) => endpoints.deleteAnalysis(id),
    onSuccess: () => {
      toast.success("Analysis deleted");
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not delete this analysis.")),
    onSettled: () => setPendingDelete(null),
  });

  const rows = useMemo(() => {
    const all = list.data ?? [];
    return all.filter((a) => {
      if (q && !(a.address ?? "").toLowerCase().includes(q.toLowerCase())) return false;
      if (chain !== "all" && (a.chain ?? "").toLowerCase() !== chain) return false;
      if (risk !== "all" && (a.risk_label ?? riskLabelFor(a.risk_score)).toUpperCase() !== risk) return false;
      const ts = new Date(a.created_at ?? a.analyzed_at ?? 0).getTime();
      if (from && ts < new Date(from).getTime()) return false;
      if (to && ts > new Date(to).getTime() + 86_400_000) return false;
      return true;
    });
  }, [list.data, q, chain, risk, from, to]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" />
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Case log</p>
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Analysis History</h1>

      <div className="panel mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by address" className="h-11 bg-muted-surface pl-9 font-data text-xs" />
        </div>
        <Select value={chain} onValueChange={setChain}>
          <SelectTrigger className="h-11 bg-muted-surface"><SelectValue placeholder="Chain" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All chains</SelectItem>
            <SelectItem value="eth">Ethereum</SelectItem>
            <SelectItem value="btc">Bitcoin</SelectItem>
            <SelectItem value="polygon">Polygon</SelectItem>
          </SelectContent>
        </Select>
        <Select value={risk} onValueChange={setRisk}>
          <SelectTrigger className="h-11 bg-muted-surface"><SelectValue placeholder="Risk" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risk levels</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
          </SelectContent>
        </Select>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:col-span-2 lg:col-span-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 w-full min-w-0 bg-muted-surface text-xs" aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 w-full min-w-0 bg-muted-surface text-xs" aria-label="To date" />
        </div>

      </div>

      <div className="mt-6">
        {list.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : list.isError ? (
          <ErrorState title="Could not load history" message={apiErrorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={list.data?.length ? "No analyses match these filters" : "No analyses yet"}
            description={list.data?.length ? "Adjust the chain, risk, or date filters." : "Run your first wallet analysis to build a case log."}
            action={
              <Button asChild className="bg-primary h-11 font-medium text-primary-foreground">
                <Link to="/analyze" search={{}}>Analyze a wallet</Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted-surface/70">
                <tr>
                  {["Address", "Chain", "Risk", "Analyzed", ""].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => navigate({ to: "/results/$id", params: { id: String(a.id) } })}
                    className="cursor-pointer border-t border-border transition-colors hover:bg-muted-surface/50"
                  >
                    <td className="px-3 py-2.5"><AddressBadge address={a.address} head={10} tail={8} /></td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ChainIcon chain={a.chain} className="h-3.5 w-3.5" /> {chainName(a.chain)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><RiskBadge score={a.risk_score} label={a.risk_label} /></td>
                    <td className="px-3 py-2.5 font-data text-xs whitespace-nowrap text-muted-foreground">{formatDate(a.created_at ?? a.analyzed_at)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete analysis"
                        className="h-11 w-11 text-muted-foreground hover:text-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(String(a.id));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              The stored graph, transactions, and generated summary for this case will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-danger text-background hover:bg-danger/90"
              disabled={del.isPending}
              onClick={() => pendingDelete && del.mutate(pendingDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
