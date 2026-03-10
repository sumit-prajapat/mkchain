import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search, History, Home, Activity, Shield } from 'lucide-react'
import { getOsintStats } from '../api'

const links = [
  { to:'/',           label:'HOME',        icon:Home   },
  { to:'/analyze',    label:'ANALYZE',     icon:Search },
  { to:'/history',    label:'HISTORY',     icon:History},
  { to:'/osint',      label:'INTELLIGENCE',icon:Shield },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const [scrolled, setScrolled]   = useState(false)
  const [time, setTime]           = useState(new Date())
  const [stats, setStats]         = useState(null)
  const [apiOk, setApiOk]         = useState(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    const tick = setInterval(() => setTime(new Date()), 1000)

    // Fetch live API stats
    getOsintStats()
      .then(s => { setStats(s); setApiOk(true) })
      .catch(()  => setApiOk(false))

    return () => { window.removeEventListener('scroll', onScroll); clearInterval(tick) }
  }, [])

  return (
    <nav style={{
      borderBottom:'1px solid var(--border)',
      background: scrolled ? 'rgba(2,8,18,0.97)' : 'rgba(2,8,18,0.75)',
      backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
      position:'sticky', top:0, zIndex:100,
      transition:'background 0.3s',
    }}>
      {/* Top accent */}
      <div style={{ height:2, background:'linear-gradient(90deg,transparent 0%,var(--cyan) 30%,var(--green) 70%,transparent 100%)' }} />

      <div style={{ maxWidth:1280, margin:'0 auto', padding:'0 24px', height:62,
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>

        {/* Logo */}
        <Link to="/" style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ position:'relative', width:34, height:34 }}>
            <div className="animate-spin-slow" style={{
              position:'absolute', inset:0, border:'1px solid rgba(0,229,255,.5)',
              borderRadius:'50%', borderTopColor:'transparent', borderRightColor:'transparent',
            }}/>
            <div style={{
              position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
              background:'rgba(0,229,255,.08)', borderRadius:'50%', border:'1px solid rgba(0,229,255,.15)',
            }}>
              <Activity size={13} color="var(--cyan)"/>
            </div>
          </div>
          <div>
            <div className="font-orbitron" style={{ fontSize:15, fontWeight:800, color:'white', letterSpacing:3, lineHeight:1.1 }}>
              MK<span style={{ color:'var(--cyan)' }}>CHAIN</span>
            </div>
            <div className="font-mono" style={{ fontSize:7, color:'var(--dim)', letterSpacing:2 }}>
              BLOCKCHAIN FORENSICS
            </div>
          </div>
        </Link>

        {/* Nav links */}
        <div style={{ display:'flex', gap:2 }}>
          {links.map(({ to, label, icon:Icon }) => {
            const active = pathname === to || (to !== '/' && pathname.startsWith(to))
            return (
              <Link key={to} to={to} style={{
                textDecoration:'none', display:'flex', alignItems:'center', gap:6,
                padding:'6px 14px', borderRadius:6, fontSize:9, fontWeight:700,
                letterSpacing:2, fontFamily:'Oxanium, monospace',
                transition:'all 0.2s',
                color:  active ? 'var(--cyan)'              : 'var(--dim)',
                background: active ? 'rgba(0,229,255,.08)'  : 'transparent',
                border: active ? '1px solid rgba(0,229,255,.2)' : '1px solid transparent',
              }}
                onMouseEnter={e=>{ if(!active){ e.currentTarget.style.color='var(--text)'; e.currentTarget.style.background='rgba(255,255,255,.03)' }}}
                onMouseLeave={e=>{ if(!active){ e.currentTarget.style.color='var(--dim)'; e.currentTarget.style.background='transparent' }}}
              >
                <Icon size={11}/> {label}
              </Link>
            )
          })}
        </div>

        {/* Status bar */}
        <div style={{ display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
          {/* Chain pills */}
          <div style={{ display:'flex', gap:6 }}>
            {[['ETH','#7eb4ff'],['BTC','var(--orange)'],['MATIC','var(--purple)']].map(([chain, color]) => (
              <span key={chain} className="font-mono" style={{
                fontSize:8, letterSpacing:1.5, padding:'3px 8px', borderRadius:3,
                border:'1px solid var(--border)', color,
              }}>{chain}</span>
            ))}
          </div>

          {/* API status */}
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{
              width:6, height:6, borderRadius:'50%',
              background: apiOk === null ? 'var(--gold)' : apiOk ? 'var(--green)' : 'var(--red)',
              boxShadow: apiOk ? '0 0 8px rgba(57,255,20,.6)' : apiOk===false ? '0 0 8px rgba(255,0,51,.6)' : '0 0 8px rgba(255,196,0,.6)',
            }}/>
            <span className="font-mono" style={{ fontSize:8, color:'var(--dim)', letterSpacing:1 }}>
              {apiOk === null ? 'CONNECTING' : apiOk ? `API LIVE` : 'API DOWN'}
            </span>
          </div>

          {/* Time */}
          <span className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:1 }}>
            {time.toLocaleTimeString()}
          </span>
        </div>
      </div>
    </nav>
  )
}
