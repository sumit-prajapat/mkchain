import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { truncate } from "@/lib/chain";
import { cn } from "@/lib/utils";

interface Props {
  address?: string | undefined;
  head?: number | undefined;
  tail?: number | undefined;
  full?: boolean | undefined;
  className?: string | undefined;
  label?: string | undefined;
}

/** The one canonical way an address or hash is rendered anywhere in MKChain. */
export function AddressBadge({ address, head = 6, tail = 4, full, className, label }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted-surface/70 px-2 py-1 font-data text-xs text-foreground",
        className,
      )}
      title={address}
    >
      {label ? <span className="text-muted-foreground">{label}</span> : null}
      <span className={cn(full ? "break-all" : "truncate")}>{full ? (address ?? "—") : truncate(address, head, tail)}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy ${address ?? "address"}`}
        className="ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-primary"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </span>
  );
}
