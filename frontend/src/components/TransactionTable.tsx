import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { AddressBadge } from "@/components/AddressBadge";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/chain";
import type { TxRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "timestamp" | "value";

const PAGE_SIZE = 20;

function flagsFor(tx: TxRow): string[] {
  const flags = new Set<string>(tx.flags ?? []);
  if (tx.is_mixer) flags.add("mixer");
  if (tx.is_darkweb) flags.add("darkweb");
  if (tx.is_high_value) flags.add("high-value");
  return [...flags];
}

function flagTone(flag: string) {
  const f = flag.toLowerCase();
  if (f.includes("mixer")) return "border-danger/40 bg-danger/10 text-danger";
  if (f.includes("dark")) return "border-warning/40 bg-warning/10 text-warning";
  if (f.includes("high")) return "border-purple/40 bg-purple/10 text-purple";
  return "border-border bg-muted-surface text-muted-foreground";
}

export function TransactionTable({ transactions }: { transactions: TxRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const rows = [...(transactions ?? [])];
    rows.sort((a, b) => {
      if (sortKey === "value") {
        const av = Number(a.value ?? 0);
        const bv = Number(b.value ?? 0);
        return asc ? av - bv : bv - av;
      }
      const at = new Date(a.timestamp ?? 0).getTime();
      const bt = new Date(b.timestamp ?? 0).getTime();
      return asc ? at - bt : bt - at;
    });
    return rows;
  }, [transactions, sortKey, asc]);

  if (!transactions?.length) {
    return <EmptyState title="No transactions returned" description="The upstream explorer returned no transfers within the analyzed hop depth." />;
  }

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = sorted.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  function toggle(key: SortKey) {
    if (key === sortKey) setAsc((a) => !a);
    else {
      setSortKey(key);
      setAsc(false);
    }
  }

  const SortBtn = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => toggle(k)}
      className="inline-flex min-h-11 items-center gap-1 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase hover:text-foreground"
    >
      {children}
      {sortKey === k ? asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
    </button>
  );

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-muted-surface/70">
            <tr>
              <th className="px-3 py-1 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Tx hash</th>
              <th className="px-3 py-1 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">From</th>
              <th className="px-3 py-1 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">To</th>
              <th className="px-3 py-1 text-right"><SortBtn k="value">Value</SortBtn></th>
              <th className="px-3 py-1 text-left"><SortBtn k="timestamp">Time</SortBtn></th>
              <th className="px-3 py-1 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Flags</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((tx, i) => {
              const flags = flagsFor(tx);
              return (
                <tr key={`${tx.hash ?? tx.tx_hash ?? i}-${i}`} className="border-t border-border hover:bg-muted-surface/50">
                  <td className="px-3 py-2"><AddressBadge address={tx.hash ?? tx.tx_hash} /></td>
                  <td className="px-3 py-2"><AddressBadge address={tx.from_address} /></td>
                  <td className="px-3 py-2"><AddressBadge address={tx.to_address} /></td>
                  <td className="px-3 py-2 text-right font-data text-xs">{tx.value !== undefined ? Number(tx.value).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "—"}</td>
                  <td className="px-3 py-2 font-data text-xs whitespace-nowrap text-muted-foreground">{formatDate(tx.timestamp)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {flags.length ? (
                        flags.map((f) => (
                          <span key={f} className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", flagTone(f))}>
                            {f}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="font-data text-xs text-muted-foreground">
          {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="min-h-11" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button variant="outline" size="sm" className="min-h-11" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
