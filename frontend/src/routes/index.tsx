import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  Binary,
  Building2,
  Cpu,
  Database,
  FileText,
  Fingerprint,
  Gavel,
  GitBranch,
  Github,
  Landmark,
  Layers,
  Network,
  Radar,
  ScanSearch,
  Search,
  Shield,
} from "lucide-react";
import { AddressBadge } from "@/components/AddressBadge";
import { ChainIcon, chainName } from "@/components/ChainIcon";
import { CountUp, Reveal, useInView } from "@/components/Reveal";
import { RiskBadge } from "@/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { endpoints } from "@/lib/api";
import { CHAINS, DEMO_WALLETS, validateAddress } from "@/lib/chain";
import type { Chain } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MKChain — Blockchain Forensics & Wallet Risk Tracing" },
      {
        name: "description",
        content:
          "Open-source blockchain forensics: multi-hop tracing across Ethereum, Bitcoin and Polygon, ML risk scoring, dark web OSINT matching, and audit-ready PDF reports.",
      },
      { property: "og:title", content: "MKChain — Blockchain Forensics & Wallet Risk Tracing" },
      {
        property: "og:description",
        content:
          "Trace wallets, detect mixers and peel chains, score risk 0–100, and export evidentiary reports. An open-source alternative to Chainalysis and Elliptic.",
      },
    ],
  }),
  component: Home,
});

/* ------------------------------------------------------------------ hero */

const PREVIEW_FACTORS = [
  { label: "OFAC sanctioned counterparty", weight: "High", tone: "text-danger" },
  { label: "Mixer interaction (Tornado Cash)", weight: "High", tone: "text-danger" },
  { label: "Peel chain structure detected", weight: "Medium", tone: "text-warning" },
  { label: "Transaction velocity anomaly", weight: "Low", tone: "text-muted-foreground" },
];

function ReportPreview() {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Investigation summary</p>
          <p className="mt-0.5 truncate font-data text-xs text-foreground">0x098b…2f96 · Ethereum · 3 hops</p>
        </div>
        <span className="shrink-0 rounded-full bg-danger/10 px-2.5 py-1 text-[11px] font-semibold text-danger">Critical</span>
      </div>

      <div className="grid gap-4 px-5 py-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 border-danger/25 bg-danger/5">
            <span className="font-data text-2xl font-semibold text-danger">94</span>
            <span className="text-[10px] text-muted-foreground">/ 100</span>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p><span className="font-data text-foreground">412</span> transactions</p>
            <p><span className="font-data text-foreground">188</span> graph nodes</p>
            <p><span className="font-data text-foreground">4 / 9</span> detectors triggered</p>
          </div>
        </div>

        <ul className="space-y-2 sm:border-l sm:border-border sm:pl-5">
          {PREVIEW_FACTORS.map((f) => (
            <li key={f.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-foreground">{f.label}</span>
              <span className={cn("shrink-0 font-medium", f.tone)}>{f.weight}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted-surface px-5 py-3">
        <p className="text-xs text-muted-foreground">OSINT match: Lazarus Group (OFAC SDN)</p>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" /> report.pdf ready
        </span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted-surface px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            <span className="text-[11px] font-medium text-muted-foreground">Open-source forensics · v2.0.0</span>
          </span>
          <h1 className="mt-6 text-4xl leading-[1.1] font-semibold tracking-tight text-foreground sm:text-[3rem]">
            Blockchain tracing for <span className="text-primary">financial crime investigators</span>.
          </h1>
          <p className="mt-6 max-w-[620px] text-base leading-7 text-muted-foreground">
            Multi-hop wallet tracing, behavioural pattern detection, ML risk scoring and live OSINT matching across
            Ethereum, Bitcoin and Polygon — with an evidentiary PDF at the end of every run.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="h-11 bg-primary px-6 font-medium text-primary-foreground hover:bg-primary/90">
              <Link to="/analyze" search={{}}>
                <ScanSearch className="h-4 w-4" /> Start analysis
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 px-6">
              <Link to="/osint" search={{}}>
                <Database className="h-4 w-4" /> Explore OSINT
              </Link>
            </Button>
            <Button asChild variant="ghost" className="h-11 px-4 text-muted-foreground hover:text-foreground">
              <a href="#demo-wallets">Try a demo wallet</a>
            </Button>
          </div>

          <QuickScan />
        </div>

        <div>
          <ReportPreview />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------- quick scan command bar */

function QuickScan() {
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<Chain>("eth");

  const value = address.trim();
  const validation = validateAddress(value, chain);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validation.valid) return;
    navigate({ to: "/analyze", search: { address: value, chain, hops: 2, autorun: true } });
  }

  return (
    <form onSubmit={submit} className="mt-8 rounded-lg border border-border bg-muted-surface p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex gap-1 rounded-md border border-border bg-card p-1">
          {CHAINS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChain(c.id)}
              aria-pressed={chain === c.id}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                chain === c.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c.short}
            </button>
          ))}
        </div>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          spellCheck={false}
          aria-label="Address to scan"
          placeholder={chain === "btc" ? "bc1… / 1… / 3…" : "0x…"}
          className="h-10 min-w-0 flex-1 bg-card font-data text-xs"
        />
        <Button
          type="submit"
          disabled={!validation.valid}
          className="h-10 bg-primary font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          Scan <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      <p className={cn("mt-2 px-1 text-[11px]", value ? (validation.valid ? "text-success" : "text-danger") : "text-muted-foreground")}>
        {value ? validation.hint : "Paste an address to run the full pipeline in the analyzer."}
      </p>
    </form>
  );
}




/* ---------------------------------------------------------- stats strip */

function StatsStrip() {
  const stats = useQuery({ queryKey: ["darkweb", "stats"], queryFn: endpoints.darkwebStats, retry: 1 });

  const cards = [
    { icon: Fingerprint, value: stats.data?.total_addresses, label: "Flagged addresses" },
    { icon: Shield, value: stats.data?.total_entities, label: "Criminal entities" },
    { icon: Layers, value: 3, label: "Chains supported" },
    { icon: GitBranch, value: 9, label: "Pattern detectors" },
    { icon: Binary, value: 21, label: "ML features" },
  ];

  return (
    <section aria-label="Platform statistics" className="border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cards.map((c, i) => (
            <Reveal key={c.label} delay={i * 60} className="panel p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted-surface text-primary">
                <c.icon className="h-4 w-4" />
              </span>
              <p className="mt-3 font-data text-3xl font-semibold tracking-tight tabular-nums">
                {typeof c.value === "number" ? <CountUp value={c.value} /> : "—"}
              </p>
              <p className="mt-1 text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{c.label}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ explainer */

const AUDIENCE = [
  { icon: Search, label: "Financial crime investigators" },
  { icon: Building2, label: "Compliance officers" },
  { icon: Gavel, label: "Law enforcement" },
  { icon: Landmark, label: "Crypto exchanges" },
  { icon: Radar, label: "Security researchers" },
];

function Explainer() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.6fr_1fr]">
        <Reveal>
          <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">What MKChain does</h2>
          <p className="mt-4 text-sm leading-relaxed text-foreground sm:text-base">
            MKChain traces wallet activity across Ethereum, Bitcoin and Polygon, builds a multi-hop transaction graph,
            runs it through 9 behavioural pattern detectors and a trained ML model, cross-checks every counterparty
            against a live OSINT database of sanctioned and criminal addresses, and returns a 0–100 risk score with a
            full evidentiary PDF report.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            It is an open-source alternative to Chainalysis and Elliptic. Those tools cost six figures a year and keep
            their scoring logic closed. Here every detector, every feature weight and every OSINT source is readable in
            the repository — an investigator can defend the score, not just quote it.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Who this is for</h3>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {AUDIENCE.map((a) => (
              <li key={a.label} className="flex items-center gap-3 py-3">
                <a.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="text-sm text-foreground">{a.label}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- pipeline */

const PIPELINE = [
  { title: "Input & validate", body: "Address format and chain checked, hop depth (1–3) selected." },
  { title: "Fetch transactions", body: "Live pull from Etherscan API V2 and BlockCypher." },
  { title: "Build graph", body: "Multi-hop BFS traversal via NetworkX, up to 3 hops." },
  { title: "Detect patterns", body: "9 detectors run: mixer, peel chain, structuring, fan-out and more." },
  { title: "Score risk", body: "Random Forest over 21 features with an OFAC-boosted floor score." },
  { title: "Report", body: "AI narrative summary (Groq Llama-3.1) plus downloadable PDF." },
];

function Pipeline() {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">How it works</h2>
        <div ref={ref} className="relative mt-8">
          <span className="absolute top-4 right-0 left-0 hidden h-px bg-border lg:block" aria-hidden />
          <ol className="grid gap-6 lg:grid-cols-6 lg:gap-4">
            {PIPELINE.map((s, i) => (
              <li key={s.title} className="relative flex gap-4 lg:block">
                <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted-surface font-data text-xs text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="lg:mt-4">
                  <p className="text-sm font-semibold text-foreground">{s.title}</p>
                  <span
                    className="mt-1.5 block h-0.5 origin-left rounded-full bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none"
                    style={{ transform: inView ? "scaleX(1)" : "scaleX(0)", transitionDelay: `${i * 150}ms`, width: "2.5rem" }}
                    aria-hidden
                  />
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- demo wallets */

function DemoWallets() {
  return (
    <section id="demo-wallets" className="scroll-mt-20 border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Demo wallets — try it now</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Real, publicly documented cases. Selecting one opens the analyzer with the address and chain pre-filled.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DEMO_WALLETS.map((w, i) => (
            <Reveal key={w.address} delay={i * 60}>
              <Link
                to="/analyze"
                search={{ address: w.address, chain: w.chain }}
                className="panel flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 font-data text-[11px] text-muted-foreground">
                    <ChainIcon chain={w.chain} className="h-3.5 w-3.5" /> {chainName(w.chain)}
                  </span>
                  <RiskBadge label={w.expected} showScore={false} />
                </div>
                <p className="text-sm font-medium text-foreground">{w.label}</p>
                <p className="text-xs text-muted-foreground">{w.note}</p>
                <AddressBadge address={w.address} className="mt-auto w-fit" />
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- capabilities */

const CAPABILITIES = [
  { icon: Network, title: "Multi-chain analysis", body: "Ethereum, Bitcoin and Polygon with multi-hop counterparty tracing." },
  { icon: Cpu, title: "ML risk scoring", body: "Random Forest, 21 engineered features, 2,300 training samples." },
  { icon: Database, title: "Dark web OSINT", body: "70+ addresses across 13 criminal entities — OFAC, Lazarus, Hydra." },
  { icon: GitBranch, title: "Pattern detection", body: "9 detectors: mixers, peel chains, structuring, fan-out, velocity." },
  { icon: Bell, title: "Real-time alerts", body: "SSE-based watchlist monitoring pushes activity as it lands on-chain." },
  { icon: FileText, title: "Forensic PDF reports", body: "7-section audit-ready reports generated with ReportLab." },
];

function Capabilities() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Capabilities</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.title} delay={i * 50} className="panel p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted-surface text-primary">
                <c.icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground">{c.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{c.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ data strip */

const SOURCES = ["Etherscan API V2", "BlockCypher", "Groq Llama-3.1", "Supabase PostgreSQL"];

function SourcesStrip() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 sm:px-6">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Powered by</span>
        <div className="flex flex-wrap items-center gap-2">
          {["eth", "btc", "polygon"].map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-data text-[11px] text-muted-foreground"
            >
              <ChainIcon chain={c} className="h-3.5 w-3.5" /> {chainName(c)}
            </span>
          ))}
          {SOURCES.map((s) => (
            <span
              key={s}
              className="inline-flex items-center rounded-full border border-border px-2.5 py-1 font-data text-[11px] text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- final CTA */

function FinalCta() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-12 sm:px-6">
        <p className="text-lg font-semibold tracking-tight sm:text-xl">Ready to trace a wallet?</p>
        <Button asChild className="bg-primary h-11 font-medium text-primary-foreground hover:bg-primary/90">
          <Link to="/analyze" search={{}}>
            Start analysis <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- footer */

function HomeFooter() {
  return (
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 sm:px-6">
      <span className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-muted-surface">
          <Shield className="h-3.5 w-3.5 text-primary" />
        </span>
        <span className="font-data text-xs text-muted-foreground">MKChain</span>
      </span>
      <a
        href="https://github.com/sumit-prajapat/mkchain"
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 font-data text-xs text-muted-foreground transition-colors hover:text-primary"
      >
        <Github className="h-3.5 w-3.5" /> GitHub
      </a>
      <a
        href="https://github.com/sumit-prajapat/mkchain#api"
        target="_blank"
        rel="noreferrer noopener"
        className="font-data text-xs text-muted-foreground transition-colors hover:text-primary"
      >
        API docs
      </a>
      <span className="font-data text-xs text-muted-foreground">v2.0.0</span>
      <span className="font-data text-xs text-muted-foreground">Open-source · No login required for public data</span>
    </div>
  );
}

/* ----------------------------------------------------------------- page */

function Home() {
  return (
    <div>
      <Hero />
      <StatsStrip />
      <Explainer />
      <Pipeline />
      <DemoWallets />
      <Capabilities />
      <SourcesStrip />
      <FinalCta />
      <HomeFooter />
    </div>
  );
}
