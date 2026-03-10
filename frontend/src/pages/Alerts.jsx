import React, { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Plus, Trash2, RefreshCw, AlertTriangle, Check, Activity, X } from 'lucide-react'
import { addWatch, listWatched, removeWatch, getAlertFeed, markAlertsRead, checkNow } from '../api'
import { BASE_URL } from '../api'

const ALERT_COLORS = {
  new_tx:   { color:'var(--cyan)',   icon:'📡', label:'New Transaction' },
  darkweb:  { color:'var(--red)',    icon:'⚠️', label:'Dark Web Match'  },
  high_risk:{ color:'var(--orange)', icon:'🔴', label:'High Risk'       },
  mixer:    { color:'var(--gold)',   icon:'🌀', label:'Mixer Activity'  },
}

function LiveDot({ active }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{
        width:8, height:8, borderRadius:'50%',
        background: active ? 'var(--green)' : 'var(--dim)',
        boxShadow: active ? '0 0 10px rgba(57,255,20,.7)' : 'none',
        animation: active ? 'live-pulse 2s infinite' : 'none',
      }}/>
      <span className="font-mono" style={{ fontSize:9, color: active ? 'var(--green)' : 'var(--dim)', letterSpacing:1.5 }}>
        {active ? 'LIVE' : 'OFFLINE'}
      </span>
    </div>
  )
}

function AddWatchModal({ onClose, onAdd }) {
  const [address,   setAddress]   = useState('')
  const [chain,     setChain]     = useState('eth')
  const [label,     setLabel]     = useState('')
  const [threshold, setThreshold] = useState(50)
  const [loading,   setLoading]   = useState(false)

  async function submit() {
    if (!address.trim()) return
    setLoading(true)
    try {
      await onAdd(address.trim(), chain, label, threshold)
      onClose()
    } catch(e) {
      alert('Failed to add watch: ' + (e?.response?.data?.detail || e.message))
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(2,8,18,.9)', zIndex:200,
      display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(8px)' }}>
      <div className="card" style={{ width:460, maxWidth:'90vw' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <div className="font-orbitron" style={{ fontSize:14, fontWeight:700, color:'white', letterSpacing:2 }}>
            ADD WATCH
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--dim)' }}>
            <X size={18}/>
          </button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <div className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:2, marginBottom:8 }}>ADDRESS</div>
            <input value={address} onChange={e=>setAddress(e.target.value)}
              placeholder="0x... or 1BTC..."
              style={{ width:'100%', background:'var(--deep)', border:'1px solid var(--border)', borderRadius:6,
                padding:'11px 12px', color:'white', fontFamily:'Space Mono', fontSize:11, outline:'none' }}/>
          </div>

          <div>
            <div className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:2, marginBottom:8 }}>CHAIN</div>
            <div style={{ display:'flex', gap:8 }}>
              {['eth','btc','polygon'].map(c => (
                <button key={c} onClick={()=>setChain(c)} style={{
                  padding:'8px 16px', borderRadius:6, cursor:'pointer', fontFamily:'Oxanium',
                  fontSize:9, fontWeight:700, letterSpacing:2, border:'none', transition:'all .2s',
                  background: chain===c ? 'rgba(0,229,255,.1)' : 'var(--panel)',
                  color: chain===c ? 'var(--cyan)' : 'var(--dim)',
                  border: `1px solid ${chain===c ? 'rgba(0,229,255,.3)' : 'var(--border)'}`,
                }}>{c.toUpperCase()}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:2, marginBottom:8 }}>LABEL (optional)</div>
            <input value={label} onChange={e=>setLabel(e.target.value)}
              placeholder="e.g. Suspect Wallet #3"
              style={{ width:'100%', background:'var(--deep)', border:'1px solid var(--border)', borderRadius:6,
                padding:'11px 12px', color:'white', fontFamily:'Outfit', fontSize:13, outline:'none' }}/>
          </div>

          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <span className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:2 }}>ALERT THRESHOLD</span>
              <span className="font-orbitron" style={{ fontSize:11, color:'var(--cyan)', fontWeight:700 }}>
                {threshold}+
              </span>
            </div>
            <input type="range" min={0} max={90} step={10} value={threshold} onChange={e=>setThreshold(+e.target.value)}/>
            <div className="font-mono" style={{ fontSize:9, color:'var(--dim)', marginTop:4, textAlign:'center' }}>
              Alert when risk score exceeds {threshold}
            </div>
          </div>

          <button onClick={submit} disabled={loading || !address.trim()} className="btn-primary"
            style={{ justifyContent:'center', padding:'13px', fontSize:11, letterSpacing:2, marginTop:4 }}>
            {loading ? 'ADDING...' : <><Bell size={14}/> START WATCHING</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Alerts() {
  const [watches,    setWatches]    = useState([])
  const [feed,       setFeed]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [sseActive,  setSseActive]  = useState(false)
  const [checking,   setChecking]   = useState({})
  const eventSource = useRef(null)

  useEffect(() => {
    loadData()
    startSSE()
    return () => { if (eventSource.current) eventSource.current.close() }
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [w, f] = await Promise.all([listWatched(), getAlertFeed(30)])
      setWatches(w)
      setFeed(f)
    } catch(e) {}
    finally { setLoading(false) }
  }

  function startSSE() {
    if (eventSource.current) eventSource.current.close()
    const es = new EventSource(`${BASE_URL}/api/alerts/stream`)
    eventSource.current = es

    es.onopen = () => setSseActive(true)
    es.onerror = () => setSseActive(false)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'alert') {
          setFeed(prev => [data, ...prev].slice(0, 50))
        }
        if (data.type === 'heartbeat') {
          loadData() // Refresh on each heartbeat
        }
      } catch(err) {}
    }
  }

  async function handleAddWatch(address, chain, label, threshold) {
    await addWatch(address, chain, label, threshold)
    await loadData()
  }

  async function handleRemove(id) {
    if (!confirm('Remove this wallet from watch list?')) return
    await removeWatch(id)
    setWatches(w => w.filter(x => x.id !== id))
  }

  async function handleCheckNow(id) {
    setChecking(c => ({ ...c, [id]:true }))
    try {
      const r = await checkNow(id)
      await loadData()
      if (r.new_alerts === 0) alert('No new transactions detected.')
    } catch(e) {}
    finally { setChecking(c => ({ ...c, [id]:false })) }
  }

  async function markRead(ids) {
    await markAlertsRead(ids)
    setFeed(f => f.map(a => ids.includes(a.id) ? {...a, is_read:true} : a))
  }

  const unreadCount = feed.filter(a => !a.is_read).length

  return (
    <div style={{ maxWidth:1200, margin:'0 auto', padding:'40px 24px' }}>

      {showModal && <AddWatchModal onClose={() => setShowModal(false)} onAdd={handleAddWatch}/>}

      {/* Header */}
      <div className="animate-fade-up" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16, marginBottom:40 }}>
        <div>
          <div className="font-mono" style={{ color:'var(--gold)', fontSize:11, letterSpacing:3, marginBottom:10 }}>
            // REAL-TIME MONITORING
          </div>
          <h1 className="font-orbitron" style={{ fontSize:32, fontWeight:800, color:'white', letterSpacing:2 }}>
            ALERT DASHBOARD
          </h1>
          <p style={{ color:'var(--text-dim)', marginTop:8, fontSize:14, lineHeight:1.6 }}>
            Monitor wallets 24/7. Get instant alerts on new transactions, mixer activity, and OFAC matches.
          </p>
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <LiveDot active={sseActive}/>
          {unreadCount > 0 && (
            <button onClick={() => markRead(feed.filter(a=>!a.is_read).map(a=>a.id))}
              className="btn-ghost" style={{ fontSize:9, padding:'8px 16px', letterSpacing:1.5 }}>
              <Check size={12}/> MARK ALL READ ({unreadCount})
            </button>
          )}
          <button onClick={() => setShowModal(true)} className="btn-primary" style={{ fontSize:11, letterSpacing:2, padding:'10px 20px' }}>
            <Plus size={14}/> ADD WATCH
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="animate-fade-up d1" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:14, marginBottom:32 }}>
        {[
          { label:'WATCHED WALLETS', value:watches.length, color:'var(--cyan)' },
          { label:'TOTAL ALERTS',    value:feed.length,    color:'var(--gold)' },
          { label:'UNREAD',          value:unreadCount,    color: unreadCount>0?'var(--red)':'var(--green)' },
          { label:'STREAM STATUS',   value:sseActive?'LIVE':'OFFLINE', color:sseActive?'var(--green)':'var(--red)' },
        ].map(({ label,value,color }) => (
          <div key={label} className="card card-glow" style={{ textAlign:'center', padding:'18px 12px' }}>
            <div className="font-orbitron" style={{ fontSize:24, fontWeight:800, color, lineHeight:1 }}>{value}</div>
            <div className="font-mono" style={{ fontSize:8, color:'var(--dim)', letterSpacing:2, marginTop:6 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'360px 1fr', gap:24 }}>

        {/* Watched wallets panel */}
        <div>
          <div className="font-mono" style={{ fontSize:9, color:'var(--cyan)', letterSpacing:2, marginBottom:14 }}>
            WATCHED WALLETS
          </div>

          {loading ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[...Array(3)].map((_,i) => <div key={i} className="skeleton" style={{ height:80, borderRadius:12 }}/>)}
            </div>
          ) : watches.length === 0 ? (
            <div className="card" style={{ textAlign:'center', padding:'40px 20px' }}>
              <Bell size={32} color="var(--dim)" style={{ margin:'0 auto 12px' }}/>
              <div className="font-orbitron" style={{ color:'var(--dim)', fontSize:11, letterSpacing:2, marginBottom:12 }}>NO WALLETS WATCHED</div>
              <button onClick={()=>setShowModal(true)} className="btn-primary" style={{ fontSize:9, padding:'8px 18px', letterSpacing:2 }}>
                <Plus size={12}/> ADD FIRST WATCH
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {watches.map(w => (
                <div key={w.id} className="card" style={{ transition:'all .2s' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(0,229,255,.25)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=''}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                        <span className={`chain-${w.chain}`} style={{ fontFamily:'Oxanium', fontSize:8, fontWeight:700, padding:'2px 7px', borderRadius:3, letterSpacing:1.5 }}>
                          {w.chain?.toUpperCase()}
                        </span>
                        {w.unread_count > 0 && (
                          <span style={{ background:'var(--red)', color:'white', fontSize:8, fontFamily:'Oxanium', fontWeight:700,
                            padding:'1px 7px', borderRadius:10, letterSpacing:1 }}>
                            {w.unread_count} NEW
                          </span>
                        )}
                      </div>
                      <div className="font-mono" style={{ fontSize:9, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {w.label || w.address.slice(0,20)+'...'}
                      </div>
                      <div className="font-mono" style={{ fontSize:8, color:'var(--dim)', marginTop:3 }}>
                        Threshold: {w.alert_threshold}+ · {w.alert_count} alerts
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                      <button onClick={()=>handleCheckNow(w.id)} disabled={checking[w.id]}
                        title="Check now"
                        style={{ background:'none', border:'1px solid var(--border)', borderRadius:5, padding:5,
                          cursor:'pointer', color:'var(--dim)', transition:'all .2s' }}
                        onMouseEnter={e=>{ e.currentTarget.style.borderColor='rgba(0,229,255,.3)'; e.currentTarget.style.color='var(--cyan)' }}
                        onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--dim)' }}>
                        <RefreshCw size={12} className={checking[w.id]?'animate-spin-fast':''}/>
                      </button>
                      <button onClick={()=>handleRemove(w.id)}
                        style={{ background:'none', border:'1px solid transparent', borderRadius:5, padding:5,
                          cursor:'pointer', color:'var(--dim)', transition:'all .2s' }}
                        onMouseEnter={e=>{ e.currentTarget.style.borderColor='rgba(255,0,51,.3)'; e.currentTarget.style.color='var(--red)'; e.currentTarget.style.background='rgba(255,0,51,.06)' }}
                        onMouseLeave={e=>{ e.currentTarget.style.borderColor='transparent'; e.currentTarget.style.color='var(--dim)'; e.currentTarget.style.background='none' }}>
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alert feed */}
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div className="font-mono" style={{ fontSize:9, color:'var(--gold)', letterSpacing:2 }}>
              ALERT FEED
            </div>
            <button onClick={loadData} style={{ background:'none', border:'1px solid var(--border)', borderRadius:5,
              padding:'5px 10px', cursor:'pointer', color:'var(--dim)', display:'flex', alignItems:'center', gap:6,
              fontFamily:'Space Mono', fontSize:8, letterSpacing:1, transition:'all .2s' }}
              onMouseEnter={e=>{ e.currentTarget.style.color='var(--cyan)'; e.currentTarget.style.borderColor='rgba(0,229,255,.3)' }}
              onMouseLeave={e=>{ e.currentTarget.style.color='var(--dim)'; e.currentTarget.style.borderColor='var(--border)' }}>
              <RefreshCw size={10}/> REFRESH
            </button>
          </div>

          {feed.length === 0 ? (
            <div className="card" style={{ textAlign:'center', padding:'60px' }}>
              <Activity size={36} color="var(--dim)" style={{ margin:'0 auto 16px' }}/>
              <div className="font-orbitron" style={{ color:'var(--dim)', fontSize:12, letterSpacing:2, marginBottom:8 }}>
                NO ALERTS YET
              </div>
              <div className="font-mono" style={{ fontSize:10, color:'var(--dim)', lineHeight:1.6 }}>
                Add wallets to watch list.<br/>Alerts appear here in real time.
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:600, overflowY:'auto' }}>
              {feed.map((alert, i) => {
                const meta = ALERT_COLORS[alert.alert_type] || ALERT_COLORS.new_tx
                return (
                  <div key={alert.id || i} className="card"
                    style={{
                      borderLeft:`3px solid ${meta.color}`,
                      opacity: alert.is_read ? 0.6 : 1,
                      transition:'all .2s',
                      background: alert.is_read ? 'var(--card)' : `rgba(${meta.color === 'var(--red)' ? '255,0,51' : '0,229,255'},.04)`,
                    }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
                          <span style={{ fontSize:14 }}>{meta.icon}</span>
                          <span style={{ fontFamily:'Oxanium', fontSize:9, fontWeight:700, letterSpacing:1.5,
                            color:meta.color, padding:'2px 8px', borderRadius:3,
                            background:`${meta.color}15`, border:`1px solid ${meta.color}30` }}>
                            {meta.label.toUpperCase()}
                          </span>
                          <span className={`chain-${alert.chain}`} style={{ fontFamily:'Oxanium', fontSize:8, fontWeight:700, padding:'2px 7px', borderRadius:3, letterSpacing:1.5 }}>
                            {alert.chain?.toUpperCase()}
                          </span>
                          {!alert.is_read && (
                            <span style={{ background:'var(--red)', color:'white', fontSize:7, fontFamily:'Oxanium',
                              fontWeight:700, padding:'1px 6px', borderRadius:10, letterSpacing:1 }}>NEW</span>
                          )}
                        </div>
                        <div style={{ fontSize:12, color:'white', fontWeight:500, marginBottom:5 }}>{alert.message}</div>
                        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                          <span className="font-mono" style={{ fontSize:8, color:'var(--dim)' }}>
                            {alert.address?.slice(0,14)}...
                          </span>
                          {alert.tx_hash && (
                            <span className="font-mono" style={{ fontSize:8, color:'var(--cyan)' }}>
                              TX: {alert.tx_hash?.slice(0,12)}...
                            </span>
                          )}
                          {alert.value > 0 && (
                            <span className="font-mono" style={{ fontSize:8, color:'white' }}>
                              {parseFloat(alert.value).toFixed(5)} {alert.chain?.toUpperCase()}
                            </span>
                          )}
                          <span className="font-mono" style={{ fontSize:8, color:'var(--dim)' }}>
                            {new Date(alert.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {!alert.is_read && (
                        <button onClick={() => markRead([alert.id])}
                          style={{ background:'none', border:'1px solid var(--border)', borderRadius:5,
                            padding:5, cursor:'pointer', color:'var(--dim)', flexShrink:0, transition:'all .2s' }}
                          onMouseEnter={e=>{ e.currentTarget.style.color='var(--green)'; e.currentTarget.style.borderColor='rgba(57,255,20,.3)' }}
                          onMouseLeave={e=>{ e.currentTarget.style.color='var(--dim)'; e.currentTarget.style.borderColor='var(--border)' }}>
                          <Check size={11}/>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
