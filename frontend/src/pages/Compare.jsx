import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, AlertTriangle, Loader, GitBranch, ArrowRight, Zap, Shield } from 'lucide-react'
import { compareWallets } from '../api'

const CHAINS = [
  { id:'eth', label:'ETH', color:'#7eb4ff' },
  { id:'btc', label:'BTC', color:'var(--orange)' },
  { id:'polygon', label:'MATIC', color:'var(--purple)' },
]
const riskColor = { CRITICAL:'var(--red)', HIGH:'var(--orange)', MEDIUM:'var(--gold)', LOW:'var(--green)' }
const FLAG_LABELS = {
  mixer_interaction:'Mixer Interaction', darkweb_match:'Dark Web Match',
  peel_chain_detected:'Peel Chain', layered_mixer_routing:'Layered Routing',
  high_velocity:'High Velocity', round_amount_structuring:'Structuring',
  dormancy_then_activity:'Dormancy→Activity', high_fan_out:'High Fan-Out',
}

function ChainSelector({ value, onChange }) {
  return (
    <div style={{ display:'flex', gap:6 }}>
      {CHAINS.map(c => (
        <button key={c.id} onClick={() => onChange(c.id)} style={{
          padding:'5px 12px', borderRadius:4, cursor:'pointer', transition:'all .2s',
          fontFamily:'Oxanium', fontSize:9, fontWeight:700, letterSpacing:1.5, border:'none',
          background: value===c.id ? `${c.color}20` : 'var(--panel)',
          color: value===c.id ? c.color : 'var(--dim)',
          border: `1px solid ${value===c.id ? c.color+'50' : 'var(--border)'}`,
        }}>{c.label}</button>
      ))}
    </div>
  )
}

function WalletPanel({ data, side }) {
  const rc = riskColor[data.risk_label] || 'var(--cyan)'
  const score = data.risk_score || 0
  return (
    <div className="card card-glow" style={{ flex:1, minWidth:0 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:2 }}>
          WALLET {side}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <span className={`chain-${data.chain}`} style={{ fontFamily:'Oxanium', fontSize:8, fontWeight:700, padding:'3px 8px', borderRadius:3, letterSpacing:2 }}>
            {data.chain?.toUpperCase()}
          </span>
          <span className={`risk-${data.risk_label?.toLowerCase()}`} style={{ fontFamily:'Oxanium', fontSize:8, fontWeight:700, padding:'3px 8px', borderRadius:3, letterSpacing:2 }}>
            {data.risk_label}
          </span>
        </div>
      </div>

      {/* Address */}
      <div className="font-mono" style={{ fontSize:9, color:'white', wordBreak:'break-all', marginBottom:16,
        padding:'8px 10px', background:'rgba(0,0,0,.3)', borderRadius:6, border:'1px solid var(--border)' }}>
        {data.address}
      </div>

      {/* Score gauge */}
      <div style={{ textAlign:'center', marginBottom:20 }}>
        <div className="font-orbitron" style={{ fontSize:52, fontWeight:900, color:rc, lineHeight:1 }}>
          {Math.round(score)}
        </div>
        <div className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:2, marginTop:4 }}>
          RISK SCORE / 100
        </div>
        <div style={{ marginTop:12, height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${score}%`, background:`linear-gradient(90deg, var(--green), ${rc})`,
            borderRadius:3, transition:'width 1s ease', boxShadow:`0 0 12px ${rc}66` }}/>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
        {[
          ['TOTAL TXNS', data.total_txns?.toLocaleString()],
          ['VOLUME', parseFloat(data.total_volume||0).toFixed(4)],
          ['GRAPH NODES', data.graph_stats?.total_nodes],
          ['RISK FLAGS', data.flags?.length || 0],
        ].map(([label, val]) => (
          <div key={label} style={{ background:'rgba(0,0,0,.2)', borderRadius:6, padding:'8px 10px' }}>
            <div className="font-mono" style={{ fontSize:7, color:'var(--dim)', letterSpacing:1.5, marginBottom:3 }}>{label}</div>
            <div className="font-orbitron" style={{ fontSize:14, fontWeight:700, color:'white' }}>{val ?? '—'}</div>
          </div>
        ))}
      </div>

      {/* Flags */}
      {data.flags?.length > 0 && (
        <div>
          <div className="font-mono" style={{ fontSize:8, color:'var(--cyan)', letterSpacing:2, marginBottom:8 }}>RISK FLAGS</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {data.flags.map(f => (
              <span key={f} style={{ fontFamily:'Oxanium', fontSize:8, fontWeight:700, letterSpacing:1,
                padding:'3px 8px', borderRadius:3, color:'var(--gold)',
                background:'rgba(255,196,0,.08)', border:'1px solid rgba(255,196,0,.2)' }}>
                {FLAG_LABELS[f] || f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* OSINT */}
      {data.osint_direct?.is_known_bad && (
        <div style={{ marginTop:12, padding:'10px 12px', background:'rgba(255,0,51,.07)',
          border:'1px solid rgba(255,0,51,.25)', borderRadius:8 }}>
          <div className="font-orbitron" style={{ fontSize:9, color:'var(--red)', letterSpacing:2, marginBottom:4 }}>
            ⚠ OFAC / OSINT MATCH
          </div>
          <div style={{ fontSize:12, color:'white', fontWeight:600 }}>{data.osint_direct.label}</div>
          <div className="font-mono" style={{ fontSize:8, color:'rgba(255,0,51,.6)', marginTop:3 }}>
            {data.osint_direct.category?.replace(/_/g,' ').toUpperCase()}
          </div>
        </div>
      )}

      {/* Full results link */}
      <div style={{ marginTop:16 }}>
        <Link to="/analyze" style={{ textDecoration:'none' }}>
          <button className="btn-ghost" style={{ width:'100%', justifyContent:'center', fontSize:9, letterSpacing:2, padding:'9px' }}>
            FULL ANALYSIS <ArrowRight size={11}/>
          </button>
        </Link>
      </div>
    </div>
  )
}

function SharedIntel({ shared }) {
  const rc = riskColor[shared.combined_risk] || 'var(--cyan)'
  return (
    <div className="card" style={{ background:'rgba(0,0,0,.4)', border:`1px solid ${rc}30` }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
        <GitBranch size={16} color={rc}/>
        <span className="font-orbitron" style={{ fontSize:12, fontWeight:700, color:'white', letterSpacing:2 }}>
          SHARED INTELLIGENCE
        </span>
        <span style={{ marginLeft:'auto', fontFamily:'Oxanium', fontSize:9, fontWeight:700, letterSpacing:2,
          padding:'4px 12px', borderRadius:4, color:rc, background:`${rc}15`, border:`1px solid ${rc}30` }}>
          {shared.relationship}
        </span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'RISK DELTA',     value:`${shared.risk_delta}pts`, color: shared.risk_delta > 30 ? 'var(--red)' : 'var(--gold)' },
          { label:'SHARED NODES',   value:shared.shared_node_count,  color: shared.shared_node_count > 0 ? 'var(--orange)' : 'var(--green)' },
          { label:'SHARED FLAGS',   value:shared.shared_flags?.length || 0, color: shared.shared_flags?.length > 0 ? 'var(--red)' : 'var(--green)' },
          { label:'DIRECT LINK',    value:shared.direct_link ? 'YES' : 'NO', color: shared.direct_link ? 'var(--red)' : 'var(--green)' },
        ].map(({ label,value,color }) => (
          <div key={label} style={{ textAlign:'center', padding:'12px', background:'rgba(0,0,0,.3)', borderRadius:8, border:'1px solid var(--border)' }}>
            <div className="font-orbitron" style={{ fontSize:20, fontWeight:800, color, lineHeight:1 }}>{value}</div>
            <div className="font-mono" style={{ fontSize:7, color:'var(--dim)', letterSpacing:1.5, marginTop:5 }}>{label}</div>
          </div>
        ))}
      </div>

      {shared.direct_link && (
        <div style={{ padding:'10px 14px', background:'rgba(255,0,51,.08)', border:'1px solid rgba(255,0,51,.3)',
          borderRadius:8, marginBottom:12 }}>
          <div className="font-orbitron" style={{ fontSize:10, color:'var(--red)', letterSpacing:2 }}>
            🔗 DIRECT TRANSACTION LINK DETECTED
          </div>
          <div style={{ fontSize:12, color:'var(--text-dim)', marginTop:4 }}>
            These two wallets have directly transacted with each other.
          </div>
        </div>
      )}

      {shared.shared_flags?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div className="font-mono" style={{ fontSize:8, color:'var(--gold)', letterSpacing:2, marginBottom:8 }}>SHARED RISK PATTERNS</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {shared.shared_flags.map(f => (
              <span key={f} style={{ fontFamily:'Oxanium', fontSize:8, fontWeight:700, letterSpacing:1,
                padding:'3px 8px', borderRadius:3, color:'var(--gold)',
                background:'rgba(255,196,0,.08)', border:'1px solid rgba(255,196,0,.25)' }}>
                {FLAG_LABELS[f] || f}
              </span>
            ))}
          </div>
        </div>
      )}

      {shared.shared_nodes?.length > 0 && (
        <div>
          <div className="font-mono" style={{ fontSize:8, color:'var(--orange)', letterSpacing:2, marginBottom:8 }}>
            SHARED COUNTERPARTY ADDRESSES ({shared.shared_node_count})
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {shared.shared_nodes.slice(0,5).map(addr => (
              <div key={addr} className="font-mono" style={{ fontSize:9, color:'var(--text-dim)',
                padding:'5px 10px', background:'rgba(255,109,0,.05)', borderRadius:4,
                border:'1px solid rgba(255,109,0,.15)', wordBreak:'break-all' }}>
                {addr}
              </div>
            ))}
            {shared.shared_node_count > 5 && (
              <div className="font-mono" style={{ fontSize:8, color:'var(--dim)', textAlign:'center', padding:'4px' }}>
                +{shared.shared_node_count - 5} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Compare() {
  const [addrA, setAddrA]   = useState('')
  const [chainA, setChainA] = useState('eth')
  const [addrB, setAddrB]   = useState('')
  const [chainB, setChainB] = useState('eth')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleCompare() {
    if (!addrA.trim() || !addrB.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await compareWallets(addrA.trim(), chainA, addrB.trim(), chainB)
      setResult(r)
    } catch(err) {
      setError(err?.response?.data?.detail || 'Comparison failed. Check address formats.')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth:1200, margin:'0 auto', padding:'40px 24px' }}>

      {/* Header */}
      <div className="animate-fade-up" style={{ marginBottom:40 }}>
        <div className="font-mono" style={{ color:'var(--cyan)', fontSize:11, letterSpacing:3, marginBottom:10 }}>
          // DUAL WALLET FORENSICS
        </div>
        <h1 className="font-orbitron" style={{ fontSize:32, fontWeight:800, color:'white', letterSpacing:2 }}>
          WALLET COMPARISON
        </h1>
        <p style={{ color:'var(--text-dim)', marginTop:10, fontSize:14, lineHeight:1.6 }}>
          Analyze two wallets side by side — detect shared counterparties, common flags, and direct transaction links.
        </p>
      </div>

      {/* Input form */}
      <div className="animate-fade-up d1 card" style={{ marginBottom:32 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:20, alignItems:'end' }}>

          {/* Wallet A */}
          <div>
            <div className="font-mono" style={{ fontSize:9, color:'var(--cyan)', letterSpacing:2, marginBottom:10 }}>
              WALLET A
            </div>
            <input value={addrA} onChange={e=>setAddrA(e.target.value)}
              placeholder="0x... or 1..."
              style={{ width:'100%', background:'var(--deep)', border:'1px solid var(--border)',
                borderRadius:8, padding:'12px 14px', color:'white', fontFamily:'Space Mono',
                fontSize:11, outline:'none', marginBottom:10, transition:'border-color .2s' }}
              onFocus={e=>e.target.style.borderColor='var(--cyan)'}
              onBlur={e=>e.target.style.borderColor='var(--border)'}/>
            <ChainSelector value={chainA} onChange={setChainA}/>
          </div>

          {/* VS */}
          <div style={{ textAlign:'center', padding:'0 8px' }}>
            <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(0,229,255,.06)',
              border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 8px' }}>
              <Zap size={18} color="var(--cyan)"/>
            </div>
            <div className="font-orbitron" style={{ fontSize:11, fontWeight:800, color:'var(--dim)', letterSpacing:3 }}>VS</div>
          </div>

          {/* Wallet B */}
          <div>
            <div className="font-mono" style={{ fontSize:9, color:'var(--purple)', letterSpacing:2, marginBottom:10 }}>
              WALLET B
            </div>
            <input value={addrB} onChange={e=>setAddrB(e.target.value)}
              placeholder="0x... or 1..."
              style={{ width:'100%', background:'var(--deep)', border:'1px solid var(--border)',
                borderRadius:8, padding:'12px 14px', color:'white', fontFamily:'Space Mono',
                fontSize:11, outline:'none', marginBottom:10, transition:'border-color .2s' }}
              onFocus={e=>e.target.style.borderColor='var(--purple)'}
              onBlur={e=>e.target.style.borderColor='var(--border)'}/>
            <ChainSelector value={chainB} onChange={setChainB}/>
          </div>
        </div>

        {error && (
          <div style={{ display:'flex', gap:10, background:'rgba(255,0,64,.08)', border:'1px solid rgba(255,0,64,.25)',
            borderRadius:8, padding:'12px 16px', marginTop:16 }}>
            <AlertTriangle size={16} color="var(--red)"/>
            <span style={{ fontSize:13, color:'var(--red)' }}>{error}</span>
          </div>
        )}

        <button onClick={handleCompare} disabled={loading || !addrA.trim() || !addrB.trim()}
          className="btn-primary" style={{ width:'100%', justifyContent:'center', marginTop:20, fontSize:11, letterSpacing:3, padding:'14px' }}>
          {loading
            ? <><Loader size={15} className="animate-spin-slow"/> ANALYZING BOTH WALLETS...</>
            : <><GitBranch size={15}/> COMPARE WALLETS</>}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="card" style={{ textAlign:'center', padding:'60px' }}>
          <div style={{ display:'flex', justifyContent:'center', gap:32, marginBottom:24 }}>
            {[addrA, addrB].map((a,i) => (
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ width:48, height:48, borderRadius:'50%', border:`2px solid ${i===0?'var(--cyan)':'var(--purple)'}`,
                  borderTopColor:'transparent', animation:'spin 1.2s linear infinite', margin:'0 auto 10px' }}/>
                <div className="font-mono" style={{ fontSize:8, color:'var(--dim)', letterSpacing:1 }}>
                  {a.slice(0,12)}...
                </div>
              </div>
            ))}
          </div>
          <div className="font-orbitron" style={{ color:'white', fontSize:14, letterSpacing:2 }}>
            RUNNING PARALLEL ANALYSIS
          </div>
          <div className="font-mono" style={{ color:'var(--dim)', fontSize:10, marginTop:8 }}>
            Fetching transactions · Building graphs · Scoring risk
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="animate-fade-up">
          {/* Side by side */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>
            <WalletPanel data={result.wallet_a} side="A"/>
            <WalletPanel data={result.wallet_b} side="B"/>
          </div>

          {/* Shared intel */}
          <SharedIntel shared={result.shared}/>
        </div>
      )}

      {/* Quick test wallets */}
      {!result && !loading && (
        <div className="animate-fade-up d3 card" style={{ marginTop:8 }}>
          <div className="font-mono" style={{ fontSize:9, color:'var(--cyan)', letterSpacing:2, marginBottom:14 }}>// QUICK TEST</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { a:'0x098b716b8aaf21512996dc57eb0615e2383e2f96', ca:'eth', b:'0x7f367cc41522ce07553e823bf3be79a889debe1b', cb:'eth', label:'Lazarus Group vs Hydra Market' },
              { a:'0x722122df12d4e14e13ac3b6895a86e84145b6967', ca:'eth', b:'0x28c6c06298d514db089934071355e5743bf21d60', cb:'eth', label:'Tornado Cash vs Binance (clean)' },
            ].map((ex,i) => (
              <button key={i} onClick={() => { setAddrA(ex.a); setChainA(ex.ca); setAddrB(ex.b); setChainB(ex.cb) }}
                style={{ textAlign:'left', background:'rgba(0,229,255,.03)', border:'1px solid var(--border)',
                  borderRadius:8, padding:'12px 16px', cursor:'pointer', transition:'all .2s', color:'white' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(0,229,255,.3)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                <div style={{ fontFamily:'Outfit', fontSize:13, fontWeight:600, color:'white', marginBottom:4 }}>{ex.label}</div>
                <div className="font-mono" style={{ fontSize:8, color:'var(--dim)' }}>
                  {ex.a.slice(0,16)}... vs {ex.b.slice(0,16)}...
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
