import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Shield, AlertTriangle, Globe, Hash, ChevronRight, Filter, X } from 'lucide-react'
import { getOsintStats, getOsintEntities, searchOsint } from '../api'

const CATEGORY_META = {
  mixer:         { label:'Mixer / Tumbler',    color:'#ff6d00', icon:'🌀' },
  darknet_market:{ label:'Darknet Market',     color:'#ff0033', icon:'🕸' },
  apt:           { label:'APT / Nation State', color:'#ff0080', icon:'🎯' },
  ransomware:    { label:'Ransomware',         color:'#ffc400', icon:'💀' },
  exchange_hack: { label:'Exchange Hack',      color:'#7c4dff', icon:'💥' },
  terrorism:     { label:'Terrorism Finance',  color:'#ff0040', icon:'⚠️' },
  scam:          { label:'Scam / Fraud',       color:'#00b8d4', icon:'🎭' },
}

const CHAINS = ['all','eth','btc','polygon']

function StatPill({ label, value, color='var(--cyan)' }) {
  return (
    <div className="card card-glow" style={{ textAlign:'center', padding:'20px 16px' }}>
      <div className="font-orbitron" style={{ fontSize:28, fontWeight:800, color, lineHeight:1 }}>{value}</div>
      <div className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:2, marginTop:6 }}>{label}</div>
    </div>
  )
}

function EntityCard({ entity }) {
  const [open, setOpen] = useState(false)
  const catMeta = CATEGORY_META[entity.category] || { label:entity.category, color:'var(--cyan)', icon:'📁' }

  return (
    <div className="card" style={{ transition:'all .25s', cursor:'pointer' }}
      onMouseEnter={e=>e.currentTarget.style.borderColor=catMeta.color+'44'}
      onMouseLeave={e=>e.currentTarget.style.borderColor=''}>
      <div onClick={() => setOpen(o=>!o)} style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:14 }}>{catMeta.icon}</span>
            <span className="font-orbitron" style={{ fontSize:12, fontWeight:700, color:'white', letterSpacing:1 }}>
              {entity.name || entity.entity_id}
            </span>
            <span className={`font-mono cat-${entity.category}`}
              style={{ fontSize:8, fontWeight:700, padding:'3px 8px', borderRadius:3, letterSpacing:1.5 }}>
              {catMeta.label.toUpperCase()}
            </span>
          </div>
          <p style={{ fontSize:12, color:'var(--text-dim)', lineHeight:1.6, marginBottom:8 }}>{entity.description}</p>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <span className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:1 }}>
              📍 {entity.addresses?.length || 0} known addresses
            </span>
            {entity.chains?.length > 0 && (
              <span className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:1 }}>
                🔗 {entity.chains.join(' · ').toUpperCase()}
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={16} color="var(--dim)"
          style={{ transform:open?'rotate(90deg)':'rotate(0deg)', transition:'transform .25s', flexShrink:0, marginTop:2 }}/>
      </div>

      {/* Expanded address list */}
      {open && entity.addresses?.length > 0 && (
        <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid var(--border)' }}>
          <div className="font-mono" style={{ fontSize:9, color:catMeta.color, letterSpacing:2, marginBottom:10 }}>
            KNOWN ADDRESSES
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {entity.addresses.map((addr, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
                padding:'8px 10px', background:'rgba(0,0,0,.2)', borderRadius:6, border:'1px solid var(--border)' }}>
                <div style={{ minWidth:0, flex:1 }}>
                  <div className="font-mono" style={{ fontSize:9, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {addr.address}
                  </div>
                  <div className="font-mono" style={{ fontSize:8, color:'var(--dim)', marginTop:2 }}>
                    {addr.chain?.toUpperCase()} · {addr.label}
                  </div>
                </div>
                <Link to={`/analyze?address=${addr.address}&chain=${addr.chain||'eth'}`}
                  className="btn-ghost" style={{ fontSize:8, padding:'4px 10px', letterSpacing:1, flexShrink:0 }}>
                  TRACE
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AddressRow({ hit, i }) {
  const catMeta = CATEGORY_META[hit.category] || { label:hit.category, color:'var(--cyan)', icon:'📁' }
  return (
    <tr>
      <td style={{ padding:'10px 14px' }}>
        <span className="font-mono" style={{ fontSize:9, color:'var(--dim)' }}>{i+1}</span>
      </td>
      <td style={{ padding:'10px 14px' }}>
        <div className="font-mono" style={{ fontSize:10, color:'white', wordBreak:'break-all' }}>{hit.address}</div>
      </td>
      <td style={{ padding:'10px 14px' }}>
        <span style={{
          fontFamily:'Oxanium', fontSize:8, fontWeight:700, padding:'3px 8px', borderRadius:3, letterSpacing:1.5,
          color:catMeta.color, background:`${catMeta.color}15`, border:`1px solid ${catMeta.color}30`,
        }}>
          {catMeta.icon} {catMeta.label.toUpperCase()}
        </span>
      </td>
      <td style={{ padding:'10px 14px', fontFamily:'Outfit', fontSize:12, color:'var(--text-dim)' }}>{hit.label}</td>
      <td style={{ padding:'10px 14px' }}>
        <span className={`font-mono chain-${hit.chain}`} style={{ fontSize:8, fontWeight:700, padding:'2px 7px', borderRadius:3, letterSpacing:2 }}>
          {hit.chain?.toUpperCase()}
        </span>
      </td>
      <td style={{ padding:'10px 14px' }}>
        <Link to={`/analyze?address=${hit.address}&chain=${hit.chain||'eth'}`}
          className="btn-ghost" style={{ fontSize:8, padding:'4px 10px', letterSpacing:1 }}>
          TRACE
        </Link>
      </td>
    </tr>
  )
}

export default function Osint() {
  const [stats,    setStats]    = useState(null)
  const [entities, setEntities] = useState([])
  const [results,  setResults]  = useState([])
  const [query,    setQuery]    = useState('')
  const [category, setCategory] = useState('')
  const [chain,    setChain]    = useState('')
  const [view,     setView]     = useState('entities') // 'entities' | 'addresses'
  const [loading,  setLoading]  = useState(true)
  const [searching,setSearching]= useState(false)

  useEffect(() => {
    Promise.all([getOsintStats(), getOsintEntities()])
      .then(([s, e]) => { setStats(s); setEntities(e?.entities || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const runSearch = useCallback(async () => {
    setSearching(true)
    try {
      const r = await searchOsint(query || undefined, category || undefined, chain || undefined)
      setResults(r?.results || [])
      setView('addresses')
    } catch(e) {
      setResults([])
    } finally { setSearching(false) }
  }, [query, category, chain])

  useEffect(() => {
    if (query || category || chain) {
      const t = setTimeout(runSearch, 400)
      return () => clearTimeout(t)
    } else {
      setView('entities')
    }
  }, [query, category, chain, runSearch])

  return (
    <div style={{ maxWidth:1200, margin:'0 auto', padding:'40px 24px' }}>

      {/* Header */}
      <div className="animate-fade-up" style={{ marginBottom:40 }}>
        <div className="font-mono" style={{ color:'var(--red)', fontSize:11, letterSpacing:3, marginBottom:10 }}>
          // THREAT INTELLIGENCE DATABASE
        </div>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
          <div>
            <h1 className="font-orbitron" style={{ fontSize:32, fontWeight:800, color:'white', letterSpacing:2 }}>
              OSINT INTELLIGENCE
            </h1>
            <p style={{ color:'var(--text-dim)', marginTop:8, fontSize:14, lineHeight:1.6 }}>
              Curated database of sanctioned addresses, APT groups, darknet markets, and ransomware operators.
            </p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px',
            background:'rgba(255,0,51,.06)', border:'1px solid rgba(255,0,51,.2)', borderRadius:8 }}>
            <div className="live-dot-red"/>
            <span className="font-mono" style={{ fontSize:9, color:'var(--red)', letterSpacing:2 }}>
              LIVE THREAT DB
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:32 }}>
          {[...Array(4)].map((_,i) => <div key={i} className="skeleton" style={{ height:80, borderRadius:12 }}/>)}
        </div>
      ) : stats && (
        <div className="animate-fade-up d1" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:14, marginBottom:32 }}>
          <StatPill label="TOTAL ADDRESSES" value={stats.total_addresses}  color="var(--red)" />
          <StatPill label="THREAT ENTITIES"  value={stats.total_entities}  color="var(--orange)" />
          <StatPill label="CATEGORIES"       value={Object.keys(stats.categories||{}).length} color="var(--gold)" />
          <StatPill label="CHAINS COVERED"   value={Object.keys(stats.chains||{}).length} color="var(--green)" />
        </div>
      )}

      {/* Category overview pills */}
      {stats?.categories && (
        <div className="animate-fade-up d2" style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:32 }}>
          {Object.entries(stats.categories).map(([cat, count]) => {
            const meta = CATEGORY_META[cat] || { label:cat, color:'var(--cyan)', icon:'📁' }
            return (
              <button key={cat} onClick={() => setCategory(cat === category ? '' : cat)}
                style={{
                  display:'flex', alignItems:'center', gap:8, padding:'8px 16px', borderRadius:8, cursor:'pointer',
                  fontFamily:'Oxanium', fontSize:9, fontWeight:700, letterSpacing:1.5, transition:'all .2s',
                  background: category===cat ? `${meta.color}20` : 'var(--panel)',
                  border:`1px solid ${category===cat ? meta.color+'60' : 'var(--border)'}`,
                  color: category===cat ? meta.color : 'var(--dim)',
                  boxShadow: category===cat ? `0 0 20px ${meta.color}20` : 'none',
                }}>
                <span>{meta.icon}</span>
                <span>{meta.label.toUpperCase()}</span>
                <span style={{ background:`${meta.color}25`, padding:'2px 7px', borderRadius:10, fontSize:8 }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Search + filters */}
      <div className="animate-fade-up d3 card" style={{ padding:'16px 20px', marginBottom:24 }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ flex:1, minWidth:240, position:'relative' }}>
            <Search size={13} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--dim)' }}/>
            <input value={query} onChange={e=>setQuery(e.target.value)}
              placeholder="Search address, entity name, label..."
              style={{
                width:'100%', background:'var(--deep)', border:'1px solid var(--border)',
                borderRadius:6, paddingLeft:36, paddingRight:12, paddingTop:10, paddingBottom:10,
                color:'white', fontFamily:'Space Mono', fontSize:11, outline:'none', transition:'border-color .2s',
              }}
              onFocus={e=>e.target.style.borderColor='var(--cyan)'}
              onBlur={e=>e.target.style.borderColor='var(--border)'}/>
          </div>

          <select value={chain} onChange={e=>setChain(e.target.value)}
            style={{ padding:'10px 12px', background:'var(--deep)', border:'1px solid var(--border)',
              borderRadius:6, color:'white', fontFamily:'Space Mono', fontSize:10, outline:'none', cursor:'pointer' }}>
            <option value="">ALL CHAINS</option>
            {CHAINS.slice(1).map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>

          {(query || category || chain) && (
            <button onClick={() => { setQuery(''); setCategory(''); setChain(''); setView('entities') }}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 14px', background:'rgba(255,0,51,.08)',
                border:'1px solid rgba(255,0,51,.2)', borderRadius:6, color:'var(--red)', cursor:'pointer',
                fontFamily:'Space Mono', fontSize:10, letterSpacing:1, transition:'all .2s' }}>
              <X size={12}/> CLEAR
            </button>
          )}

          <div className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:1, marginLeft:'auto' }}>
            {view === 'addresses' ? `${results.length} results` : `${entities.length} entities`}
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display:'flex', gap:2, marginBottom:20 }}>
        {[['entities','🏢 THREAT ENTITIES'],['addresses','📋 ADDRESS DATABASE']].map(([v,label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            padding:'9px 20px', borderRadius:6, cursor:'pointer', fontFamily:'Oxanium',
            fontSize:9, fontWeight:700, letterSpacing:2, border:'none', transition:'all .2s',
            background: view===v ? 'rgba(0,229,255,.1)' : 'transparent',
            color: view===v ? 'var(--cyan)' : 'var(--dim)',
            borderBottom: `2px solid ${view===v?'var(--cyan)':'transparent'}`,
          }}>{label}</button>
        ))}
      </div>

      {/* Entities View */}
      {view === 'entities' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))', gap:16 }}>
          {loading
            ? [...Array(6)].map((_,i) => <div key={i} className="skeleton" style={{ height:120, borderRadius:12 }}/>)
            : entities.length > 0
              ? entities.map(e => <EntityCard key={e.entity_id} entity={e}/>)
              : <div className="card" style={{ textAlign:'center', padding:'60px', gridColumn:'1/-1' }}>
                  <Shield size={40} color="var(--dim)" style={{ margin:'0 auto 16px' }}/>
                  <div className="font-orbitron" style={{ color:'var(--dim)', fontSize:12, letterSpacing:2 }}>NO ENTITIES LOADED</div>
                </div>
          }
        </div>
      )}

      {/* Addresses View */}
      {view === 'addresses' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          {searching ? (
            <div style={{ padding:'60px', textAlign:'center' }}>
              <div className="animate-spin-fast" style={{ width:32, height:32, border:'2px solid var(--cyan)', borderTopColor:'transparent', borderRadius:'50%', margin:'0 auto 16px' }}/>
              <div className="font-mono" style={{ color:'var(--dim)', fontSize:10, letterSpacing:2 }}>SEARCHING DATABASE...</div>
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding:'60px', textAlign:'center' }}>
              <AlertTriangle size={36} color="var(--dim)" style={{ margin:'0 auto 16px' }}/>
              <div className="font-orbitron" style={{ color:'var(--dim)', fontSize:12, letterSpacing:2, marginBottom:8 }}>NO RESULTS</div>
              <div className="font-mono" style={{ color:'var(--muted)', fontSize:10 }}>Try a different search term or category</div>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {['#','ADDRESS','CATEGORY','LABEL','CHAIN','ACTION'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((hit, i) => <AddressRow key={hit.address+i} hit={hit} i={i}/>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
