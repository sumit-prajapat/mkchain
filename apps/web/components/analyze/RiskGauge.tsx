'use client'

import { motion } from 'framer-motion'

interface Props {
  score: number  // 0-100
  label: string
  size?: number
}

const RISK_CONFIG = {
  safe:     { color: '#1D9E75', bg: 'bg-accent/10',      text: 'text-accent',      border: 'border-accent/30' },
  low:      { color: '#639922', bg: 'bg-green-500/10',   text: 'text-green-400',   border: 'border-green-500/30' },
  medium:   { color: '#BA7517', bg: 'bg-chart-4/10',     text: 'text-chart-4',     border: 'border-chart-4/30' },
  high:     { color: '#D85A30', bg: 'bg-destructive/10', text: 'text-destructive',  border: 'border-destructive/30' },
  critical: { color: '#E24B4A', bg: 'bg-destructive/20', text: 'text-destructive',  border: 'border-destructive/50' },
}

export default function RiskGauge({ score, label, size = 160 }: Props) {
  const config = RISK_CONFIG[label as keyof typeof RISK_CONFIG] ?? RISK_CONFIG.medium
  const radius = (size / 2) - 16
  const circumference = 2 * Math.PI * radius
  const halfCirc = circumference / 2
  const offset = halfCirc - (score / 100) * halfCirc

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
        <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
          {/* Background arc */}
          <path
            d={`M ${16} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 16} ${size / 2}`}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Score arc */}
          <motion.path
            d={`M ${16} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 16} ${size / 2}`}
            fill="none"
            stroke={config.color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${halfCirc} ${halfCirc}`}
            initial={{ strokeDashoffset: halfCirc }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
          {/* Score text */}
          <text
            x={size / 2}
            y={size / 2 + 4}
            textAnchor="middle"
            fontSize="28"
            fontWeight="600"
            fill={config.color}
          >
            {score}
          </text>
          <text
            x={size / 2}
            y={size / 2 + 18}
            textAnchor="middle"
            fontSize="10"
            fill="rgba(255,255,255,0.4)"
          >
            / 100
          </text>
        </svg>
      </div>
      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
        {label.toUpperCase()} RISK
      </span>
    </div>
  )
}
