import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Eye, Loader2, Plus, RadioTower, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AddressBadge } from "@/components/AddressBadge";
import { AlertCard } from "@/components/AlertCard";
import { ChainIcon } from "@/components/ChainIcon";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiErrorMessage, endpoints, streamUrl } from "@/lib/api";
import { CHAINS, formatDate, validateAddress } from "@/lib/chain";
import type { AlertItem, Chain } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    meta: [
      { title: "Watchlist & Real-Time Alerts — MKChain" },
      { name: "description", content: "Monitor wallets continuously and receive streamed alerts for new transactions, mixer contact, and dark web matches." },
      { property: "og:title", content: "Watchlist & Real-Time Alerts — MKChain" },
      { property: "og:description", content: "Live server-sent alert feed for watched blockchain addresses." },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-primary" />
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Monitoring</p>
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Watchlist &amp; Real-Time Alerts</h1>

      <Tabs defaultValue="watchlist" className="mt-6">
        <TabsList className="bg-muted-surface">
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
          <TabsTrigger value="feed">Live feed</TabsTrigger>
        </TabsList>
        <TabsContent value="watchlist" className="mt-5">
          <Watchlist />
        </TabsContent>
        <TabsContent value="feed" className="mt-5">
          <LiveFeed />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Watchlist() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<Chain>("eth");
  const [label, setLabel] = useState("");
  const [threshold, setThreshold] = useState("70");

  const list = useQuery({ queryKey: ["watched"], queryFn: endpoints.watchList });

  const add = useMutation({
    mutationFn: () =>
      endpoints.watchAdd({
        address: address.trim(),
        chain,
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(threshold ? { threshold: Number(threshold) } : {}),
      }),
    onSuccess: () => {
      toast.success("Address added to watchlist");
      setOpen(false);
      setAddress("");
      setLabel("");
      queryClient.invalidateQueries({ queryKey: ["watched"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not add this address.")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => endpoints.watchRemove(id),
    onSuccess: () => {
      toast.success("Removed from watchlist");
      queryClient.invalidateQueries({ queryKey: ["watched"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not remove this address.")),
  });

  const check = useMutation({
    mutationFn: (id: string) => endpoints.checkNow(id),
    onSuccess: () => {
      toast.success("Check queued — new activity will appear in the feed");
      queryClient.invalidateQueries({ queryKey: ["watched"] });
      queryClient.invalidateQueries({ queryKey: ["alerts", "feed"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Check failed.")),
  });

  const valid = validateAddress(address, chain).valid;

  return (
    <div>
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary h-11 font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Add to Watchlist
            </Button>
          </DialogTrigger>
          <DialogContent className="glass sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Watch an address</DialogTitle>
              <DialogDescription>The monitor re-checks watched addresses and streams alerts as activity lands.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="w-address">Address</Label>
                <Input id="w-address" value={address} spellCheck={false} onChange={(e) => setAddress(e.target.value)} className="h-11 bg-muted-surface font-data text-xs" placeholder="0x…" />
              </div>
              <div className="space-y-1.5">
                <Label>Chain</Label>
                <div className="grid grid-cols-3 gap-2">
                  {CHAINS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setChain(c.id)}
                      aria-pressed={chain === c.id}
                      className={cn(
                        "flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs",
                        chain === c.id ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40" : "border-border bg-muted-surface/60 text-muted-foreground",
                      )}
                    >
                      <ChainIcon chain={c.id} className="h-3.5 w-3.5" /> {c.short}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="w-label">Label</Label>
                  <Input id="w-label" value={label} onChange={(e) => setLabel(e.target.value)} className="h-11 bg-muted-surface" placeholder="Case 2291 subject" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="w-threshold">Risk threshold</Label>
                  <Select value={threshold} onValueChange={setThreshold}>
                    <SelectTrigger id="w-threshold" className="h-11 bg-muted-surface"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["40", "60", "70", "85"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>Cancel</Button>
              <Button className="bg-primary min-h-11 font-medium text-primary-foreground" disabled={!valid || add.isPending} onClick={() => add.mutate()}>
                {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-5">
        {list.isLoading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : list.isError ? (
          <ErrorState title="Could not load the watchlist" message={apiErrorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState title="Nothing on the watchlist" description="Add an address to receive streamed alerts when it transacts." icon={<Eye className="h-5 w-5" />} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted-surface/70">
                <tr>
                  {["Address", "Label", "Threshold", "Last checked", "Unread", ""].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((w) => (
                  <tr key={w.id} className="border-t border-border">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <ChainIcon chain={w.chain} className="h-3.5 w-3.5 text-muted-foreground" />
                        <AddressBadge address={w.address} head={10} tail={6} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{w.label || "—"}</td>
                    <td className="px-3 py-2.5 font-data text-xs">{w.threshold ?? "—"}</td>
                    <td className="px-3 py-2.5 font-data text-xs whitespace-nowrap text-muted-foreground">{formatDate(w.last_checked)}</td>
                    <td className="px-3 py-2.5">
                      {w.unread_count ? (
                        <span className="rounded-full bg-danger px-2 py-0.5 font-data text-[10px] font-semibold text-background">{w.unread_count}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" className="min-h-11" disabled={check.isPending} onClick={() => check.mutate(String(w.id))}>
                          Check now
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Remove from watchlist" className="h-11 w-11 text-muted-foreground hover:text-danger" onClick={() => remove.mutate(String(w.id))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveFeed() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [streamed, setStreamed] = useState<AlertItem[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const feed = useQuery({ queryKey: ["alerts", "feed"], queryFn: endpoints.alertFeed });

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    function connect() {
      if (closed) return;
      const es = new EventSource(streamUrl);
      esRef.current = es;
      es.onopen = () => setConnected(true);
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as AlertItem | AlertItem[];
          const items = Array.isArray(parsed) ? parsed : [parsed];
          if (items.length) setStreamed((prev) => [...items, ...prev].slice(0, 100));
        } catch {
          /* heartbeat or non-JSON frame */
        }
      };
      es.onerror = () => {
        setConnected(false);
        es.close();
        retry = setTimeout(connect, 5000);
      };
    }

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      esRef.current?.close();
    };
  }, []);

  const markRead = useMutation({
    mutationFn: (alert: AlertItem) => endpoints.alertRead({ alert_id: String(alert.id), id: String(alert.id) }),
    onSuccess: (_d, alert) => {
      setStreamed((prev) => prev.map((a) => (a.id === alert.id ? { ...a, is_read: true } : a)));
      queryClient.invalidateQueries({ queryKey: ["alerts", "feed"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not mark as read.")),
  });

  const alerts = useMemo(() => {
    const map = new Map<string, AlertItem>();
    [...streamed, ...(feed.data ?? [])].forEach((a) => {
      const key = String(a.id ?? `${a.address}-${a.created_at ?? a.timestamp}`);
      if (!map.has(key)) map.set(key, a);
    });
    const all = [...map.values()];
    if (filter === "unread") return all.filter((a) => !(a.is_read ?? a.read));
    if (filter === "read") return all.filter((a) => a.is_read ?? a.read);
    return all;
  }, [streamed, feed.data, filter]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-muted-surface/70 px-3 py-2">
          <RadioTower className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={cn("h-2 w-2 rounded-full", connected ? "bg-success pulse-dot" : "bg-warning")} />
          <span className="font-data text-[11px] text-muted-foreground">{connected ? "SSE stream open" : "reconnecting…"}</span>
        </span>
        <div className="flex gap-1 rounded-lg border border-border bg-muted-surface/60 p-1">
          {(["all", "unread", "read"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "min-h-11 rounded-md px-3 text-xs capitalize transition-colors",
                filter === f ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {feed.isLoading ? (
          <TableSkeleton rows={4} cols={3} />
        ) : feed.isError ? (
          <ErrorState title="Could not load the alert history" message={apiErrorMessage(feed.error)} onRetry={() => feed.refetch()} />
        ) : alerts.length === 0 ? (
          <EmptyState
            title={filter === "all" ? "No alerts yet" : `No ${filter} alerts`}
            description="Alerts appear here as watched addresses transact. The stream pushes updates roughly every 30 seconds."
            icon={<BellRing className="h-5 w-5" />}
          />
        ) : (
          alerts.map((a, i) => <AlertCard key={String(a.id ?? i)} alert={a} onRead={(alert) => markRead.mutate(alert)} />)
        )}
      </div>
    </div>
  );
}
