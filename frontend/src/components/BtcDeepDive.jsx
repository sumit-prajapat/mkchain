import React, { useEffect, useState } from 'react'
import { Bitcoin, Shield, Clock, Hash, Users, AlertTriangle } from 'lucide-react'
import { btcDeepDive } from '../api'

const PRIVACY_COLOR = { HIGH:'var(--green)', MEDIUM:'var(--gold)', LOW:'var(--orange)', UNKNOWN:'var(--dim)' }
const RISK_COLOR    = { HIGH:'var(--red)',   MEDIUM:'var(--gold)', LOW:'var(--green)'  }

function MetricCard({ icon:Icon, label, value, sub, color='var(--cyan)', iconColor }) {
  return (
    <div style={{ background:'rgba(0,0,0,.3)', borderRadius:8, padding:'14px', display:'flex', gap:12, alignItems:'flex-start' }}>
      <div style={{ width:36, height:36, borderRadius:8, background:`${iconColor||color}15`,
        border:`1px solid ${iconColor||color}25`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon size={15} color={iconColor||color}/>
      </div>
      <div>
        <div className="font-mono" style={{ fontSize:7, color:'var(--dim)', letterSpacing:1.5, marginBottom:4 }}>{label}</div>
        <div className="font-orbitron" style={{ fontSize:14, fontWeight:700, color, lineHeight:1 }}>{value ?? '—'}</div>
        {sub && <div className="font-mono" style={{ fontSize:8, color:'var(--dim)', marginTop:4, lineHeight:1.4 }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function BtcDeepDive({ address }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    btcDeepDive(address)
      .then(setData)
      .catch(e => setError(e?.response?.data?.detail || 'BTC analysis failed'))
      .finally(() => setLoading(false))
  }, [address])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, padding:'40px' }}>
      <div className="animate-spin-fast" style={{ width:24, height:24, border:'2px solid rgba(255,109,0,.4)',
        borderTopColor:'var(--orange)', borderRadius:'50%' }}/>
      <span className="font-mono" style={{ fontSize:10, color:'var(--dim)', letterSpacing:2 }}>
        RUNNING BTC DEEP ANALYSIS...
      </span>
    </div>
  )

  if (error) return (
    <div style={{ display:'flex', gap:10, padding:'20px', background:'rgba(255,109,0,.06)',
      border:'1px solid rgba(255,109,0,.2)', borderRadius:8, margin:'16px 0' }}>
      <AlertTriangle size={16} color="var(--orange)"/>
      <span style={{ fontSize:12, color:'var(--orange)' }}>{error}</span>
    </div>
  )

  if (!data) return null

  const { utxo, coin_age, script_type, clustering, coinjoin_txs, btc_flags } = data

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* BTC Flags banner */}
      {btc_flags?.length > 0 && (
        <div style={{ padding:'12px 16px', background:'rgba(255,109,0,.07)',
          border:'1px solid rgba(255,109,0,.25)', borderRadius:8, display:'flex', gap:12, alignItems:'center' }}>
          <AlertTriangle size={15} color="var(--orange)"/>
          <div>
            <div className="font-orbitron" style={{ fontSize:10, color:'var(--orange)', letterSpacing:2, marginBottom:4 }}>
              BTC-SPECIFIC FLAGS DETECTED
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {btc_flags.map(f => (
                <span key={f} style={{ fontFamily:'Oxanium', fontSize:8, fontWeight:700, letterSpacing:1,
                  padding:'2px 8px', borderRadius:3, color:'var(--orange)',
                  background:'rgba(255,109,0,.1)', border:'1px solid rgba(255,109,0,.25)' }}>
                  {f.replace(/_/g,' ').toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Script type + address info */}
      <div className="card" style={{ borderLeft:`3px solid ${PRIVACY_COLOR[script_type?.privacy_level]}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <Bitcoin size={14} color="var(--orange)"/>
          <span className="font-mono" style={{ fontSize:9, color:'var(--orange)', letterSpacing:2 }}>ADDRESS TYPE</span>
        </div>
        <div style={{ display:'flex', gap:20, alignItems:'center', flexWrap:'wrap' }}>
          <div>
            <div className="font-orbitron" style={{ fontSize:20, fontWeight:800, color:'var(--orange)' }}>
              {script_type?.script_type}
            </div>
            <div style={{ fontSize:12, color:'var(--text-dim)', marginTop:4 }}>{script_type?.note}</div>
          </div>
          <div style={{ padding:'8px 16px', borderRadius:8,
            background:`${PRIVACY_COLOR[script_type?.privacy_level]}15`,
            border:`1px solid ${PRIVACY_COLOR[script_type?.privacy_level]}30` }}>
            <div className="font-mono" style={{ fontSize:7, color:'var(--dim)', letterSpacing:1.5, marginBottom:4 }}>PRIVACY</div>
            <div className="font-orbitron" style={{ fontSize:14, fontWeight:700, color:PRIVACY_COLOR[script_type?.privacy_level] }}>
              {script_type?.privacy_level}
            </div>
          </div>
        </div>
      </div>

      {/* UTXO metrics */}
      <div>
        <div className="font-mono" style={{ fontSize:9, color:'var(--cyan)', letterSpacing:2, marginBottom:12 }}>
          UTXO ANALYSIS
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:10 }}>
          <MetricCard icon={Hash}    label="BALANCE (BTC)"      value={utxo?.balance}         color="var(--orange)" iconColor="var(--orange)"/>
          <MetricCard icon={Hash}    label="TOTAL RECEIVED"     value={utxo?.total_received}   color="var(--green)"/>
          <MetricCard icon={Hash}    label="TOTAL SENT"         value={utxo?.total_sent}       color="var(--red)"/>
          <MetricCard icon={Hash}    label="TRANSACTIONS"       value={utxo?.n_tx}             color="var(--cyan)"/>
          <MetricCard icon={Shield}  label="ADDRESS REUSE RISK" value={utxo?.address_reuse_risk}
            color={RISK_COLOR[utxo?.address_reuse_risk] || 'var(--dim)'} iconColor={RISK_COLOR[utxo?.address_reuse_risk]}/>
          <MetricCard icon={Hash}    label="AVG UTXO VALUE"     value={utxo?.avg_utxo_value?.toFixed(5)+' BTC'} color="var(--gold)"/>
        </div>
      </div>

      {/* Coin age */}
      <div className="card" style={{ borderLeft:`3px solid ${coin_age?.rapid_movement ? 'var(--red)' : 'var(--green)'}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
          <Clock size={14} color="var(--cyan)"/>
          <span className="font-mono" style={{ fontSize:9, color:'var(--cyan)', letterSpacing:2 }}>COIN AGE ANALYSIS</span>
          {coin_age?.rapid_movement && (
            <span style={{ marginLeft:'auto', fontFamily:'Oxanium', fontSize:8, fontWeight:700, letterSpacing:1.5,
              color:'var(--red)', background:'rgba(255,0,51,.1)', border:'1px solid rgba(255,0,51,.25)',
              padding:'3px 10px', borderRadius:4 }}>⚡ RAPID MOVEMENT</span>
          )}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
          {[
            { label:'AVG COIN AGE', value: coin_age?.avg_coin_age_days != null ? `${coin_age.avg_coin_age_days} days` : '—' },
            { label:'MIN AGE',      value: coin_age?.min_age_days != null ? `${coin_age.min_age_days} days` : '—' },
            { label:'MAX AGE',      value: coin_age?.max_age_days != null ? `${coin_age.max_age_days} days` : '—' },
            { label:'LAYERING RISK',value: coin_age?.layering_risk || '—' },
          ].map(({ label,value }) => (
            <div key={label} style={{ background:'rgba(0,0,0,.2)', borderRadius:6, padding:'10px 12px' }}>
              <div className="font-mono" style={{ fontSize:7, color:'var(--dim)', letterSpacing:1.5, marginBottom:4 }}>{label}</div>
              <div className="font-orbitron" style={{ fontSize:13, fontWeight:700,
                color: value==='HIGH'?'var(--red)':value==='MEDIUM'?'var(--gold)':value==='LOW'?'var(--green)':'white' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
        {coin_age?.rapid_movement && (
          <div style={{ marginTop:12, fontSize:12, color:'var(--text-dim)', lineHeight:1.6 }}>
            ⚠️ Coins moved within {coin_age.avg_coin_age_days} days on average — consistent with layering behavior in money laundering.
          </div>
        )}
      </div>

      {/* CoinJoin detection */}
      <div className="card">
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
          <Shield size={14} color={coinjoin_txs?.length > 0 ? 'var(--red)' : 'var(--green)'}/>
          <span className="font-mono" style={{ fontSize:9, letterSpacing:2,
            color: coinjoin_txs?.length > 0 ? 'var(--red)' : 'var(--green)' }}>
            COINJOIN DETECTION
          </span>
          <span style={{ marginLeft:'auto', fontFamily:'Oxanium', fontSize:9, fontWeight:700, letterSpacing:2,
            padding:'3px 10px', borderRadius:4,
            color: coinjoin_txs?.length > 0 ? 'var(--red)' : 'var(--green)',
            background: coinjoin_txs?.length > 0 ? 'rgba(255,0,51,.1)' : 'rgba(57,255,20,.1)',
            border: `1px solid ${coinjoin_txs?.length > 0 ? 'rgba(255,0,51,.25)' : 'rgba(57,255,20,.25)'}` }}>
            {coinjoin_txs?.length > 0 ? `${coinjoin_txs.length} FOUND` : 'CLEAN'}
          </span>
        </div>
        {coinjoin_txs?.length > 0 ? (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {coinjoin_txs.map((cj,i) => (
              <div key={i} style={{ padding:'10px 12px', background:'rgba(255,0,51,.05)',
                border:'1px solid rgba(255,0,51,.2)', borderRadius:6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span className="font-mono" style={{ fontSize:9, color:'var(--red)' }}>
                    {cj.tx_hash?.slice(0,20)}...
                  </span>
                  <span style={{ fontFamily:'Oxanium', fontSize:8, fontWeight:700, color:'var(--red)',
                    background:'rgba(255,0,51,.1)', border:'1px solid rgba(255,0,51,.2)',
                    padding:'2px 8px', borderRadius:3, letterSpacing:1 }}>
                    {cj.confidence}% CONFIDENCE
                  </span>
                </div>
                <div style={{ fontSize:11, color:'var(--text-dim)' }}>{cj.reason}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize:12, color:'var(--text-dim)' }}>
            ✓ No CoinJoin patterns detected in recent transactions. Equal-output and multi-input heuristics applied.
          </div>
        )}
      </div>

      {/* Address clustering */}
      <div className="card">
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
          <Users size={14} color="var(--purple)"/>
          <span className="font-mono" style={{ fontSize:9, color:'var(--purple)', letterSpacing:2 }}>ADDRESS CLUSTERING</span>
          {clustering?.likely_same_wallet && (
            <span style={{ marginLeft:'auto', fontFamily:'Oxanium', fontSize:8, fontWeight:700, letterSpacing:1.5,
              color:'var(--orange)', background:'rgba(255,109,0,.1)', border:'1px solid rgba(255,109,0,.25)',
              padding:'3px 10px', borderRadius:4 }}>
              {clustering.cluster_size_hint} LINKED ADDRESSES
            </span>
          )}
        </div>
        <div style={{ fontSize:12, color:'var(--text-dim)', marginBottom:clustering?.co_spent_addresses?.length ? 12 : 0 }}>
          {clustering?.note}
        </div>
        {clustering?.co_spent_addresses?.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {clustering.co_spent_addresses.map((addr,i) => (
              <div key={i} className="font-mono" style={{ fontSize:9, color:'white',
                padding:'5px 10px', background:'rgba(124,77,255,.05)',
                border:'1px solid rgba(124,77,255,.15)', borderRadius:4, wordBreak:'break-all' }}>
                {addr}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
