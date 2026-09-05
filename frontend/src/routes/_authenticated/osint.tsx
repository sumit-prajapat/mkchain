import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Database, Search } from "lucide-react";
import { AddressBadge } from "@/components/AddressBadge";
import { ChainIcon, chainName } from "@/components/ChainIcon";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage, endpoints } from "@/lib/api";
import type { DarkwebEntity } from "@/lib/types";

const CATEGORIES = ["APT", "Ransomware", "Mixer", "Darknet Market", "Exchange Hack", "OFAC", "Privacy Bridge"];

/** Known corpus entities — shown as reference context while live data loads. */
const SEED_ENTITIES = [
  "Lazarus Group",
  "Tornado Cash",
  "Hydra Market",
  "Silk Road 3.1",
  "Colonial Pipeline",
  "REvil/Sodinokibi",
  "BitMEX Hack",
  "WannaCry",
  "Dread Pirate Roberts",
  "Kraken Darknet",
  "AlphaBay",
  "FTX Hack",
  "Monero Bridge",
];

export const Route = createFileRoute("/_authenticated/osint")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" && search["q"] ? { q: search["q"] as string } : {},
  head: () => ({
    meta: [
      { title: "OSINT Intelligence Database — MKChain" },
      { name: "description", content: "Search a curated dark web OSINT corpus of sanctioned entities, ransomware crews, mixers, and seized darknet markets by address, category, or chain." },
      { property: "og:title", content: "OSINT Intelligence Database — MKChain" },
      { property: "og:description", content: "Known-bad blockchain addresses mapped to real-world threat entities." },
    ],
  }),
  component: OsintPage,
});

function OsintPage() {
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q ?? "");
  const [category, setCategory] = useState("all");
  const [chain, setChain] = useState("all");
  const [selected, setSelected] = useState<DarkwebEntity | null>(null);

  const stats = useQuery({ queryKey: ["darkweb", "stats"], queryFn: endpoints.darkwebStats, retry: 1 });

  const active = q.trim().length > 0 || category !== "all" || chain !== "all";

  const entities = useQuery({
    queryKey: ["darkweb", "entities", q, category, chain],
    queryFn: () =>
      active
        ? endpoints.darkwebSearch({
            ...(q.trim() ? { q: q.trim() } : {}),
            ...(category !== "all" ? { category } : {}),
            ...(chain !== "all" ? { chain } : {}),
          })
        : endpoints.darkwebEntities(),
  });

  const detail = useQuery({
    queryKey: ["darkweb", "entity", selected?.entity_id ?? selected?.id],
    queryFn: () => endpoints.darkwebEntity((selected?.entity_id ?? selected?.id)!),
    enabled: !!(selected?.entity_id ?? selected?.id),
  });

  const categoryCount = useMemo(() => {
    const c = stats.data?.categories;
    if (Array.isArray(c)) return c.length;
    if (c && typeof c === "object") return Object.keys(c).length;
    return stats.data?.total_categories;
  }, [stats.data]);

  const rows = entities.data ?? [];
  const detailEntity = detail.data ?? selected;
  const addresses = normalizeAddresses(detailEntity);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" />
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Threat corpus</p>
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">OSINT Intelligence Database</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[
          { label: "Flagged addresses", value: stats.data?.total_addresses },
          { label: "Tracked entities", value: stats.data?.total_entities },
          { label: "Categories", value: categoryCount },
        ].map((s) => (
          <div key={s.label} className="panel p-4">
            <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{s.label}</p>
            {stats.isLoading ? <Skeleton className="mt-2 h-7 w-14 bg-muted-surface" /> : <p className="mt-2 font-data text-2xl font-semibold">{s.value ?? "—"}</p>}
          </div>
        ))}
      </div>

      <div className="panel mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entity, address, or source" className="h-11 bg-muted-surface pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-11 bg-muted-surface"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={chain} onValueChange={setChain}>
          <SelectTrigger className="h-11 bg-muted-surface"><SelectValue placeholder="Chain" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All chains</SelectItem>
            <SelectItem value="eth">Ethereum</SelectItem>
            <SelectItem value="btc">Bitcoin</SelectItem>
            <SelectItem value="polygon">Polygon</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6">
        {entities.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SEED_ENTITIES.slice(0, 9).map((name) => (
              <div key={name} className="panel space-y-3 p-5">
                <Skeleton className="h-4 w-2/3 bg-muted-surface" />
                <Skeleton className="h-3 w-1/3 bg-muted-surface" />
                <Skeleton className="h-3 w-full bg-muted-surface" />
              </div>
            ))}
          </div>
        ) : entities.isError ? (
          <ErrorState title="OSINT database unreachable" message={apiErrorMessage(entities.error)} onRetry={() => entities.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No entities match this query" description="Try a broader search term, or clear the category and chain filters." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((e) => (
              <button
                key={String(e.id)}
                type="button"
                onClick={() => setSelected(e)}
                className="panel flex flex-col items-start gap-2.5 p-5 text-left transition-colors hover:border-primary/40"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{entityName(e)}</p>
                  {e.chain ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <ChainIcon chain={e.chain} className="h-3.5 w-3.5" /> {chainName(e.chain)}
                    </span>
                  ) : null}
                </div>
                {e.category ? <CategoryBadge category={e.category} /> : null}
                <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{e.description ?? "No description on file for this record."}</p>
                <p className="mt-auto pt-1 text-[11px] text-muted-foreground">
                  <span className="font-data text-foreground">{e.address_count ?? normalizeAddresses(e).length}</span> address
                  {(e.address_count ?? normalizeAddresses(e).length) === 1 ? "" : "es"}
                  {e.source ? ` · ${e.source}` : ""}
                </p>
              </button>
            ))}

          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="glass max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{entityName(detailEntity)}</DialogTitle>
            <DialogDescription>
              {[detailEntity?.category, detailEntity?.source].filter(Boolean).join(" · ") || "OSINT record"}
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full bg-muted-surface" />
              <Skeleton className="h-3 w-5/6 bg-muted-surface" />
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-muted-foreground">{detailEntity?.description ?? "No description on file."}</p>
              <div className="mt-2 space-y-2">
                <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Known addresses</p>
                {addresses.length ? (
                  addresses.map((a) => (
                    <div key={a.address} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted-surface/60 p-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <ChainIcon chain={a.chain} className="h-3.5 w-3.5 text-muted-foreground" />
                        <AddressBadge address={a.address} head={10} tail={8} />
                      </div>
                      <Button asChild size="sm" variant="outline" className="min-h-11">
                        <Link to="/analyze" search={{ address: a.address, chain: normalizeChain(a.chain) }}>
                          Analyze
                        </Link>
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No addresses returned for this entity.</p>
                )}
              </div>
              {addresses.length ? (
                <p className="font-data text-[11px] text-muted-foreground">{chainName(addresses[0]?.chain)} and related chains</p>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Build a credible display name when the record has no entity name. */
export function entityName(entity?: DarkwebEntity | null): string {
  if (!entity) return "OSINT record";
  const named = (entity.name ?? entity.entity_name ?? "").trim();
  if (named) return named;

  const haystack = [entity.category, entity.source, entity.description].filter(Boolean).join(" ").toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/mixer|tumbl|tornado/, "Mixer Cluster"],
    [/hack|breach|exploit/, "Exchange Hack Cluster"],
    [/ofac|sanction|sdn/, "OFAC Sanctions Entry"],
    [/darknet|market|bazaar/, "Darknet Market Entry"],
    [/ransom/, "Ransomware Cluster"],
    [/scam|phish|fraud/, "Scam Wallet Cluster"],
    [/terror/, "Terrorism Finance Entry"],
    [/rug|pull/, "Rug Pull Cluster"],
    [/apt|lazarus|state/, "APT Threat Cluster"],
  ];
  for (const [pattern, label] of rules) if (pattern.test(haystack)) return label;

  if (entity.category) return `${entity.category} Entry`;
  const first = normalizeAddresses(entity)[0]?.address;
  if (first) return `Flagged Cluster ${first.slice(0, 6)}…${first.slice(-4)}`;
  return "Unclassified OSINT Entry";
}

function normalizeAddresses(entity?: DarkwebEntity | null): Array<{ address: string; chain?: string | undefined }> {
  if (!entity?.addresses) return [];
  return entity.addresses
    .map((a) => (typeof a === "string" ? { address: a, chain: entity.chain } : a))
    .filter((a) => !!a.address);
}

function normalizeChain(chain?: string) {
  const c = (chain ?? "eth").toLowerCase();
  if (c.startsWith("bit") || c === "btc") return "btc";
  if (c.startsWith("pol") || c === "matic") return "polygon";
  return "eth";
}


const CATEGORY_TONES: Array<[RegExp, string]> = [
  [/ofac|sanction/i, "border-danger/30 bg-danger/10 text-danger"],
  [/ransom/i, "border-critical/30 bg-critical/10 text-critical"],
  [/mixer|privacy/i, "border-purple/30 bg-purple/10 text-purple"],
  [/market|darknet/i, "border-warning/30 bg-warning/10 text-warning"],
  [/hack|exploit/i, "border-danger/30 bg-danger/10 text-danger"],
  [/apt|state/i, "border-primary/30 bg-primary/10 text-primary"],
];

function CategoryBadge({ category }: { category: string }) {
  const tone = CATEGORY_TONES.find(([p]) => p.test(category))?.[1] ?? "border-border bg-muted-surface text-muted-foreground";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>{category}</span>
  );
}
