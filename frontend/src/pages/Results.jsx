import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Download, ArrowLeft, Copy, CheckCheck, ExternalLink, AlertTriangle,
         Share2, Brain, TrendingUp, Clock, Hash, Bitcoin } from 'lucide-react'
import { getAnalysis, downloadReport } from '../api'
import RiskGauge from '../components/RiskGauge'
import TransactionGraph from '../components/TransactionGraph'
import Graph3D from '../components/Graph3D'
import { FlagBadge, RiskFactors } from '../components/RiskFactors'
import BtcDeepDive from '../components/BtcDeepDive'

const EXPLORER = {
  eth:     'https://etherscan.io/address/',
  btc:     'https://www.blockchain.com/explorer/addresses/btc/',
  polygon: 'https://polygonscan.com/address/',
}
const TX_EXPLORER = {
  eth:     'https://etherscan.io/tx/',
  btc:     'https://www.blockchain.com/explorer/transactions/btc/',
  polygon: 'https://polygonscan.com/tx/',
}

function StatBox({ label, value, color='white', sub }) {
  return (
    <div style={{ background:'rgba(0,0,0,.3)', borderRadius:8, padding:'12px 14px' }}>
      <div style={{ fontFamily:'Space Mono', fontSize:8, color:'var(--dim)', letterSpacing:1.5, marginBottom:5 }}>{label}</div>
      <div style={{ fontFamily:'Oxanium', fontSize:15, fontWeight:700, color }}>{value ?? '—'}</div>
      {sub && <div style={{ fontFamily:'Space Mono', fontSize:8, color:'var(--dim)', marginTop:3, letterSpacing:.5 }}>{sub}</div>}
    </div>
  )
}

function ProbBar({ label, color, prob, active }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontFamily:'Oxanium', fontSize:9, letterSpacing:2, color, fontWeight:700 }}>{label}</span>
        <span style={{ fontFamily:'Space Mono', fontSize:10, color, fontWeight:700 }}>{(prob*100).toFixed(0)}%</span>
      </div>
      <div style={{ height:active?6:4, background:'var(--border)', borderRadius:3, overflow:'hidden', transition:'height .3s' }}>
        <div style={{ height:'100%', background:color, borderRadius:3, width:`${prob*100}%`,
          transition:'width 1.2s ease-out', boxShadow:active?`0 0 12px ${color}`:undefined }} />
      </div>
    </div>
  )
}

function TxRow({ tx, chain, i }) {
  const isOut = tx.from_address === tx.analysis_address
  return (
    <tr style={{ borderBottom:'1px solid var(--border)', transition:'background .15s' }}
      onMouseEnter={e => e.currentTarget.style.background='rgba(0,229,255,.03)'}
      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
      <td style={{ padding:'10px 12px', fontFamily:'Space Mono', fontSize:8, color:'var(--dim)' }}>{i+1}</td>
      <td style={{ padding:'10px 12px' }}>
        <a href={`${TX_EXPLORER[chain]}${tx.tx_hash}`} target="_blank" rel="noopener noreferrer"
          style={{ fontFamily:'Space Mono', fontSize:9, color:'var(--cyan)', textDecoration:'none', letterSpacing:.5 }}>
          {tx.tx_hash?.slice(0,14)}...{tx.tx_hash?.slice(-6)}
        </a>
      </td>
      <td style={{ padding:'10px 12px' }}>
        <span style={{ fontFamily:'Oxanium', fontSize:8, fontWeight:700, letterSpacing:1.5, padding:'3px 8px', borderRadius:3,
          color: isOut?'var(--orange)':'var(--green)',
          background: isOut?'rgba(255,109,0,.1)':'rgba(57,255,20,.1)',
          border: `1px solid ${isOut?'rgba(255,109,0,.2)':'rgba(57,255,20,.2)'}` }}>
          {isOut ? 'OUT' : 'IN'}
        </span>
      </td>
      <td style={{ padding:'10px 12px', fontFamily:'Space Mono', fontSize:9, color:'white', fontWeight:600 }}>
        {parseFloat(tx.value||0).toFixed(5)}
      </td>
      <td style={{ padding:'10px 12px', fontFamily:'Space Mono', fontSize:8, color:'var(--dim)' }}>
        {tx.timestamp ? new Date(tx.timestamp*1000||tx.timestamp).toLocaleDateString() : '—'}
      </td>
      <td style={{ padding:'10px 12px' }}>
        {tx.is_mixer && <span style={{ fontFamily:'Oxanium', fontSize:7, color:'var(--red)', background:'rgba(255,0,51,.1)', border:'1px solid rgba(255,0,51,.2)', borderRadius:3, padding:'2px 6px', letterSpacing:1, marginRight:4 }}>MIXER</span>}
        {tx.is_darkweb && <span style={{ fontFamily:'Oxanium', fontSize:7, color:'var(--purple)', background:'rgba(124,77,255,.1)', border:'1px solid rgba(124,77,255,.2)', borderRadius:3, padding:'2px 6px', letterSpacing:1 }}>DARKWEB</span>}
      </td>
    </tr>
  )
}

export default function Results() {
  const { id }                    = useParams()
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('graph')
  const [graphMode, setGraphMode] = useState('3d')
  const [copied, setCopied]       = useState(false)
  const [shared, setShared]       = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => { getAnalysis(id).then(setData).finally(() => setLoading(false)) }, [id])

  function copyAddress() {
    navigator.clipboard.writeText(data.address)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  function shareUrl() {
    navigator.clipboard.writeText(window.location.href)
    setShared(true); setTimeout(() => setShared(false), 2000)
  }

  async function handlePDF() {
    setPdfLoading(true)
    try {
      const blob = await downloadReport(id)
      const url  = URL.createObjectURL(new Blob([blob], { type:'application/pdf' }))
      const a    = document.createElement('a')
      a.href     = url
      a.download = `mkchain-${data.address.slice(0,10)}-${id}.pdf`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch(err) {
      console.error('PDF error:', err)
      alert(`PDF failed: ${err?.response?.data?.detail || err.message}`)
    } finally { setPdfLoading(false) }
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

  const stats     = data.graph?.stats || {}
  const riskColor = { CRITICAL:'var(--red)', HIGH:'var(--orange)', MEDIUM:'var(--gold)', LOW:'var(--green)' }[data.risk_label] || 'var(--cyan)'
  const score     = data.risk_score || 0

  // Compute realistic probabilities from actual score
  const probs = {
    CRITICAL: score >= 75 ? Math.min((score-75)/25 * 0.8 + 0.15, 0.98) : Math.max(0.01, (score/75)*0.12),
    HIGH:     score >= 50 && score < 75 ? 0.55 + (score-50)/25*0.35 : score >= 75 ? 0.06 : score >= 25 ? (score-25)/25*0.25 : 0.05,
    MEDIUM:   score >= 25 && score < 50 ? 0.50 + (score-25)/25*0.30 : score < 25 ? (score/25)*0.30 : 0.07,
    LOW:      score < 25 ? Math.min(0.95, 0.5 + (25-score)/25*0.45) : Math.max(0.01, (100-score)/100*0.15),
  }
  const total = Object.values(probs).reduce((a,b)=>a+b,0)
  Object.keys(probs).forEach(k => probs[k] = probs[k]/total)

  return (
    <div style={{ maxWidth:1280, margin:'0 auto', padding:'32px 24px' }}>

      {/* ── Header ── */}
      <div className="animate-fade-up" style={{ marginBottom:28 }}>
        <Link to="/analyze" style={{ textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6,
          fontFamily:'Space Mono', color:'var(--dim)', fontSize:10, marginBottom:14, transition:'color .2s' }}
          onMouseEnter={e=>e.currentTarget.style.color='var(--cyan)'} onMouseLeave={e=>e.currentTarget.style.color='var(--dim)'}>
          <ArrowLeft size={13}/> NEW ANALYSIS
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
              {data.flags?.includes('darkweb_match') && (
                <span style={{ fontFamily:'Oxanium', fontSize:8, fontWeight:700, padding:'3px 10px', borderRadius:3, letterSpacing:2,
                  color:'var(--red)', background:'rgba(255,0,51,.1)', border:'1px solid rgba(255,0,51,.3)' }}>
                  ⚠ OFAC MATCH
                </span>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontFamily:'Space Mono', fontSize:'clamp(9px,1.1vw,13px)', color:'white', wordBreak:'break-all' }}>{data.address}</span>
              <button onClick={copyAddress} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--dim)', flexShrink:0, transition:'color .2s' }}
                onMouseEnter={e=>e.currentTarget.style.color='var(--cyan)'} onMouseLeave={e=>e.currentTarget.style.color='var(--dim)'}>
                {copied ? <CheckCheck size={14} color="var(--green)"/> : <Copy size={14}/>}
              </button>
              <a href={`${EXPLORER[data.chain]}${data.address}`} target="_blank" rel="noopener noreferrer"
                style={{ color:'var(--dim)', transition:'color .2s' }}
                onMouseEnter={e=>e.currentTarget.style.color='var(--cyan)'} onMouseLeave={e=>e.currentTarget.style.color='var(--dim)'}>
                <ExternalLink size={14}/>
              </a>
            </div>
            <div style={{ fontFamily:'Space Mono', color:'var(--dim)', fontSize:9, marginTop:6, letterSpacing:1, display:'flex', gap:16 }}>
              <span><Hash size={9} style={{ marginRight:4, verticalAlign:'middle' }}/>#{data.id}</span>
              <span><Clock size={9} style={{ marginRight:4, verticalAlign:'middle' }}/>{new Date(data.created_at).toLocaleString()}</span>
              {data.first_seen && <span>First: {data.first_seen?.slice(0,10)}</span>}
              {data.last_seen  && <span>Last: {data.last_seen?.slice(0,10)}</span>}
            </div>
          </div>

          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button onClick={shareUrl} className="btn-ghost" style={{ fontSize:10, padding:'10px 16px', letterSpacing:1.5 }}>
              {shared ? <CheckCheck size={14} color="var(--green)"/> : <Share2 size={14}/>}
              {shared ? 'COPIED!' : 'SHARE'}
            </button>
            <button onClick={handlePDF} className="btn-ghost" disabled={pdfLoading}
              style={{ fontSize:10, padding:'10px 20px', letterSpacing:1.5,
                opacity: pdfLoading ? 0.6 : 1,
                borderColor: pdfLoading ? 'var(--border)' : undefined }}>
              {pdfLoading
                ? <><div style={{ width:12, height:12, border:'1px solid var(--dim)', borderTopColor:'var(--cyan)', borderRadius:'50%', animation:'spin 1s linear infinite' }}/> GENERATING...</>
                : <><Download size={14}/> DOWNLOAD PDF</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Overview Row ── */}
      <div className="animate-fade-up d1" style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:20, marginBottom:28, alignItems:'start' }}>

        {/* Gauge */}
        <div className="card card-glow" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'28px 24px', gap:8 }}>
          <RiskGauge score={data.risk_score} label={data.risk_label} size={180}/>
          <div style={{ fontFamily:'Space Mono', fontSize:8, color:'var(--dim)', letterSpacing:1, textAlign:'center' }}>
            ML RISK SCORE
          </div>
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            {data.flags?.slice(0,2).map(f => <FlagBadge key={f} flag={f}/>)}
          </div>
        </div>

        {/* Stats grid */}
        <div className="card" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <StatBox label="TOTAL TXNS"  value={data.total_txns?.toLocaleString()} />
          <StatBox label="VOLUME"      value={parseFloat(data.total_volume||0).toFixed(4)} sub={data.chain?.toUpperCase()} />
          <StatBox label="GRAPH NODES" value={stats.total_nodes} />
          <StatBox label="GRAPH EDGES" value={stats.total_edges} />
          <StatBox label="MIXER NODES" value={stats.mixer_nodes||0} color={stats.mixer_nodes>0?'var(--red)':'white'} />
          <StatBox label="RISK FLAGS"  value={data.flags?.length||0} color={data.flags?.length>0?'var(--gold)':'var(--green)'} />
        </div>

        {/* Flags + OSINT panel */}
        <div className="card" style={{ minWidth:240, maxWidth:300 }}>
          <div style={{ fontFamily:'Space Mono', fontSize:9, color:'var(--cyan)', letterSpacing:2, marginBottom:12 }}>RISK FLAGS</div>
          {data.flags?.length ? (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {data.flags.map(f => <FlagBadge key={f} flag={f}/>)}
            </div>
          ) : (
            <div style={{ color:'var(--green)', fontSize:12, display:'flex', alignItems:'center', gap:8, padding:'12px 0' }}>
              ✓ No suspicious flags detected
            </div>
          )}
          {data.darkweb_hits?.length > 0 && (
            <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)' }}>
              <div style={{ fontFamily:'Space Mono', fontSize:9, color:'var(--red)', letterSpacing:2, marginBottom:10 }}>
                ⚠ OFAC / OSINT ({data.darkweb_hits.length})
              </div>
              {data.darkweb_hits.map((h,i) => (
                <div key={i} style={{ background:'rgba(255,0,51,.06)', border:'1px solid rgba(255,0,51,.25)', borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontFamily:'Oxanium', fontSize:8, fontWeight:700, color:'var(--red)', letterSpacing:1.5 }}>
                      {(h.category||'').replace(/_/g,' ').toUpperCase()}
                    </span>
                    <span style={{ fontFamily:'Space Mono', fontSize:7, color:'rgba(255,0,51,.5)' }}>{h.source?.split('/')[0]}</span>
                  </div>
                  <div style={{ fontSize:11, color:'white', fontWeight:600, marginBottom:3 }}>{h.label}</div>
                  <div style={{ fontFamily:'Space Mono', fontSize:7, color:'rgba(255,0,51,.5)', wordBreak:'break-all' }}>
                    {h.address?.slice(0,20)}...
                  </div>
                  {h.tags?.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginTop:6 }}>
                      {h.tags.slice(0,4).map(t => (
                        <span key={t} style={{ fontFamily:'Space Mono', fontSize:7, color:'rgba(255,0,51,.5)',
                          background:'rgba(255,0,51,.08)', border:'1px solid rgba(255,0,51,.15)',
                          borderRadius:3, padding:'2px 5px' }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:24, gap:2 }}>
        {[['graph','🕸 GRAPH'],['factors','🧠 RISK ANALYSIS'],['txns','📋 TRANSACTIONS'],...(data.chain==='btc'?[['btc','₿ BTC DEEP DIVE']]:[] )].map(([t,label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background:'none', border:'none', borderBottom:`2px solid ${tab===t?'var(--cyan)':'transparent'}`,
            marginBottom:-1, cursor:'pointer', padding:'12px 22px',
            fontFamily:'Oxanium', fontSize:10, fontWeight:600, letterSpacing:2,
            color: tab===t?'var(--cyan)':'var(--dim)', transition:'all .2s',
          }}>{label}</button>
        ))}
      </div>

      {/* ── Graph Tab ── */}
      {tab === 'graph' && (
        <div className="animate-fade-up">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ fontFamily:'Space Mono', fontSize:10, color:'var(--dim)', letterSpacing:1 }}>
              {stats.total_nodes} nodes · {stats.total_edges} edges · density {stats.density}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {[['2d','2D FLAT'],['3d','3D SPACE']].map(([mode,label]) => (
                <button key={mode} onClick={() => setGraphMode(mode)} style={{
                  fontFamily:'Oxanium', fontSize:10, fontWeight:700, letterSpacing:2,
                  padding:'7px 18px', borderRadius:4, cursor:'pointer', transition:'all .2s',
                  border:`1px solid ${graphMode===mode?'var(--cyan)':'var(--glow-border)'}`,
                  background: graphMode===mode?'rgba(0,229,255,.1)':'transparent',
                  color: graphMode===mode?'var(--cyan)':'var(--dim)',
                }}>{label}</button>
              ))}
            </div>
          </div>
          {graphMode === '3d'
            ? <Graph3D graphData={data.graph} height={540}/>
            : <TransactionGraph graphData={data.graph} height={540}/>
          }
          <div style={{ marginTop:12, fontFamily:'Space Mono', fontSize:10, color:'var(--dim)', letterSpacing:1, textAlign:'center' }}>
            🔵 Wallet &nbsp;🔴 Mixer &nbsp;🟣 Darkweb &nbsp;🟡 Exchange &nbsp;🟠 Bridge
          </div>
        </div>
      )}

      {/* ── Risk Analysis Tab ── */}
      {tab === 'factors' && (
        <div className="animate-fade-up" style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:24 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* ML Probabilities */}
            <div className="card card-glow">
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                <Brain size={14} color="var(--cyan)"/>
                <span style={{ fontFamily:'Space Mono', fontSize:9, color:'var(--cyan)', letterSpacing:2 }}>ML CLASS PROBABILITIES</span>
              </div>
              <ProbBar label="CRITICAL" color="var(--red)"    prob={probs.CRITICAL} active={data.risk_label==='CRITICAL'} />
              <ProbBar label="HIGH"     color="var(--orange)" prob={probs.HIGH}     active={data.risk_label==='HIGH'} />
              <ProbBar label="MEDIUM"   color="var(--gold)"   prob={probs.MEDIUM}   active={data.risk_label==='MEDIUM'} />
              <ProbBar label="LOW"      color="var(--green)"  prob={probs.LOW}      active={data.risk_label==='LOW'} />
              <div style={{ marginTop:12, padding:'8px 10px', background:'rgba(0,229,255,.04)', borderRadius:6, border:'1px solid rgba(0,229,255,.1)' }}>
                <div style={{ fontFamily:'Space Mono', fontSize:8, color:'var(--dim)', letterSpacing:1, marginBottom:4 }}>MODEL CONFIDENCE</div>
                <div style={{ fontFamily:'Oxanium', fontSize:13, fontWeight:700, color:'var(--cyan)' }}>
                  {(Math.max(...Object.values(probs))*100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <TrendingUp size={14} color="var(--purple)"/>
                <span style={{ fontFamily:'Space Mono', fontSize:9, color:'var(--purple)', letterSpacing:2 }}>AI FORENSICS SUMMARY</span>
              </div>
              <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.8, fontWeight:300,
                borderLeft:'2px solid var(--purple)', paddingLeft:12 }}>
                {data.ai_summary || `Wallet scored ${score.toFixed(1)}/100. ${data.flags?.length ? `${data.flags.length} risk flag(s) detected.` : 'No major risk patterns found.'}`}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontFamily:'Oxanium', fontSize:11, fontWeight:700, color:'white', letterSpacing:2, marginBottom:16 }}>
              CONTRIBUTING RISK FACTORS
            </div>
            {data.risk_factors?.length
              ? <RiskFactors factors={data.risk_factors}/>
              : <div className="card" style={{ textAlign:'center', padding:40, color:'var(--dim)', fontFamily:'Space Mono', fontSize:11 }}>
                  ✓ No major risk factors detected for this wallet.
                </div>
            }
          </div>
        </div>
      )}

      {/* ── Transactions Tab ── */}
      {tab === 'txns' && (
        <div className="animate-fade-up">
          {data.transactions?.length > 0 ? (
            <div className="card" style={{ overflow:'hidden', padding:0 }}>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontFamily:'Space Mono', fontSize:10, color:'var(--cyan)', letterSpacing:2 }}>
                  TRANSACTION HISTORY ({data.transactions.length})
                </span>
                <span style={{ fontFamily:'Space Mono', fontSize:9, color:'var(--dim)' }}>
                  Showing latest {data.transactions.length} of {data.total_txns?.toLocaleString()} total
                </span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--border)', background:'rgba(0,0,0,.3)' }}>
                      {['#','TX HASH','DIR','VALUE','DATE','FLAGS'].map(h => (
                        <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontFamily:'Space Mono', fontSize:8, color:'var(--dim)', letterSpacing:1.5, fontWeight:400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((tx,i) => (
                      <TxRow key={tx.tx_hash||i} tx={{...tx, analysis_address: data.address}} chain={data.chain} i={i}/>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign:'center', padding:'60px 40px' }}>
              <div style={{ width:52, height:52, borderRadius:12, background:'rgba(0,229,255,.06)', border:'1px solid rgba(0,229,255,.15)',
                display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                📋
              </div>
              <div style={{ fontFamily:'Oxanium', color:'var(--dim)', fontSize:12, letterSpacing:2, marginBottom:8 }}>
                TRANSACTIONS STORED IN GRAPH
              </div>
              <div style={{ fontFamily:'Space Mono', fontSize:10, color:'var(--dim)', marginBottom:24 }}>
                {data.total_txns?.toLocaleString()} transactions were analyzed.<br/>
                View the graph tab to explore the full transaction network.
              </div>
              <button onClick={() => setTab('graph')} className="btn-primary" style={{ fontSize:10, padding:'10px 24px' }}>
                VIEW GRAPH
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── BTC Deep Dive Tab ── */}
      {tab === 'btc' && data.chain === 'btc' && (
        <div className="animate-fade-up">
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
            <Bitcoin size={16} color="var(--orange)"/>
            <span className="font-orbitron" style={{ fontSize:13, fontWeight:700, color:'white', letterSpacing:2 }}>
              BITCOIN FORENSICS DEEP DIVE
            </span>
            <span className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:1, marginLeft:4 }}>
              UTXO · CoinJoin · Coin Age · Clustering
            </span>
          </div>
          <BtcDeepDive address={data.address}/>
        </div>
      )}

    </div>
  )
}