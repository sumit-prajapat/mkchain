'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, AlertTriangle, Shield, Download,
  ChevronRight, Activity, Wallet, ExternalLink,
  Clock, Hash, ArrowUpRight, ArrowDownRight,
  CheckCircle2, XCircle, WifiOff
} from 'lucide-react'
import { analyzeWallet, getAnalysisPdf, checkBackendHealth, type AnalysisResult } from '@/lib/api-client'
import RiskGauge from '@/components/analyze/RiskGauge'

const CHAINS = [
  { id: 'eth',     label: 'Ethereum',  icon: '⬡', placeholder: '0x742d35Cc6634C0532925a3b8D4C9C0F966d3c261' },
  { id: 'btc',     label: 'Bitcoin',   icon: '₿', placeholder: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
  { id: 'polygon', label: 'Polygon',   icon: '⬟', placeholder: '0x742d35Cc6634C0532925a3b8D4C9C0F966d3c261' },
]

const SEVERITY_CONFIG = {
  critical: { color: 'text-destructive', bg: 'bg-destructive/20', border: 'border-destructive/40' },
  high:     { color: 'text-destructive/80', bg: 'bg-destructive/10', border: 'border-destructive/30' },
  medium:   { color: 'text-chart-4', bg: 'bg-chart-4/10', border: 'border-chart-4/30' },
  low:      { color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30' },
}

// Demo result when backend is offline
const DEMO_RESULT: AnalysisResult = {
  id: 'demo-001',
  address: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
  chain: 'eth',
  risk_score: 87,
  risk_label: 'critical',
  patterns: [
    { pattern: 'Tornado Cash Interaction', severity: 'critical', description: 'Address has direct interaction with Tornado Cash mixer contract' },
    { pattern: 'Peel Chain Detected', severity: 'high', description: 'Structured transaction pattern consistent with fund obfuscation' },
    { pattern: 'High Velocity Transfers', severity: 'medium', description: '47 transactions in under 60 minutes detected' },
  ],
  graph_nodes: [],
  graph_edges: [],
  ai_summary: 'This wallet exhibits multiple high-risk behavioral patterns including direct interaction with sanctioned mixer contracts (Tornado Cash) and structured peel chain activity. The transaction velocity and fund flow patterns are consistent with money laundering behavior. Recommend immediate flagging and escalation to compliance team.',
  dark_web_hits: ['Hydra Market', 'AlphaBay (historical)'],
  total_received: 142500,
  total_sent: 141200,
  tx_count: 234,
  hop_depth: 2,
  created_at: new Date().toISOString(),
}

export default function AnalyzePage() {
  const [address, setAddress] = useState('')
  const [chain, setChain] = useState<'eth' | 'btc' | 'polygon'>('eth')
  const [hopDepth, setHopDepth] = useState(2)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const selectedChain = CHAINS.find(c => c.id === chain)!

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault()
    if (!address.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)
    setIsDemo(false)

    try {
      const data = await analyzeWallet({
        address: address.trim(),
        chain,
        hop_depth: hopDepth,
      })
      setResult(data)
    } catch (err: any) {
      if (err.status === 429) {
        setError('Rate limit exceeded. Please wait a moment before trying again.')
      } else if (err.status === 401) {
        setError('Invalid API key. Go to API Keys page to generate one.')
      } else {
        setError(err.detail ?? err.message ?? `Analysis failed (${err.status ?? 'network error'}). Check console for details.`)
        console.error('Analysis error:', err)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadPdf() {
    if (!result || isDemo) return
    setDownloadingPdf(true)
    try {
      const blob = await getAnalysisPdf(result.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mkchain-report-${result.address.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to download PDF report.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  function loadDemo() {
    setAddress(DEMO_RESULT.address)
    setChain('eth')
    setResult(DEMO_RESULT)
    setIsDemo(true)
    setError(null)
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Wallet Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trace addresses across ETH, BTC, and Polygon
          </p>
        </div>
        <button
          onClick={loadDemo}
          className="text-xs text-primary hover:text-primary/80 border border-primary/30 px-3 py-1.5 rounded-md transition-colors"
        >
          Load demo
        </button>
      </div>

      {/* Analysis form */}
      <div className="rounded-xl border border-border bg-card/50 p-5">
        <form onSubmit={handleAnalyze} className="space-y-4">
          {/* Chain selector */}
          <div className="flex gap-2">
            {CHAINS.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChain(c.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-all ${
                  chain === c.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                <span>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>

          {/* Address input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder={selectedChain.placeholder}
              className="w-full h-11 pl-10 pr-4 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary font-mono"
            />
          </div>

          {/* Options row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground">Hop depth:</label>
              <div className="flex gap-1">
                {[1, 2, 3].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setHopDepth(d)}
                    className={`w-8 h-7 rounded text-xs border transition-all ${
                      hopDepth === d
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {hopDepth === 1 ? 'Fast' : hopDepth === 2 ? 'Standard' : 'Deep (slow)'}
              </span>
            </div>

            <button
              type="submit"
              disabled={loading || !address.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Analyze
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </motion.div>
      )}

      {/* Demo banner */}
      {isDemo && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-chart-4/40 bg-chart-4/10 text-chart-4 text-sm">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            Backend offline — showing demo result. Start Docker to run real analysis.
          </span>
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* Top row — risk gauge + summary stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Risk gauge */}
              <div className="rounded-xl border border-border bg-card/50 p-5 flex flex-col items-center justify-center">
                <RiskGauge score={result.risk_score} label={result.risk_label} />
                <div className="mt-3 text-center">
                  <code className="text-xs text-muted-foreground font-mono break-all">
                    {result.address.slice(0, 10)}…{result.address.slice(-6)}
                  </code>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {result.chain.toUpperCase()} · {result.hop_depth ?? 2} hop{(result.hop_depth ?? 2) > 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                {[
                  { label: 'Total volume', value: `$${((result.total_received ?? result.total_volume ?? 0) as number).toLocaleString()}`, icon: ArrowDownRight, color: 'text-accent' },
                  { label: 'Total sent', value: `$${((result.total_sent ?? 0) as number).toLocaleString()}`, icon: ArrowUpRight, color: 'text-destructive' },
                  { label: 'Transactions', value: ((result.tx_count ?? result.total_txns ?? 0) as number).toLocaleString(), icon: Activity, color: 'text-primary' },
                  { label: 'Risk flags', value: ((result.patterns ?? result.flags ?? []) as any[]).length.toString(), icon: AlertTriangle, color: ((result.patterns ?? result.flags ?? []) as any[]).length > 0 ? 'text-destructive' : 'text-muted-foreground' },
                ].map(stat => (
                  <div key={stat.label} className="rounded-lg border border-border bg-secondary/30 p-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                      <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                      {stat.label}
                    </div>
                    <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                  </div>
                ))}

                {/* PDF Download */}
                <div className="col-span-2 flex gap-2">
                  <button
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf || isDemo}
                    className="flex items-center gap-2 px-4 py-2 border border-border rounded-md text-sm text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="h-4 w-4" />
                    {downloadingPdf ? 'Downloading…' : isDemo ? 'PDF (backend required)' : 'Download PDF report'}
                  </button>
                  <a
                    href={`https://etherscan.io/address/${result.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View on explorer
                  </a>
                </div>
              </div>
            </div>

            {/* Pattern flags */}
            {((result.patterns ?? result.flags ?? []) as any[]).length > 0 && (
              <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
                <div className="flex items-center gap-2 p-4 border-b border-border">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="font-medium text-foreground text-sm">
                    Detected patterns ({((result.patterns ?? result.flags ?? []) as any[]).length})
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {((result.patterns ?? result.flags ?? []) as any[]).map((p: any, i: number) => {
                    const isString = typeof p === 'string'
                    const label = isString ? p : (p.pattern ?? p)
                    const severity = isString ? 'medium' : (p.severity ?? 'medium')
                    const desc = isString ? '' : (p.description ?? '')
                    const cfg = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.medium
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="p-4 flex items-start gap-3"
                      >
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border shrink-0 mt-0.5 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                          {severity.toUpperCase()}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-foreground">{label}</div>
                          {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Dark web hits */}
            {((result.dark_web_hits ?? []) as string[]).length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">
                    Dark web / OSINT matches
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {((result.dark_web_hits ?? []) as string[]).map((hit: string) => (
                    <span key={hit} className="px-2 py-1 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs">
                      {hit}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {result.ai_summary && (
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">AI forensics summary</span>
                  <span className="text-xs text-muted-foreground ml-auto">Powered by Groq Llama-3</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {result.ai_summary}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground">Enter a wallet address above to start analysis</p>
          <p className="text-xs text-muted-foreground mt-1">
            Supports Ethereum, Bitcoin, and Polygon addresses
          </p>
          <button onClick={loadDemo} className="mt-4 text-xs text-primary hover:text-primary/80 transition-colors">
            Try a demo analysis →
          </button>
        </div>
      )}
    </div>
  )
}