import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Shield, GitBranch, Brain, FileText, ChevronRight, Zap, Globe, Eye } from 'lucide-react'

/* ── Particle Network Canvas ─────────────────────────── */
function ParticleCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animId

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    const NODES = 60
    const nodes = Array.from({ length: NODES }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 2.5 + 1,
      type: Math.random() < 0.08 ? 'mixer' : Math.random() < 0.15 ? 'exchange' : 'wallet',
      pulse: Math.random() * Math.PI * 2,
    }))

    const COLORS = { mixer: '#ff0040', exchange: '#ffd700', wallet: '#00f5ff' }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.18
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.strokeStyle = nodes[i].type === 'mixer' || nodes[j].type === 'mixer'
              ? `rgba(255,0,64,${alpha})` : `rgba(0,245,255,${alpha})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      // Nodes
      nodes.forEach(n => {
        n.pulse += 0.02
        const glow = Math.sin(n.pulse) * 0.3 + 0.7
        const color = COLORS[n.type]

        // Glow halo
        if (n.type === 'mixer') {
          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 8)
          grad.addColorStop(0, `rgba(255,0,64,${0.15 * glow})`)
          grad.addColorStop(1, 'transparent')
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r * 8, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()
        }

        // Node circle
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.7 * glow
        ctx.fill()
        ctx.globalAlpha = 1

        // Update position
        n.x += n.vx; n.y += n.vy
        if (n.x < 0 || n.x > canvas.width)  n.vx *= -1
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1
      })

      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.6, pointerEvents: 'none', zIndex: 0 }} />
}

/* ── Typing text effect ───────────────────────────────── */
function TypedText({ texts }) {
  const [idx, setIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const target = texts[idx]
    let timeout

    if (!deleting && displayed.length < target.length) {
      timeout = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 60)
    } else if (!deleting && displayed.length === target.length) {
      timeout = setTimeout(() => setDeleting(true), 2000)
    } else if (deleting && displayed.length > 0) {
      timeout = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 30)
    } else if (deleting && displayed.length === 0) {
      setDeleting(false)
      setIdx((idx + 1) % texts.length)
    }
    return () => clearTimeout(timeout)
  }, [displayed, deleting, idx, texts])

  return (
    <span style={{ color: 'var(--cyan)' }}>
      {displayed}
      <span className="animate-blink" style={{ color: 'var(--cyan)', marginLeft: 2 }}>█</span>
    </span>
  )
}

/* ── Stat counter ─────────────────────────────────────── */
function StatCard({ value, label, sub, color = 'var(--cyan)', delay }) {
  return (
    <div className={`card card-glow animate-fade-up delay-${delay}`} style={{ textAlign: 'center', padding: '24px 16px' }}>
      <div className="font-orbitron" style={{ fontSize: 36, fontWeight: 800, color, letterSpacing: 2, lineHeight: 1 }}>{value}</div>
      <div style={{ color: 'white', fontSize: 13, fontWeight: 600, marginTop: 8 }}>{label}</div>
      <div className="font-mono" style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 4, letterSpacing: 1 }}>{sub}</div>
    </div>
  )
}

const FEATURES = [
  { icon: GitBranch, title: 'Multi-Chain Tracing',  desc: 'Trace ETH, BTC, and Polygon transaction graphs up to 3 hops deep.',   color: 'var(--cyan)' },
  { icon: Brain,     title: 'ML Risk Scoring',      desc: 'Random Forest model scores wallets 0–100 on 21 behavioral features.',  color: 'var(--green)' },
  { icon: Eye,       title: 'Mixer Detection',      desc: 'Identifies Tornado Cash, tumblers, peel chains, and bridge hops.',     color: 'var(--purple)' },
  { icon: Globe,     title: 'OFAC / Dark Web DB',   desc: 'Checks against Lazarus Group, Hydra Market, WannaCry, Silk Road.',    color: 'var(--red)' },
  { icon: Zap,       title: 'Explainable AI',       desc: 'Every score comes with plain-English factor analysis and evidence.',   color: 'var(--gold)' },
  { icon: FileText,  title: 'Forensics PDF',        desc: 'Professional reports with graph exports for compliance and legal use.', color: 'var(--orange)' },
]

const SAMPLES = [
  { address: '0x7f367cc41522ce07553e823bf3be79a889debe1b', chain: 'eth', label: 'Hydra Market — OFAC Sanctioned',  risk: 'CRITICAL' },
  { address: '0x098b716b8aaf21512996dc57eb0615e2383e2f96', chain: 'eth', label: 'Lazarus Group — North Korea APT', risk: 'CRITICAL' },
  { address: '0x28c6c06298d514db089934071355e5743bf21d60', chain: 'eth', label: 'Binance Exchange Hot Wallet',     risk: 'LOW' },
]

export default function Home() {
  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>

      {/* ── HERO ─────────────────────────────────────────── */}
      <div style={{ position: 'relative', minHeight: '88vh', display: 'flex', alignItems: 'center' }}>
        <ParticleCanvas />

        {/* Radial glow center */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 800, height: 800, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,245,255,0.06) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', padding: '80px 24px', width: '100%' }}>

          {/* Status pill */}
          <div className="animate-fade-up" style={{ marginBottom: 32, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 18px', border: '1px solid rgba(0,245,255,0.2)', borderRadius: 100, background: 'rgba(0,245,255,0.04)' }}>
            <div className="live-dot" />
            <span className="font-mono" style={{ fontSize: 10, color: 'var(--cyan)', letterSpacing: 2 }}>
              LIVE · MULTI-CHAIN FORENSICS INTELLIGENCE
            </span>
          </div>

          {/* Main headline */}
          <h1 className="animate-fade-up delay-2 font-orbitron" style={{ fontSize: 'clamp(32px,5vw,72px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: -1, marginBottom: 24, color: 'white' }}>
            BLOCKCHAIN<br />
            <TypedText texts={['FORENSICS', 'INTELLIGENCE', 'ANALYTICS', 'TRACING']} />
          </h1>

          <p className="animate-fade-up delay-3" style={{ fontSize: 18, color: 'var(--text-dim)', maxWidth: 600, lineHeight: 1.7, marginBottom: 40 }}>
            Trace crypto transactions, detect mixers and dark web connections,
            and score wallet risk using machine learning — like Chainalysis, open source.
          </p>

          <div className="animate-fade-up delay-4" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Link to="/analyze" className="btn-primary" style={{ fontSize: 12, padding: '14px 36px' }}>
              <Search size={16} />
              ANALYZE WALLET
            </Link>
            <Link to="/history" className="btn-ghost" style={{ fontSize: 12, padding: '14px 28px' }}>
              VIEW HISTORY
              <ChevronRight size={14} />
            </Link>
          </div>

          {/* Terminal block */}
          <div className="animate-fade-up delay-5" style={{ marginTop: 56, maxWidth: 520 }}>
            <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glow)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: 'var(--border)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                {['#ff5f57','#febc2e','#28c840'].map((c,i) => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
                <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8, letterSpacing: 1 }}>mkchain — forensics</span>
              </div>
              <div style={{ padding: '16px 20px' }}>
                {[
                  ['$', 'mkchain analyze 0x7f367cc...', 'var(--cyan)'],
                  ['›', 'Fetching 100 transactions... done', 'var(--green)'],
                  ['›', 'Building multi-hop graph (2 hops)...', 'var(--text-dim)'],
                  ['›', 'Detected: MIXER_INTERACTION, DARKWEB_MATCH', 'var(--red)'],
                  ['›', 'ML Risk Score: 97.4 / 100 [CRITICAL]', 'var(--red)'],
                ].map(([prefix, text, color], i) => (
                  <div key={i} className={`terminal-line animate-fade-up delay-${i + 4}`} style={{ marginBottom: 6, color }}>
                    <span style={{ color: 'var(--cyan)', marginRight: 8, minWidth: 12 }}>{prefix}</span>
                    <span style={{ color }}>{text}</span>
                  </div>
                ))}
                <div className="terminal-line" style={{ marginTop: 4 }}>
                  <span style={{ color: 'var(--cyan)', marginRight: 8 }}>$</span>
                  <span className="animate-blink" style={{ color: 'var(--cyan)' }}>█</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 80px' }}>

        {/* ── Stats ─────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 80 }}>
          <StatCard value="3"   label="Chains Supported"      sub="ETH · BTC · MATIC"    color="var(--cyan)"   delay={1} />
          <StatCard value="21"  label="ML Features"           sub="Random Forest Model"   color="var(--green)"  delay={2} />
          <StatCard value="15+" label="Bad Address DB"         sub="OFAC + Darkweb"       color="var(--red)"    delay={3} />
          <StatCard value="8"   label="Pattern Detectors"     sub="Mixer · Peel · Struct" color="var(--gold)"   delay={4} />
        </div>

        {/* ── Features ──────────────────────────────────── */}
        <div style={{ marginBottom: 80 }}>
          <div className="animate-fade-up" style={{ marginBottom: 40 }}>
            <div className="font-mono" style={{ color: 'var(--cyan)', fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>// CAPABILITIES</div>
            <h2 className="font-orbitron" style={{ fontSize: 28, fontWeight: 700, color: 'white', letterSpacing: 1 }}>What MKChain Detects</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
            {FEATURES.map(({ icon: Icon, title, desc, color }, i) => (
              <div key={title} className={`card animate-fade-up delay-${i + 1}`}
                style={{ transition: 'all 0.3s', cursor: 'default' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = color + '44'; e.currentTarget.style.boxShadow = `0 0 30px ${color}11` }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = '' }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: color + '15', border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Icon size={18} color={color} />
                </div>
                <h3 className="font-orbitron" style={{ fontSize: 12, fontWeight: 600, color: 'white', letterSpacing: 1, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sample wallets ────────────────────────────── */}
        <div>
          <div className="animate-fade-up" style={{ marginBottom: 28 }}>
            <div className="font-mono" style={{ color: 'var(--cyan)', fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>// KNOWN CASES</div>
            <h2 className="font-orbitron" style={{ fontSize: 28, fontWeight: 700, color: 'white', letterSpacing: 1 }}>Try These Wallets</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {SAMPLES.map((w, i) => (
              <Link key={w.address} to={`/analyze?address=${w.address}&chain=${w.chain}`}
                className={`card animate-fade-up delay-${i + 2}`}
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, transition: 'all 0.25s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = w.risk === 'CRITICAL' ? 'rgba(255,0,64,0.4)' : 'rgba(0,255,136,0.3)'; e.currentTarget.style.transform = 'translateX(4px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = '' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <span className={`font-orbitron ${w.risk === 'CRITICAL' ? 'risk-critical' : 'risk-low'}`}
                    style={{ fontSize: 9, fontWeight: 700, padding: '4px 10px', borderRadius: 4, letterSpacing: 1.5, whiteSpace: 'nowrap' }}>
                    {w.risk}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'white', fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{w.label}</div>
                    <div className="font-mono" style={{ color: 'var(--text-dim)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.address}</div>
                  </div>
                </div>
                <ChevronRight size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
