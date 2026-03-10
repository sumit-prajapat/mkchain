import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search, History, Home, Activity, Shield, GitBranch, Bell } from 'lucide-react'
import { getOsintStats, getAlertFeed } from '../api'

const links = [
  { to:'/',        label:'HOME',         icon:Home      },
  { to:'/analyze', label:'ANALYZE',      icon:Search    },
  { to:'/compare', label:'COMPARE',      icon:GitBranch },
  { to:'/alerts',  label:'ALERTS',       icon:Bell      },
  { to:'/history', label:'HISTORY',      icon:History   },
  { to:'/osint',   label:'INTELLIGENCE', icon:Shield    },
]

export default function Navbar() {
  const { pathname }              = useLocation()
  const [scrolled, setScrolled]   = useState(false)
  const [time, setTime]           = useState(new Date())
  const [apiOk, setApiOk]         = useState(null)
  const [unread, setUnread]       = useState(0)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    const tick = setInterval(() => setTime(new Date()), 1000)

    getOsintStats()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false))

    getAlertFeed(50)
      .then(f => setUnread(f.filter(a => !a.is_read).length))
      .catch(() => {})

    return () => { window.removeEventListener('scroll', onScroll); clearInterval(tick) }
  }, [])

  return (
    <nav style={{
      borderBottom: '1px solid var(--border)',
      background: scrolled ? 'rgba(2,8,18,0.97)' : 'rgba(2,8,18,0.75)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      position: 'sticky', top: 0, zIndex: 100,
      transition: 'background 0.3s',
    }}>
      <div style={{ height:2, background:'linear-gradient(90deg,transparent 0%,var(--cyan) 30%,var(--green) 70%,transparent 100%)' }}/>

      <div style={{ maxWidth:1280, margin:'0 auto', padding:'0 24px', height:62,
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>

        {/* Logo */}
        <Link to="/" style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ position:'relative', width:34, height:34 }}>
            <div className="animate-spin-slow" style={{
              position:'absolute', inset:0, border:'1px solid rgba(0,229,255,.5)',
              borderRadius:'50%', borderTopColor:'transparent', borderRightColor:'transparent',
            }}/>
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
              background:'rgba(0,229,255,.08)', borderRadius:'50%', border:'1px solid rgba(0,229,255,.15)' }}>
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
        <div style={{ display:'flex', gap:2, overflowX:'auto' }}>
          {links.map(({ to, label, icon:Icon }) => {
            const active = pathname === to || (to !== '/' && pathname.startsWith(to))
            const isAlerts = to === '/alerts'
            return (
              <Link key={to} to={to} style={{
                textDecoration:'none', display:'flex', alignItems:'center', gap:5, position:'relative',
                padding:'6px 12px', borderRadius:6, fontSize:9, fontWeight:700,
                letterSpacing:1.5, fontFamily:'Oxanium, monospace', flexShrink:0,
                transition:'all 0.2s', whiteSpace:'nowrap',
                color: active ? 'var(--cyan)' : 'var(--dim)',
                background: active ? 'rgba(0,229,255,.08)' : 'transparent',
                border: active ? '1px solid rgba(0,229,255,.2)' : '1px solid transparent',
              }}
                onMouseEnter={e=>{ if(!active){ e.currentTarget.style.color='var(--text)'; e.currentTarget.style.background='rgba(255,255,255,.03)' }}}
                onMouseLeave={e=>{ if(!active){ e.currentTarget.style.color='var(--dim)'; e.currentTarget.style.background='transparent' }}}
              >
                <Icon size={11}/>
                {label}
                {isAlerts && unread > 0 && (
                  <span style={{ position:'absolute', top:2, right:2, width:14, height:14, borderRadius:'50%',
                    background:'var(--red)', display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:7, fontFamily:'Oxanium', fontWeight:900, color:'white', letterSpacing:0 }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Status */}
        <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{
              width:6, height:6, borderRadius:'50%',
              background: apiOk === null ? 'var(--gold)' : apiOk ? 'var(--green)' : 'var(--red)',
              boxShadow: apiOk ? '0 0 8px rgba(57,255,20,.6)' : apiOk===false ? '0 0 8px rgba(255,0,51,.6)' : '0 0 8px rgba(255,196,0,.5)',
            }}/>
            <span className="font-mono" style={{ fontSize:8, color:'var(--dim)', letterSpacing:1 }}>
              {apiOk === null ? 'CONNECTING' : apiOk ? 'API LIVE' : 'API DOWN'}
            </span>
          </div>
          <span className="font-mono" style={{ fontSize:9, color:'var(--dim)', letterSpacing:1 }}>
            {time.toLocaleTimeString()}
          </span>
        </div>
      </div>
    </nav>
  )
}
