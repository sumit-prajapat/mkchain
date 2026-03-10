import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Shield, GitBranch, Brain, FileText, ChevronRight, Zap, Globe, Eye } from 'lucide-react'
import { getOsintStats } from '../api'

function ParticleCanvas() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animId
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)
    const NODES = 55
    const nodes = Array.from({ length:NODES }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random()-.5)*.35, vy: (Math.random()-.5)*.35,
      r: Math.random()*2+1,
      type: Math.random()<.07?'mixer':Math.random()<.14?'exchange':'wallet',
      pulse: Math.random()*Math.PI*2,
    }))
    const COLORS = { mixer:'#ff0040', exchange:'#ffd700', wallet:'#00e5ff' }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i=0; i<nodes.length; i++) {
        for (let j=i+1; j<nodes.length; j++) {
          const dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y
          const dist=Math.sqrt(dx*dx+dy*dy)
          if (dist<120) {
            ctx.beginPath(); ctx.moveTo(nodes[i].x,nodes[i].y); ctx.lineTo(nodes[j].x,nodes[j].y)
            ctx.strokeStyle=nodes[i].type==='mixer'||nodes[j].type==='mixer'
              ?`rgba(255,0,64,${(1-dist/120)*.15})`:`rgba(0,229,255,${(1-dist/120)*.12})`
            ctx.lineWidth=.5; ctx.stroke()
          }
        }
      }
      nodes.forEach(n => {
        n.pulse+=.02
        const glow=Math.sin(n.pulse)*.3+.7
        if (n.type==='mixer') {
          const grad=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*9)
          grad.addColorStop(0,`rgba(255,0,64,${.12*glow})`); grad.addColorStop(1,'transparent')
          ctx.beginPath(); ctx.arc(n.x,n.y,n.r*9,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill()
        }
        ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2)
        ctx.fillStyle=COLORS[n.type]; ctx.globalAlpha=.65*glow; ctx.fill(); ctx.globalAlpha=1
        n.x+=n.vx; n.y+=n.vy
        if (n.x<0||n.x>canvas.width) n.vx*=-1
        if (n.y<0||n.y>canvas.height) n.vy*=-1
      })
      animId=requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize',resize) }
  }, [])
  return <canvas ref={canvasRef} style={{ position:'absolute',inset:0,width:'100%',height:'100%',opacity:.55,pointerEvents:'none',zIndex:0 }}/>
}

function TypedText({ texts }) {
  const [idx,setIdx]=useState(0)
  const [displayed,setDisplayed]=useState('')
  const [deleting,setDeleting]=useState(false)
  useEffect(() => {
    const target=texts[idx]; let t
    if (!deleting&&displayed.length<target.length) t=setTimeout(()=>setDisplayed(target.slice(0,displayed.length+1)),55)
    else if (!deleting&&displayed.length===target.length) t=setTimeout(()=>setDeleting(true),2200)
    else if (deleting&&displayed.length>0) t=setTimeout(()=>setDisplayed(displayed.slice(0,-1)),25)
    else if (deleting&&displayed.length===0) { setDeleting(false); setIdx((idx+1)%texts.length) }
    return ()=>clearTimeout(t)
  },[displayed,deleting,idx,texts])
  return (
    <span style={{ color:'var(--cyan)' }}>
      {displayed}<span className="animate-blink" style={{ color:'var(--cyan)',marginLeft:2 }}>█</span>
    </span>
  )
}

const FEATURES = [
  { icon:GitBranch, title:'Multi-Chain Tracing',  desc:'Trace ETH, BTC & Polygon graphs up to 3 hops deep with BFS traversal.',   color:'var(--cyan)' },
  { icon:Brain,     title:'ML Risk Scoring',      desc:'Random Forest model scores wallets 0–100 across 21 behavioral features.', color:'var(--green)' },
  { icon:Eye,       title:'Mixer Detection',      desc:'Detects Tornado Cash, tumblers, peel chains & bridge hops in real time.', color:'var(--purple)' },
  { icon:Globe,     title:'OFAC / Dark Web DB',   desc:'Checks Lazarus Group, Hydra, WannaCry, Silk Road & 70+ entities.',       color:'var(--red)' },
  { icon:Zap,       title:'Explainable AI',        desc:'Every score ships with plain-English factor analysis from Groq Llama.',   color:'var(--gold)' },
  { icon:FileText,  title:'Forensics PDF',         desc:'One-click 7-section professional PDF report for compliance & legal use.', color:'var(--orange)' },
]

const SAMPLES = [
  { address:'0x7f367cc41522ce07553e823bf3be79a889debe1b', chain:'eth', label:'Hydra Darknet Market',       risk:'CRITICAL', tag:'OFAC Sanctioned' },
  { address:'0x098b716b8aaf21512996dc57eb0615e2383e2f96', chain:'eth', label:'Lazarus Group — DPRK APT', risk:'CRITICAL', tag:'Nation State' },
  { address:'0x722122df12d4e14e13ac3b6895a86e84145b6967', chain:'eth', label:'Tornado Cash Contract',    risk:'CRITICAL', tag:'Mixer' },
  { address:'0x28c6c06298d514db089934071355e5743bf21d60', chain:'eth', label:'Binance Exchange Wallet',  risk:'LOW',      tag:'Exchange' },
]

const riskColor = { CRITICAL:'var(--red)', HIGH:'var(--orange)', MEDIUM:'var(--gold)', LOW:'var(--green)' }

export default function Home() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    getOsintStats().then(setStats).catch(()=>{})
  }, [])

  return (
    <div style={{ position:'relative' }}>

      {/* ── HERO ── */}
      <div style={{ position:'relative', minHeight:'88vh', display:'flex', alignItems:'center' }}>
        <ParticleCanvas/>
        <div style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
          width:900,height:900,borderRadius:'50%',pointerEvents:'none',zIndex:0,
          background:'radial-gradient(circle, rgba(0,229,255,.05) 0%, transparent 65%)' }}/>

        <div style={{ position:'relative',zIndex:2,maxWidth:1200,margin:'0 auto',padding:'80px 24px',width:'100%' }}>

          <div className="animate-fade-up" style={{ marginBottom:28,display:'inline-flex',alignItems:'center',
            gap:10,padding:'7px 16px',border:'1px solid rgba(0,229,255,.2)',borderRadius:100,background:'rgba(0,229,255,.04)' }}>
            <div className="live-dot"/>
            <span className="font-mono" style={{ fontSize:9,color:'var(--cyan)',letterSpacing:2 }}>
              LIVE · OPEN-SOURCE CHAINALYSIS ALTERNATIVE
            </span>
          </div>

          <h1 className="animate-fade-up delay-2 font-orbitron"
            style={{ fontSize:'clamp(30px,5vw,70px)',fontWeight:900,lineHeight:1.05,letterSpacing:-1,marginBottom:20,color:'white' }}>
            BLOCKCHAIN<br/>
            <TypedText texts={['FORENSICS','INTELLIGENCE','ANALYTICS','TRACING']}/>
          </h1>

          <p className="animate-fade-up delay-3"
            style={{ fontSize:17,color:'var(--text-dim)',maxWidth:560,lineHeight:1.75,marginBottom:36 }}>
            Trace crypto transactions, detect mixers, identify dark web connections,
            and score wallet risk with machine learning. Free. Open source.
          </p>

          <div className="animate-fade-up delay-4" style={{ display:'flex',gap:14,flexWrap:'wrap',marginBottom:56 }}>
            <Link to="/analyze" className="btn-primary" style={{ fontSize:11,padding:'14px 32px' }}>
              <Search size={15}/> ANALYZE WALLET
            </Link>
            <Link to="/osint" className="btn-ghost" style={{ fontSize:11,padding:'14px 24px',borderColor:'rgba(255,0,51,.3)',color:'var(--red)' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--red)';e.currentTarget.style.color='var(--red)'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,0,51,.3)';e.currentTarget.style.color='var(--red)'}}>
              <Shield size={14}/> THREAT DATABASE
            </Link>
            <Link to="/history" className="btn-ghost" style={{ fontSize:11,padding:'14px 22px' }}>
              VIEW HISTORY <ChevronRight size={13}/>
            </Link>
          </div>

          {/* Terminal */}
          <div className="animate-fade-up delay-5" style={{ maxWidth:520 }}>
            <div style={{ background:'rgba(0,0,0,.55)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden' }}>
              <div style={{ background:'rgba(0,0,0,.4)',padding:'8px 14px',display:'flex',alignItems:'center',gap:8 }}>
                {['#ff5f57','#febc2e','#28c840'].map((c,i) => <div key={i} style={{ width:10,height:10,borderRadius:'50%',background:c }}/>)}
                <span className="font-mono" style={{ fontSize:9,color:'var(--dim)',marginLeft:8,letterSpacing:1 }}>mkchain — forensics engine v1.0</span>
              </div>
              <div style={{ padding:'16px 20px' }}>
                {[
                  ['$','mkchain analyze 0x098b716b8aaf...','var(--cyan)'],
                  ['›','Fetching 100 ETH transactions... ✓','var(--green)'],
                  ['›','Building graph: 356 nodes, 401 edges','var(--text-dim)'],
                  ['›','[!] OSINT MATCH: Lazarus Group (DPRK)','var(--red)'],
                  ['›','ML Risk Score: 87.4 / 100  [HIGH]','var(--orange)'],
                  ['›','PDF report generated → ready','var(--green)'],
                ].map(([prefix,text,color],i) => (
                  <div key={i} style={{ marginBottom:5,fontFamily:'Space Mono',fontSize:10,display:'flex',gap:10 }}>
                    <span style={{ color:'var(--cyan)',minWidth:10 }}>{prefix}</span>
                    <span style={{ color }}>{text}</span>
                  </div>
                ))}
                <div style={{ marginTop:4,fontFamily:'Space Mono',fontSize:10,display:'flex',gap:10 }}>
                  <span style={{ color:'var(--cyan)' }}>$</span>
                  <span className="animate-blink" style={{ color:'var(--cyan)' }}>█</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth:1200,margin:'0 auto',padding:'0 24px 80px' }}>

        {/* Stats */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:14,marginBottom:80 }}>
          {[
            { value:'3',                                              label:'Chains',        sub:'ETH · BTC · MATIC',    color:'var(--cyan)'   },
            { value:'21',                                             label:'ML Features',   sub:'Random Forest',         color:'var(--green)'  },
            { value: stats ? `${stats.total_addresses}+` : '70+',    label:'Bad Addresses', sub:'OFAC + Darkweb',        color:'var(--red)'    },
            { value: stats ? String(stats.total_entities) : '13',    label:'Threat Actors', sub:'APT / Ransomware',      color:'var(--orange)' },
            { value:'9',                                              label:'Pattern Detectors', sub:'Mixer · Peel · Struct', color:'var(--gold)'  },
          ].map(({ value,label,sub,color },i) => (
            <div key={label} className={`card card-glow animate-fade-up delay-${i+1}`} style={{ textAlign:'center',padding:'22px 14px' }}>
              <div className="font-orbitron" style={{ fontSize:32,fontWeight:800,color,letterSpacing:2,lineHeight:1 }}>{value}</div>
              <div style={{ color:'white',fontSize:12,fontWeight:600,marginTop:8 }}>{label}</div>
              <div className="font-mono" style={{ color:'var(--dim)',fontSize:9,marginTop:4,letterSpacing:1 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div style={{ marginBottom:80 }}>
          <div className="animate-fade-up" style={{ marginBottom:36 }}>
            <div className="font-mono" style={{ color:'var(--cyan)',fontSize:11,letterSpacing:3,marginBottom:8 }}>// CAPABILITIES</div>
            <h2 className="font-orbitron" style={{ fontSize:26,fontWeight:700,color:'white',letterSpacing:1 }}>What MKChain Detects</h2>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14 }}>
            {FEATURES.map(({ icon:Icon,title,desc,color },i) => (
              <div key={title} className={`card animate-fade-up delay-${i+1}`}
                style={{ transition:'all .3s',cursor:'default' }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=color+'44'; e.currentTarget.style.boxShadow=`0 0 30px ${color}10` }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor=''; e.currentTarget.style.boxShadow='' }}>
                <div style={{ width:40,height:40,borderRadius:10,background:color+'14',border:`1px solid ${color}28`,
                  display:'flex',alignItems:'center',justifyContent:'center',marginBottom:14 }}>
                  <Icon size={17} color={color}/>
                </div>
                <h3 className="font-orbitron" style={{ fontSize:11,fontWeight:600,color:'white',letterSpacing:1,marginBottom:8 }}>{title}</h3>
                <p style={{ fontSize:12,color:'var(--text-dim)',lineHeight:1.65 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sample wallets */}
        <div>
          <div className="animate-fade-up" style={{ display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:24 }}>
            <div>
              <div className="font-mono" style={{ color:'var(--cyan)',fontSize:11,letterSpacing:3,marginBottom:8 }}>// KNOWN CASES</div>
              <h2 className="font-orbitron" style={{ fontSize:26,fontWeight:700,color:'white',letterSpacing:1 }}>Try These Wallets</h2>
            </div>
            <Link to="/osint" className="btn-ghost" style={{ fontSize:9,padding:'8px 16px',letterSpacing:1.5 }}>
              VIEW ALL {stats?stats.total_addresses+'+':'70+'} ADDRESSES <ChevronRight size={11}/>
            </Link>
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
            {SAMPLES.map((w,i) => (
              <Link key={w.address} to={`/analyze?address=${w.address}&chain=${w.chain}`}
                className={`card animate-fade-up delay-${i+1}`}
                style={{ textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,transition:'all .25s' }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=(riskColor[w.risk]||'var(--cyan)')+'40'; e.currentTarget.style.transform='translateX(4px)' }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor=''; e.currentTarget.style.transform='' }}>
                <div style={{ display:'flex',alignItems:'center',gap:14,minWidth:0 }}>
                  <span className={`font-orbitron risk-${w.risk.toLowerCase()}`}
                    style={{ fontSize:8,fontWeight:700,padding:'4px 9px',borderRadius:4,letterSpacing:1.5,whiteSpace:'nowrap' }}>
                    {w.risk}
                  </span>
                  <div style={{ minWidth:0 }}>
                    <div style={{ color:'white',fontSize:13,fontWeight:600,marginBottom:3 }}>
                      {w.label}
                      <span className="font-mono" style={{ fontSize:8,color:'var(--dim)',marginLeft:10,letterSpacing:1 }}>
                        [{w.tag}]
                      </span>
                    </div>
                    <div className="font-mono" style={{ color:'var(--dim)',fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                      {w.address}
                    </div>
                  </div>
                </div>
                <ChevronRight size={15} color="var(--dim)" style={{ flexShrink:0 }}/>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
