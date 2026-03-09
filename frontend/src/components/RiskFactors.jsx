import React from 'react'
import { AlertTriangle, ShieldAlert, Activity, Shuffle, Globe, Zap, DollarSign, ArrowRightLeft, Eye, Clock } from 'lucide-react'

const FLAG_META = {
  mixer_interaction:        { label:'Mixer Interaction',     color:'var(--red)',    icon:Shuffle,        impact:'CRITICAL' },
  darkweb_match:            { label:'Dark Web Match',        color:'var(--red)',    icon:Globe,          impact:'CRITICAL' },
  peel_chain_detected:      { label:'Peel Chain',           color:'var(--orange)', icon:ArrowRightLeft, impact:'HIGH' },
  layered_mixer_routing:    { label:'Layered Routing',      color:'var(--orange)', icon:Activity,       impact:'HIGH' },
  mixer_proximity:          { label:'Mixer Proximity',      color:'var(--orange)', icon:ShieldAlert,    impact:'HIGH' },
  high_velocity:            { label:'High Velocity',        color:'var(--gold)',   icon:Zap,            impact:'MEDIUM' },
  round_amount_structuring: { label:'Structuring',          color:'var(--gold)',   icon:DollarSign,     impact:'MEDIUM' },
  high_fan_out:             { label:'High Fan-Out',         color:'var(--gold)',   icon:Eye,            impact:'MEDIUM' },
  high_fan_in:              { label:'High Fan-In',          color:'var(--gold)',   icon:Activity,       impact:'MEDIUM' },
  dormancy_then_activity:   { label:'Dormancy→Activity',    color:'var(--gold)',   icon:Clock,          impact:'MEDIUM' },
}

export function FlagBadge({ flag }) {
  const meta = FLAG_META[flag] || { label:flag, color:'var(--green)', icon:AlertTriangle, impact:'LOW' }
  const Icon = meta.icon
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:6,
      fontSize:9, fontWeight:700, fontFamily:'Orbitron, monospace', letterSpacing:1.5,
      padding:'5px 10px', borderRadius:4,
      color: meta.color, background:`${meta.color}12`, border:`1px solid ${meta.color}30`
    }}>
      <Icon size={10} />
      {meta.label}
    </span>
  )
}

export function RiskFactors({ factors = [] }) {
  if (!factors.length) return null

  const impactColor = { CRITICAL:'var(--red)', HIGH:'var(--orange)', MEDIUM:'var(--gold)', LOW:'var(--green)' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {factors.map((f, i) => (
        <div key={i} className="card animate-fade-up" style={{
          animationDelay:`${i * 0.1}s`, opacity:0,
          borderLeft:`2px solid ${impactColor[f.impact] || 'var(--border-glow)'}`,
          transition:'all 0.3s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderLeftColor = impactColor[f.impact] || 'var(--cyan)'}
          onMouseLeave={e => {}}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:8 }}>
            <span style={{ fontFamily:'Orbitron', fontSize:11, fontWeight:600, color:'white', letterSpacing:0.5 }}>{f.factor}</span>
            <span style={{ fontFamily:'Orbitron', fontSize:9, fontWeight:700, letterSpacing:2, color:impactColor[f.impact] || 'var(--text-dim)', whiteSpace:'nowrap', flexShrink:0 }}>
              [{f.impact}]
            </span>
          </div>
          <p style={{ fontSize:12, color:'var(--text-dim)', lineHeight:1.7 }}>{f.detail}</p>
        </div>
      ))}
    </div>
  )
}
