import type { Chain } from "./types";

export const CHAINS: Array<{ id: Chain; name: string; short: string }> = [
  { id: "eth", name: "Ethereum", short: "ETH" },
  { id: "btc", name: "Bitcoin", short: "BTC" },
  { id: "polygon", name: "Polygon", short: "MATIC" },
];

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const BTC_LEGACY_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,39}$/;
const BTC_BECH32_RE = /^bc1[a-z0-9]{25,62}$/;

export function validateAddress(address: string, chain: Chain | string): { valid: boolean; hint: string } {
  const value = address.trim();
  if (!value) return { valid: false, hint: "" };
  if (chain === "btc") {
    if (BTC_LEGACY_RE.test(value) || BTC_BECH32_RE.test(value)) {
      const kind = value.startsWith("bc1") ? "SegWit (bech32)" : value.startsWith("3") ? "P2SH" : "Legacy P2PKH";
      return { valid: true, hint: `Valid Bitcoin address — ${kind}` };
    }
    return { valid: false, hint: "Expected a Bitcoin address starting with 1, 3, or bc1." };
  }
  if (EVM_RE.test(value)) {
    return { valid: true, hint: `Valid ${chain === "polygon" ? "Polygon" : "Ethereum"} address` };
  }
  return { valid: false, hint: "Expected 0x followed by 40 hex characters." };
}

export function truncate(value?: string, head = 6, tail = 4): string {
  if (!value) return "—";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function riskLabelFor(score?: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const s = score ?? 0;
  if (s >= 85) return "CRITICAL";
  if (s >= 70) return "HIGH";
  if (s >= 40) return "MEDIUM";
  return "LOW";
}

export function riskToneClass(label?: string): string {
  switch ((label ?? "").toUpperCase()) {
    case "CRITICAL":
      return "text-critical border-critical/50 bg-critical/10";
    case "HIGH":
      return "text-danger border-danger/50 bg-danger/10";
    case "MEDIUM":
      return "text-warning border-warning/50 bg-warning/10";
    default:
      return "text-success border-success/50 bg-success/10";
  }
}

export function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value?: string): string {
  if (!value) return "—";
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return value;
  const diff = Math.round((d - Date.now()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export const DEMO_WALLETS = [
  {
    address: "0x098b716b8aaf21512996dc57eb0615e2383e2f96",
    chain: "eth" as Chain,
    label: "Lazarus Group",
    note: "OFAC-designated North Korean APT",
    expected: "CRITICAL",
  },
  {
    address: "0x722122df12d4e14e13ac3b6895a86e84145b6967",
    chain: "eth" as Chain,
    label: "Tornado Cash",
    note: "Sanctioned mixer contract",
    expected: "CRITICAL",
  },
  {
    address: "0x7f367cc41522ce07553e823bf3be79a889debe1b",
    chain: "eth" as Chain,
    label: "Hydra Market",
    note: "Seized darknet marketplace",
    expected: "HIGH",
  },
  {
    address: "0x28c6c06298d514db089934071355e5743bf21d60",
    chain: "eth" as Chain,
    label: "Binance Hot Wallet",
    note: "Known exchange — clean baseline",
    expected: "LOW",
  },
];
