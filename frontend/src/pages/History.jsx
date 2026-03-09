import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Trash2, ChevronRight, Clock, Plus } from 'lucide-react'
import { listAnalyses, deleteAnalysis } from '../api'
import { FlagBadge } from '../components/RiskFactors'

export default function History() {
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search,  setSearch]    = useState('')

  useEffect(() => { listAnalyses(50).then(setAnalyses).finally(() => setLoading(false)) }, [])

  async function handleDelete(e, id) {
    e.preventDefault(); e.stopPropagation()
    if (!confirm('Delete this analysis?')) return
    await deleteAnalysis(id)
    setAnalyses(a => a.filter(x => x.id !== id))
  }

  const filtered = analyses.filter(a =>
    a.address.toLowerCase().includes(search.toLowerCase()) ||
    a.chain.includes(search.toLowerCase()) ||
    a.risk_label?.toLowerCase().includes(search.toLowerCase())
  )

  const riskColor = { CRITICAL:'var(--red)', HIGH:'var(--orange)', MEDIUM:'var(--gold)', LOW:'var(--green)' }

  return (
    <div style={{ maxWidth:1000, margin:'0 auto', padding:'40px 24px' }}>

      {/* Header */}
      <div className="animate-fade-up" style={{ display:'flex', flexWrap:'wrap', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:40 }}>
        <div>
          <div className="font-mono" style={{ color:'var(--cyan)', fontSize:11, letterSpacing:3, marginBottom:10 }}>// INVESTIGATION HISTORY</div>
          <h1 className="font-orbitron" style={{ fontSize:32, fontWeight:800, color:'white', letterSpacing:2 }}>PAST ANALYSES</h1>
          <div className="font-mono" style={{ color:'var(--text-dim)', fontSize:11, marginTop:8, letterSpacing:1 }}>
            {analyses.length} wallet{analyses.length !== 1 ? 's' : ''} analyzed
          </div>
        </div>
        <Link to="/analyze" className="btn-primary" style={{ fontSize:11, letterSpacing:2 }}>
          <Plus size={14} /> NEW ANALYSIS
        </Link>
      </div>

      {/* Search */}
      <div className="animate-fade-up delay-1" style={{ position:'relative', marginBottom:28 }}>
        <Search size={14} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search address, chain, or risk level..."
          style={{
            width:'100%', background:'var(--panel)', border:'1px solid var(--border)', borderRadius:8,
            paddingLeft:42, paddingRight:16, paddingTop:12, paddingBottom:12,
            color:'white', fontFamily:'IBM Plex Mono', fontSize:12, outline:'none',
            transition:'border-color 0.25s',
          }}
          onFocus={e => e.target.style.borderColor='var(--border-glow)'}
          onBlur={e => e.target.style.borderColor='var(--border)'}
        />
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {Array.from({length:5}).map((_, i) => (
            <div key={i} style={{ height:80, borderRadius:12, background:'var(--panel)', border:'1px solid var(--border)', overflow:'hidden' }}>
              <div className="shimmer-line" style={{ height:'100%' }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'80px 24px' }}>
          <Clock size={44} color="var(--text-muted)" style={{ margin:'0 auto 16px' }} />
          <div className="font-orbitron" style={{ color:'var(--text-dim)', fontSize:12, letterSpacing:2, marginBottom:16 }}>
            {search ? 'NO RESULTS FOUND' : 'NO ANALYSES YET'}
          </div>
          <Link to="/analyze" className="btn-primary" style={{ fontSize:11 }}>ANALYZE FIRST WALLET</Link>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map((a, i) => (
            <Link key={a.id} to={`/results/${a.id}`}
              className={`card animate-fade-up delay-${Math.min(i+1,8)}`}
              style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:16, transition:'all 0.25s', cursor:'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = (riskColor[a.risk_label] + '44') || 'var(--border-glow)'; e.currentTarget.style.transform = 'translateX(4px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = '' }}>

              {/* Score badge */}
              <div style={{
                flexShrink:0, width:56, height:56, borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                background:`${riskColor[a.risk_label]}12`, border:`1px solid ${riskColor[a.risk_label]}30`,
              }}>
                <div className="font-orbitron" style={{ fontSize:16, fontWeight:800, color:riskColor[a.risk_label], lineHeight:1 }}>{Math.round(a.risk_score)}</div>
                <div className="font-mono" style={{ fontSize:7, color:riskColor[a.risk_label], letterSpacing:1, marginTop:3, opacity:0.7 }}>{a.risk_label}</div>
              </div>

              {/* Info */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                  <span className={`font-orbitron chain-${a.chain}`} style={{ fontSize:8, fontWeight:700, padding:'2px 7px', borderRadius:3, letterSpacing:2 }}>
                    {a.chain.toUpperCase()}
                  </span>
                  <span className="font-mono" style={{ fontSize:12, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.address}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:a.flags?.length ? 8 : 0 }}>
                  <span className="font-mono" style={{ fontSize:10, color:'var(--text-muted)', letterSpacing:0.5 }}>{a.total_txns} txns</span>
                  <span className="font-mono" style={{ fontSize:10, color:'var(--text-muted)' }}>{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                {a.flags?.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {a.flags.slice(0,3).map(f => <FlagBadge key={f} flag={f} />)}
                    {a.flags.length > 3 && <span className="font-mono" style={{ fontSize:9, color:'var(--text-muted)', alignSelf:'center', letterSpacing:1 }}>+{a.flags.length-3}</span>}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                <button onClick={e => handleDelete(e, a.id)} style={{
                  background:'none', border:'1px solid transparent', borderRadius:6, padding:7, cursor:'pointer',
                  color:'var(--text-muted)', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(255,0,64,0.3)'; e.currentTarget.style.color='var(--red)'; e.currentTarget.style.background='rgba(255,0,64,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='transparent'; e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background='none' }}>
                  <Trash2 size={13} />
                </button>
                <ChevronRight size={16} color="var(--text-muted)" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
