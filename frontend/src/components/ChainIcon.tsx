import { cn } from "@/lib/utils";

interface Props {
  chain?: string | undefined;
  className?: string | undefined;
}

/** Real vector marks for each supported chain — never emoji. */
export function ChainIcon({ chain, className }: Props) {
  const c = (chain ?? "eth").toLowerCase();
  const base = cn("h-4 w-4 shrink-0", className);

  if (c === "btc" || c === "bitcoin") {
    return (
      <svg viewBox="0 0 24 24" className={base} aria-hidden="true" fill="none">
        <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M9.5 7.5h3.2a2.1 2.1 0 0 1 0 4.2H9.5m0 0h3.7a2.15 2.15 0 0 1 0 4.3H9.5m0-8.5v8.5M10.8 6v1.5m0 9V18m2.6-12v1.5m0 9V18M8.4 7.5h1.1m-1.1 8.5h1.1"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (c === "polygon" || c === "matic") {
    return (
      <svg viewBox="0 0 24 24" className={base} aria-hidden="true" fill="none">
        <path
          d="M12 2.6 20.2 7.3v9.4L12 21.4 3.8 16.7V7.3L12 2.6Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M9.2 10.3 12 8.7l2.8 1.6v3.4L12 15.3l-2.8-1.6v-3.4Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={base} aria-hidden="true" fill="none">
      <path d="M12 2.2 5.8 12.3 12 15.9l6.2-3.6L12 2.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5.8 13.7 12 21.8l6.2-8.1L12 17.4l-6.2-3.7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function chainName(chain?: string) {
  const c = (chain ?? "").toLowerCase();
  if (c === "btc" || c === "bitcoin") return "Bitcoin";
  if (c === "polygon" || c === "matic") return "Polygon";
  return "Ethereum";
}
