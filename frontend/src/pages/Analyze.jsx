import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, AlertCircle, Loader, Info, ChevronRight } from 'lucide-react'
import { analyzeWallet } from '../api'

const CHAINS = [
  { id:'eth',     label:'Ethereum',  sym:'ETH',  color:'#7eb4ff', ph:'0x742d35Cc6634C0532925a3b8D4C9...' },
  { id:'btc',     label:'Bitcoin',   sym:'BTC',  color:'var(--orange)', ph:'1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
  { id:'polygon', label:'Polygon',   sym:'MATIC',color:'var(--purple)', ph:'0x742d35Cc6634C0532925a3b8D4C9...' },
]

const CHECKS = ['100 transactions fetched','Multi-hop graph built','Mixer contracts checked','OFAC sanctions scanned','Peel chain detected','Velocity analyzed','Dark web DB queried','ML risk scored']

function LoadingOverlay({ address, chain }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s + 1, CHECKS.length - 1)), 3000)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(3,6,16,0.95)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(8px)' }}>
      <div style={{ maxWidth:500, width:'100%', padding:40 }}>
        {/* Spinner */}
        <div style={{ display:'flex', justifyContent:'center', marginBottom:40 }}>
          <div style={{ position:'relative', width:80, height:80 }}>
            <div className="animate-spin-slow" style={{ position:'absolute', inset:0, border:'1px solid var(--cyan)', borderRadius:'50%', borderTopColor:'transparent', borderRightColor:'transparent' }} />
            <div style={{ position:'absolute', inset:8, border:'1px solid rgba(0,245,255,0.3)', borderRadius:'50%' }} />
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Search size={22} color="var(--cyan)" />
            </div>
          </div>
        </div>

        <div className="font-orbitron" style={{ textAlign:'center', fontSize:18, fontWeight:700, color:'white', letterSpacing:2, marginBottom:8 }}>
          ANALYZING WALLET
        </div>
        <div className="font-mono" style={{ textAlign:'center', fontSize:10, color:'var(--text-dim)', marginBottom:32, wordBreak:'break-all' }}>
          {address?.slice(0,20)}...{address?.slice(-8)} · {chain?.toUpperCase()}
        </div>

        {/* Progress steps */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {CHECKS.map((check, i) => (
            <div key={check} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 14px', borderRadius:6, background: i <= step ? 'rgba(0,245,255,0.05)' : 'transparent', border:`1px solid ${i <= step ? 'rgba(0,245,255,0.15)' : 'transparent'}`, transition:'all 0.4s' }}>
              <div style={{ width:16, height:16, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                background: i < step ? 'var(--green)' : i === step ? 'var(--cyan)' : 'var(--border)',
                boxShadow: i <= step ? `0 0 10px ${i < step ? 'var(--green)' : 'var(--cyan)'}88` : 'none',
                transition:'all 0.4s'
              }}>
                {i < step ? <span style={{ fontSize:9, color:'black', fontWeight:900 }}>✓</span>
                  : i === step ? <Loader size={8} className="animate-spin-slow" color="var(--void)" />
                  : null}
              </div>
              <span className="font-mono" style={{ fontSize:11, color: i <= step ? 'var(--text)' : 'var(--text-muted)', letterSpacing:0.5, transition:'color 0.4s' }}>{check}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ marginTop:24, height:2, background:'var(--border)', borderRadius:1, overflow:'hidden' }}>
          <div style={{ height:'100%', background:'linear-gradient(90deg,var(--cyan),var(--green))', transition:'width 3s ease', width:`${((step + 1) / CHECKS.length) * 100}%`, boxShadow:'0 0 10px var(--cyan)' }} />
        </div>
      </div>
    </div>
  )
}

export default function Analyze() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [address, setAddress] = useState(params.get('address') || '')
  const [chain,   setChain]   = useState(params.get('chain')   || 'eth')
  const [hops,    setHops]    = useState(2)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => { if (params.get('address')) handleSubmit(null, true) }, [])

  async function handleSubmit(e, auto = false) {
    if (e) e.preventDefault()
    if (!address.trim()) return
    setLoading(true); setError('')
    try {
      const r = await analyzeWallet(address.trim(), chain, hops)
      navigate(`/results/${r.id}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Analysis failed. Check address format.')
      setLoading(false)
    }
  }

  const selectedChain = CHAINS.find(c => c.id === chain)

  return (
    <>
      {loading && <LoadingOverlay address={address} chain={chain} />}
      <div style={{ maxWidth:680, margin:'0 auto', padding:'40px 24px' }}>

        {/* Header */}
        <div className="animate-fade-up" style={{ marginBottom:40 }}>
          <div className="font-mono" style={{ color:'var(--cyan)', fontSize:11, letterSpacing:3, marginBottom:10 }}>// FORENSICS ANALYSIS</div>
          <h1 className="font-orbitron" style={{ fontSize:32, fontWeight:800, color:'white', letterSpacing:2 }}>WALLET TRACER</h1>
          <p style={{ color:'var(--text-dim)', marginTop:10, fontSize:14, lineHeight:1.6 }}>Enter any crypto wallet to run a complete forensics investigation.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>

          {/* Chain selector */}
          <div className="animate-fade-up delay-1" style={{ marginBottom:24 }}>
            <div className="font-mono" style={{ fontSize:10, color:'var(--text-dim)', letterSpacing:2, marginBottom:12 }}>SELECT CHAIN</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              {CHAINS.map(c => (
                <button key={c.id} type="button" onClick={() => setChain(c.id)}
                  style={{
                    padding:'14px 10px', borderRadius:8, cursor:'pointer', transition:'all 0.25s',
                    background: chain === c.id ? `${c.color}15` : 'var(--panel)',
                    border: `1px solid ${chain === c.id ? c.color + '50' : 'var(--border)'}`,
                    boxShadow: chain === c.id ? `0 0 20px ${c.color}20` : 'none',
                  }}>
                  <div className="font-orbitron" style={{ fontSize:14, fontWeight:800, color: chain === c.id ? c.color : 'var(--text-dim)', letterSpacing:2 }}>{c.sym}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>{c.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Address input */}
          <div className="animate-fade-up delay-2" style={{ marginBottom:24 }}>
            <div className="font-mono" style={{ fontSize:10, color:'var(--text-dim)', letterSpacing:2, marginBottom:12 }}>WALLET ADDRESS</div>
            <div style={{ position:'relative' }}>
              <Search size={14} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }} />
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                placeholder={selectedChain?.ph}
                style={{
                  width:'100%', background:'var(--deep)', border:`1px solid ${address ? 'var(--border-glow)' : 'var(--border)'}`,
                  borderRadius:8, paddingLeft:42, paddingRight:16, paddingTop:14, paddingBottom:14,
                  color:'white', fontFamily:'IBM Plex Mono', fontSize:12, outline:'none',
                  transition:'border-color 0.25s, box-shadow 0.25s',
                  boxShadow: address ? '0 0 20px rgba(0,245,255,0.05)' : 'none',
                }}
                onFocus={e => e.target.style.borderColor='var(--cyan)'}
                onBlur={e => e.target.style.borderColor = address ? 'var(--border-glow)' : 'var(--border)'}
              />
            </div>
          </div>

          {/* Hop slider */}
          <div className="animate-fade-up delay-3" style={{ marginBottom:28 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div className="font-mono" style={{ fontSize:10, color:'var(--text-dim)', letterSpacing:2 }}>TRACE DEPTH</div>
              <div className="font-orbitron" style={{ fontSize:12, color:'var(--cyan)', fontWeight:700, letterSpacing:1 }}>
                {hops} HOP{hops > 1 ? 'S' : ''} — {hops === 1 ? 'FAST' : hops === 2 ? 'RECOMMENDED' : 'DEEP TRACE'}
              </div>
            </div>
            <input type="range" min={1} max={3} value={hops} onChange={e => setHops(+e.target.value)} />
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
              {['1 — Fast','2 — Balanced','3 — Deep'].map(l => (
                <span key={l} className="font-mono" style={{ fontSize:9, color:'var(--text-muted)', letterSpacing:1 }}>{l}</span>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="animate-fade-up" style={{ display:'flex', gap:10, background:'rgba(255,0,64,0.08)', border:'1px solid rgba(255,0,64,0.25)', borderRadius:8, padding:'12px 16px', marginBottom:20 }}>
              <AlertCircle size={16} color="var(--red)" style={{ flexShrink:0 }} />
              <span style={{ fontSize:13, color:'var(--red)' }}>{error}</span>
            </div>
          )}

          {/* Submit */}
          <div className="animate-fade-up delay-4">
            <button type="submit" disabled={loading || !address.trim()} className="btn-primary" style={{ width:'100%', justifyContent:'center', padding:'16px', fontSize:12, letterSpacing:3 }}>
              {loading
                ? <><Loader size={16} className="animate-spin-slow" /> ANALYZING...</>
                : <><Search size={16} /> RUN FORENSICS ANALYSIS</>}
            </button>
          </div>
        </form>

        {/* What we check */}
        <div className="card animate-fade-up delay-5" style={{ marginTop:32 }}>
          <div className="font-mono" style={{ fontSize:10, color:'var(--cyan)', letterSpacing:2, marginBottom:14 }}>// ANALYSIS PIPELINE</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {['Transaction history (100 txns)','Multi-hop graph tracing','Known mixer contracts','OFAC sanctions database',
              'Peel chain detection','Transaction velocity','Round-amount structuring','Dark web address DB'].map(item => (
              <div key={item} className="terminal-line" style={{ fontSize:11 }}>
                <span style={{ color:'var(--green)', marginRight:8 }}>✓</span>
                <span style={{ color:'var(--text-dim)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  )
}
