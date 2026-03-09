import React, { useEffect, useState } from 'react'

const COLORS = { CRITICAL: '#ff0040', HIGH: '#ff6b00', MEDIUM: '#ffd700', LOW: '#00ff88' }
const LABELS = { CRITICAL: 'CRITICAL RISK', HIGH: 'HIGH RISK', MEDIUM: 'MEDIUM RISK', LOW: 'LOW RISK' }

export default function RiskGauge({ score = 0, label = 'LOW', size = 200 }) {
  const [anim, setAnim] = useState(0)
  const radius  = size * 0.36
  const cx = size / 2, cy = size / 2
  const circum  = 2 * Math.PI * radius
  const offset  = circum * (1 - anim / 100)
  const color   = COLORS[label] || '#00f5ff'

  useEffect(() => {
    const t = setTimeout(() => setAnim(score), 150)
    return () => clearTimeout(t)
  }, [score])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <svg width={size} height={size}>
          {/* Outer decorative ring */}
          <circle cx={cx} cy={cy} r={radius + 16} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
          {/* Tick marks */}
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = (i * 10 - 90) * (Math.PI / 180)
            const r1 = radius + 10, r2 = radius + (i % 3 === 0 ? 6 : 13)
            return (
              <line key={i}
                x1={cx + r1 * Math.cos(angle)} y1={cy + r1 * Math.sin(angle)}
                x2={cx + r2 * Math.cos(angle)} y2={cy + r2 * Math.sin(angle)}
                stroke={i % 3 === 0 ? color : 'rgba(255,255,255,0.08)'} strokeWidth={i % 3 === 0 ? 1.5 : 0.5}
              />
            )
          })}
          {/* Track */}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={size * 0.065} />
          {/* Progress */}
          <circle cx={cx} cy={cy} r={radius} fill="none"
            stroke={color} strokeWidth={size * 0.065} strokeLinecap="round"
            strokeDasharray={circum} strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)',
              filter: `drop-shadow(0 0 12px ${color})`
            }}
          />
          {/* Inner glow */}
          <circle cx={cx} cy={cy} r={radius - size * 0.08} fill={`${color}06`} />
          {/* Score */}
          <text x={cx} y={cy - 8} textAnchor="middle" fill={color}
            fontSize={size * 0.22} fontWeight="800" fontFamily="Orbitron, monospace" letterSpacing={-2}>
            {Math.round(anim)}
          </text>
          <text x={cx} y={cy + size * 0.1} textAnchor="middle" fill="rgba(255,255,255,0.3)"
            fontSize={size * 0.07} fontFamily="IBM Plex Mono, monospace" letterSpacing={2}>
            / 100
          </text>
        </svg>

        {/* Spinning outer ring */}
        <div className="animate-spin-slow" style={{
          position: 'absolute', top: -8, left: -8, right: -8, bottom: -8,
          border: `1px dashed ${color}22`, borderRadius: '50%',
        }} />
      </div>

      {/* Label */}
      <div className="font-orbitron" style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 3,
        color, padding: '6px 18px', borderRadius: 4,
        background: `${color}12`, border: `1px solid ${color}30`,
      }}>
        {LABELS[label]}
      </div>
    </div>
  )
}
