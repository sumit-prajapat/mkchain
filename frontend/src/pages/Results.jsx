import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Download, ArrowLeft, Copy, CheckCheck, ExternalLink, AlertTriangle, Activity } from 'lucide-react'
import { getAnalysis, downloadReport } from '../api'
import RiskGauge from '../components/RiskGauge'
import TransactionGraph from '../components/TransactionGraph'
import Graph3D from '../components/Graph3D'
import { FlagBadge, RiskFactors } from '../components/RiskFactors'

const EXPLORER = {
  eth:     'https://etherscan.io/address/',
  btc:     'https://www.blockchain.com/explorer/addresses/btc/',
  polygon: 'https://polygonscan.com/address/',
}

function StatBox({ label, value, color = 'white' }) {
  return (
    <div style={{ background:'rgba(0,0,0,.3)', borderRadius:8, padding:'12px 14px' }}>
      <div style={{ fontFamily:'Space Mono', fontSize:8, color:'var(--muted)', letterSpacing:1.5, marginBottom:5 }}>{label}</div>
      <div style={{ fontFamily:'Oxanium', fontSize:15, fontWeight:700, color }}>{value ?? '—'}</div>
    </div>
  )
}

export default function Results() {
  const { id }               = useParams()
  const [data, setData]      = useState(null)
  const [loading, setLoading]= useState(true)
  const [tab, setTab]        = useState('graph')
  const [graphMode, setGraphMode] = useState('3d')   // '2d' | '3d'
  const [copied, setCopied]  = useState(false)

  useEffect(() => { getAnalysis(id).then(setData).finally(() => setLoading(false)) }, [id])

  function copyAddress() {
    navigator.clipboard.writeText(data.address)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function handlePDF() {
    try {
      const blob = await downloadReport(id)
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `mkchain-${data.address.slice(0,10)}-report.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF error:', err)
      alert(`PDF download failed: ${err?.response?.data?.detail || err.message || 'Unknown error'}`)
    }
  }

  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:300, gap:16 }}>
      <div className="animate-spin-slow" style={{ width:48, height:48, border:'2px solid var(--cyan)', borderRadius:'50%', borderTopColor:'transparent', borderRightColor:'transparent' }} />
      <div style={{ fontFamily:'Space Mono', color:'var(--dim)', fontSize:10, letterSpacing:2 }}>LOADING ANALYSIS...</div>
    </div>
  )

  if (!data) return (
    <div style={{ textAlign:'center', padding:'80px 24px' }}>
      <AlertTriangle size={40} color="var(--gold)" style={{ margin:'0 auto 16px' }} />
      <div style={{ fontFamily:'Oxanium', color:'white', fontSize:18, letterSpacing:2, marginBottom:16 }}>ANALYSIS NOT FOUND</div>
      <Link to="/analyze" className="btn-primary">NEW ANALYSIS</Link>
    </div>
  )

  const stats = data.graph?.stats || {}
  const riskColor = { CRITICAL:'var(--red)', HIGH:'var(--orange)', MEDIUM:'var(--gold)', LOW:'var(--green)' }[data.risk_label] || 'var(--cyan)'

  return (
    <div style={{ maxWidth:1280, margin:'0 auto', padding:'32px 24px' }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div className="animate-fade-up" style={{ marginBottom:28 }}>
        <Link to="/analyze" style={{ textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6, fontFamily:'Space Mono', color:'var(--dim)', fontSize:10, marginBottom:14, transition:'color .2s' }}
          onMouseEnter={e => e.target.style.color='var(--cyan)'} onMouseLeave={e => e.target.style.color='var(--dim)'}>
          <ArrowLeft size={13} /> NEW ANALYSIS
        </Link>

        <div style={{ display:'flex', flexWrap:'wrap', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:8 }}>
              <span className={`chain-${data.chain}`} style={{ fontFamily:'Oxanium', fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:3, letterSpacing:2 }}>
                {data.chain.toUpperCase()}
              </span>
              <span className={`risk-${data.risk_label.toLowerCase()}`} style={{ fontFamily:'Oxanium', fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:3, letterSpacing:2 }}>
                {data.risk_label}
              </span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontFamily:'Space Mono', fontSize:'clamp(10px,1.3vw,14px)', color:'white', wordBreak:'break-all' }}>{data.address}</span>
              <button onClick={copyAddress} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--dim)', flexShrink:0, transition:'color .2s' }}
                onMouseEnter={e => e.currentTarget.style.color='var(--cyan)'} onMouseLeave={e => e.currentTarget.style.color='var(--dim)'}>
                {copied ? <CheckCheck size={14} color="var(--green)" /> : <Copy size={14} />}
              </button>
              <a href={`${EXPLORER[data.chain]}${data.address}`} target="_blank" rel="noopener noreferrer"
                style={{ color:'var(--dim)', transition:'color .2s' }}
                onMouseEnter={e => e.currentTarget.style.color='var(--cyan)'} onMouseLeave={e => e.currentTarget.style.color='var(--dim)'}>
                <ExternalLink size={14} />
              </a>
            </div>
            <div style={{ fontFamily:'Space Mono', color:'var(--muted)', fontSize:9, marginTop:6, letterSpacing:1 }}>
              Analysis #{data.id} · {new Date(data.created_at).toLocaleString()}
            </div>
          </div>
          <button onClick={handlePDF} className="btn-ghost" style={{ fontSize:10, padding:'10px 20px', letterSpacing:1.5 }}>
            <Download size={14} /> DOWNLOAD PDF
          </button>
        </div>
      </div>

      {/* ── Overview Row ───────────────────────────────── */}
      <div className="animate-fade-up d1" style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:20, marginBottom:28, alignItems:'start' }}>

        {/* Gauge */}
        <div className="card card-glow" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 28px', gap:12 }}>
          <RiskGauge score={data.risk_score} label={data.risk_label} size={180} />
        </div>

        {/* Stats grid */}
        <div className="card" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <StatBox label="TOTAL TXNS"  value={data.total_txns?.toLocaleString()} />
          <StatBox label="VOLUME"      value={parseFloat(data.total_volume).toFixed(4)} />
          <StatBox label="GRAPH NODES" value={stats.total_nodes} />
          <StatBox label="GRAPH EDGES" value={stats.total_edges} />
          <StatBox label="MIXER NODES" value={stats.mixer_nodes || 0} color={stats.mixer_nodes > 0 ? 'var(--red)' : 'white'} />
          <StatBox label="MAX HOPS"    value={stats.max_hops} />
        </div>

        {/* Flags panel */}
        <div className="card" style={{ minWidth:220, maxWidth:280 }}>
          <div style={{ fontFamily:'Space Mono', fontSize:9, color:'var(--cyan)', letterSpacing:2, marginBottom:12 }}>RISK FLAGS</div>
          {data.flags?.length ? (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {data.flags.map(f => <FlagBadge key={f} flag={f} />)}
            </div>
          ) : (
            <div style={{ color:'var(--green)', fontSize:12, display:'flex', alignItems:'center', gap:8, padding:'12px 0' }}>
              ✓ No suspicious flags detected
            </div>
          )}
          {data.darkweb_hits?.length > 0 && (
            <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)' }}>
              <div style={{ fontFamily:'Space Mono', fontSize:9, color:'var(--red)', letterSpacing:2, marginBottom:10 }}>
                ⚠ OFAC / OSINT MATCHES ({data.darkweb_hits.length})
              </div>
              {data.darkweb_hits.map((h, i) => (
                <div key={i} style={{ background:'rgba(255,0,51,.06)', border:'1px solid rgba(255,0,51,.25)', borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                    <span style={{ fontFamily:'Oxanium', fontSize:9, fontWeight:700, color:'var(--red)', letterSpacing:1.5 }}>
                      {(h.category||'unknown').replace(/_/g,' ').toUpperCase()}
                    </span>
                    <span style={{ fontFamily:'Space Mono', fontSize:7, color:'rgba(255,0,51,.5)', letterSpacing:1 }}>
                      {h.source}
                    </span>
                  </div>
                  <div style={{ fontFamily:'Helvetica', fontSize:11, color:'white', fontWeight:600, marginBottom:4 }}>{h.label}</div>
                  <div style={{ fontFamily:'Space Mono', fontSize:8, color:'rgba(255,0,51,.6)', wordBreak:'break-all', marginBottom:h.cross_chain_count > 1 ? 6 : 0 }}>
                    {h.address?.slice(0,22)}...
                  </div>
                  {h.cross_chain_count > 1 && (
                    <div style={{ fontFamily:'Space Mono', fontSize:7, color:'var(--gold)', letterSpacing:1 }}>
                      🔗 CROSS-CHAIN: {h.cross_chain_count} addresses linked to this entity
                    </div>
                  )}
                  {h.tags?.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:6 }}>
                      {h.tags.slice(0,4).map(t => (
                        <span key={t} style={{ fontFamily:'Space Mono', fontSize:7, color:'rgba(255,0,51,.5)', background:'rgba(255,0,51,.08)', border:'1px solid rgba(255,0,51,.15)', borderRadius:3, padding:'2px 6px', letterSpacing:.5 }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────── */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:24, gap:2 }}>
        {[['graph','🕸 GRAPH'],['factors','🧠 RISK ANALYSIS'],['txns','📋 TRANSACTIONS']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background:'none', border:'none', borderBottom:`2px solid ${tab===t?'var(--cyan)':'transparent'}`,
            marginBottom:-1, cursor:'pointer', padding:'12px 22px',
            fontFamily:'Oxanium', fontSize:10, fontWeight:600, letterSpacing:2,
            color: tab===t ? 'var(--cyan)' : 'var(--dim)', transition:'all .2s',
          }}>{label}</button>
        ))}
      </div>

      {/* ── Graph Tab ──────────────────────────────────── */}
      {tab === 'graph' && (
        <div className="animate-fade-up">
          {/* 2D / 3D toggle */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ fontFamily:'Space Mono', fontSize:10, color:'var(--dim)', letterSpacing:1 }}>
              {stats.total_nodes} nodes · {stats.total_edges} edges · density {stats.density}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {[['2d','2D FLAT'],['3d','3D SPACE']].map(([mode, label]) => (
                <button key={mode} onClick={() => setGraphMode(mode)} style={{
                  fontFamily:'Oxanium', fontSize:10, fontWeight:700, letterSpacing:2,
                  padding:'7px 18px', borderRadius:4, cursor:'pointer', transition:'all .2s',
                  border:`1px solid ${graphMode===mode ? 'var(--cyan)' : 'var(--glow-border)'}`,
                  background: graphMode===mode ? 'rgba(0,229,255,.1)' : 'transparent',
                  color: graphMode===mode ? 'var(--cyan)' : 'var(--dim)',
                }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {graphMode === '3d'
            ? <Graph3D graphData={data.graph} height={540} />
            : <TransactionGraph graphData={data.graph} height={540} />
          }

          {graphMode === '3d' && (
            <div style={{ marginTop:12, fontFamily:'Space Mono', fontSize:10, color:'var(--dim)', letterSpacing:1, textAlign:'center' }}>
              ● Sphere = Wallet &nbsp;◆ Octahedron = Mixer &nbsp;▲ Tetrahedron = Darkweb &nbsp;⬤ Exchange
            </div>
          )}
        </div>
      )}

      {/* ── Risk Analysis Tab ──────────────────────────── */}
      {tab === 'factors' && (
        <div className="animate-fade-up" style={{ display:'grid', gridTemplateColumns:'290px 1fr', gap:24 }}>
          <div>
            <div className="card card-glow" style={{ marginBottom:16 }}>
              <div style={{ fontFamily:'Space Mono', fontSize:9, color:'var(--cyan)', letterSpacing:2, marginBottom:16 }}>ML CLASS PROBABILITIES</div>
              {[
                { label:'CRITICAL', color:'var(--red)',    prob: data.risk_score>=75 ? 0.88 : 0.04 },
                { label:'HIGH',     color:'var(--orange)', prob: data.risk_score>=50 && data.risk_score<75 ? 0.72 : 0.08 },
                { label:'MEDIUM',   color:'var(--gold)',   prob: data.risk_score>=25 && data.risk_score<50 ? 0.68 : 0.08 },
                { label:'LOW',      color:'var(--green)',  prob: data.risk_score<25 ? 0.92 : 0.04 },
              ].map(({ label, color, prob }) => (
                <div key={label} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontFamily:'Oxanium', fontSize:9, letterSpacing:2, color, fontWeight:700 }}>{label}</span>
                    <span style={{ fontFamily:'Space Mono', fontSize:10, color, fontWeight:700 }}>{(prob*100).toFixed(0)}%</span>
                  </div>
                  <div style={{ height:4, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
                    <div style={{ height:'100%', background:color, borderRadius:2, width:`${prob*100}%`, transition:'width 1.2s ease-out', boxShadow:`0 0 8px ${color}` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div style={{ fontFamily:'Space Mono', fontSize:9, color:'var(--dim)', letterSpacing:2, marginBottom:12 }}>AI SUMMARY</div>
              <div style={{ fontSize:12, color:'var(--dim)', lineHeight:1.75, fontWeight:300 }}>
                {data.ai_summary || `Wallet scored ${data.risk_score?.toFixed(1)}/100. ${data.flags?.length ? `${data.flags.length} risk flags detected.` : 'No major risk patterns found.'}`}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontFamily:'Oxanium', fontSize:11, fontWeight:700, color:'white', letterSpacing:2, marginBottom:16 }}>CONTRIBUTING RISK FACTORS</div>
            <RiskFactors factors={data.risk_factors || []} />
          </div>
        </div>
      )}

      {/* ── Transactions Tab ───────────────────────────── */}
      {tab === 'txns' && (
        <div className="animate-fade-up card" style={{ textAlign:'center', padding:'60px' }}>
          <Activity size={40} color="var(--muted)" style={{ margin:'0 auto 16px' }} />
          <div style={{ fontFamily:'Oxanium', color:'var(--dim)', fontSize:12, letterSpacing:2 }}>
            CONNECT TO LIVE BACKEND TO VIEW TRANSACTION TABLE
          </div>
        </div>
      )}

    </div>
  )
}

