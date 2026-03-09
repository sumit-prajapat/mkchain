import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search, History, Home, Activity } from 'lucide-react'

const links = [
  { to: '/',        label: 'HOME',    icon: Home },
  { to: '/analyze', label: 'ANALYZE', icon: Search },
  { to: '/history', label: 'HISTORY', icon: History },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    const tick = setInterval(() => setTime(new Date()), 1000)
    return () => { window.removeEventListener('scroll', onScroll); clearInterval(tick) }
  }, [])

  return (
    <nav style={{
      borderBottom: '1px solid var(--border)',
      background: scrolled ? 'rgba(3,6,16,0.92)' : 'rgba(3,6,16,0.6)',
      backdropFilter: 'blur(16px)',
      position: 'sticky', top: 0, zIndex: 50,
      transition: 'background 0.3s',
    }}>
      {/* Top accent line */}
      <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, var(--cyan), var(--green), transparent)' }} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', width: 32, height: 32 }}>
            <div className="animate-spin-slow" style={{
              width: 32, height: 32, border: '1px solid var(--cyan)',
              borderRadius: '50%', borderTopColor: 'transparent', borderRightColor: 'transparent',
              position: 'absolute',
            }} />
            <div style={{ position: 'absolute', inset: 4, background: 'rgba(0,245,255,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={12} color="var(--cyan)" />
            </div>
          </div>
          <div>
            <div className="font-orbitron" style={{ fontSize: 16, fontWeight: 700, color: 'white', letterSpacing: 3 }}>
              MK<span style={{ color: 'var(--cyan)' }}>CHAIN</span>
            </div>
            <div className="font-mono" style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: 2, marginTop: -2 }}>
              FORENSICS INTELLIGENCE
            </div>
          </div>
        </Link>

        {/* Nav links */}
        <div style={{ display: 'flex', gap: 4 }}>
          {links.map(({ to, label, icon: Icon }) => {
            const active = pathname === to
            return (
              <Link key={to} to={to} style={{
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                letterSpacing: 2, fontFamily: 'Orbitron, monospace',
                transition: 'all 0.2s',
                color: active ? 'var(--cyan)' : 'var(--text-dim)',
                background: active ? 'rgba(0,245,255,0.08)' : 'transparent',
                border: active ? '1px solid rgba(0,245,255,0.2)' : '1px solid transparent',
              }}>
                <Icon size={12} />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['ETH','BTC','MATIC'].map((chain, i) => (
              <span key={chain} className="font-mono" style={{
                fontSize: 9, letterSpacing: 1.5, padding: '3px 7px',
                border: '1px solid var(--border-glow)', borderRadius: 3,
                color: i === 0 ? '#7eb4ff' : i === 1 ? 'var(--orange)' : 'var(--purple)',
              }}>{chain}</span>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="live-dot" />
            <span className="font-mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>
              {time.toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </nav>
  )
}
