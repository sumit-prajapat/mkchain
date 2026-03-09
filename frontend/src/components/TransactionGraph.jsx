import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

const NODE_COLOR = { mixer: '#ff0040', darkweb: '#8b5cf6', exchange: '#ffd700', bridge: '#ff6b00', wallet: '#00f5ff' }
const EDGE_COLOR  = { mixer: '#ff004066', exchange: '#ffd70044', normal: '#1a3a6a' }

export default function TransactionGraph({ graphData, height = 540 }) {
  const svgRef     = useRef(null)
  const tooltipRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [stats, setStats]       = useState({})

  useEffect(() => {
    if (!graphData?.nodes?.length) return

    const nodes = graphData.nodes.map(n => ({ ...n }))
    const edges = graphData.edges.map(e => ({ ...e }))
    const W = svgRef.current?.parentElement?.offsetWidth || 900

    setStats(graphData.stats || {})

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', height)

    // Background
    svg.append('rect').attr('width', W).attr('height', height).attr('fill', 'rgba(3,6,16,0.6)')

    const g = svg.append('g')

    // Zoom
    svg.call(d3.zoom().scaleExtent([0.15, 5]).on('zoom', e => g.attr('transform', e.transform)))

    // Defs
    const defs = svg.append('defs')
    Object.entries(EDGE_COLOR).forEach(([type, color]) => {
      defs.append('marker').attr('id', `arr-${type}`)
        .attr('viewBox','0 -5 10 10').attr('refX',20).attr('refY',0)
        .attr('markerWidth',5).attr('markerHeight',5).attr('orient','auto')
        .append('path').attr('d','M0,-5L10,0L0,5').attr('fill', color.replace(/[0-9a-f]{2}$/i,''))
    })

    // Glow filter
    const filter = defs.append('filter').attr('id','glow')
    filter.append('feGaussianBlur').attr('stdDeviation','3').attr('result','blur')
    filter.append('feMerge').selectAll('feMergeNode').data(['blur','SourceGraphic']).enter().append('feMergeNode').attr('in',d => d)

    // Simulation
    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id).distance(110).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(W / 2, height / 2))
      .force('collide', d3.forceCollide(28))

    // Edges
    const link = g.append('g').selectAll('line').data(edges).enter().append('line')
      .attr('stroke', d => EDGE_COLOR[d.edge_type] || EDGE_COLOR.normal)
      .attr('stroke-width', d => Math.min(0.5 + Math.log1p(d.value || 0) * 0.3, 4))
      .attr('marker-end', d => `url(#arr-${d.edge_type || 'normal'})`)
      .attr('opacity', 0.6)

    // Node groups
    const node = g.append('g').selectAll('g').data(nodes).enter().append('g')
      .attr('cursor','pointer')
      .call(d3.drag()
        .on('start', (e,d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y })
        .on('drag',  (e,d) => { d.fx=e.x; d.fy=e.y })
        .on('end',   (e,d) => { if (!e.active) sim.alphaTarget(0); d.fx=null; d.fy=null })
      )
      .on('click', (e,d) => { e.stopPropagation(); setSelected(d) })
      .on('mouseover', (e,d) => {
        d3.select(tooltipRef.current).style('display','block')
          .style('left',(e.offsetX+18)+'px').style('top',(e.offsetY-10)+'px')
          .html(`
            <div style="font-family:Orbitron,monospace;font-size:10px;font-weight:700;color:${NODE_COLOR[d.node_type]};letter-spacing:1.5px;margin-bottom:8px">${d.node_type.toUpperCase()}</div>
            <div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:#c8d8f0;word-break:break-all;margin-bottom:8px">${d.id}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-family:IBM Plex Mono,monospace;font-size:10px">
              <span style="color:#5a7499">Risk:</span><span style="color:white;font-weight:600">${d.risk_score}</span>
              <span style="color:#5a7499">Hop:</span><span style="color:white">${d.hop}</span>
              <span style="color:#5a7499">Txns:</span><span style="color:white">${d.tx_count}</span>
            </div>`)
      })
      .on('mouseout', () => d3.select(tooltipRef.current).style('display','none'))

    // Pulse rings for mixer nodes
    node.filter(d => d.node_type === 'mixer' || d.node_type === 'darkweb')
      .append('circle').attr('r', 22).attr('fill','none')
      .attr('stroke', d => NODE_COLOR[d.node_type]).attr('stroke-width',0.5)
      .attr('opacity',0.4).attr('stroke-dasharray','3,3')

    // Root outer ring
    node.filter(d => d.is_root)
      .append('circle').attr('r', 22).attr('fill','none')
      .attr('stroke','#00f5ff').attr('stroke-width',1).attr('opacity',0.5)

    // Main circle
    node.append('circle')
      .attr('r', d => d.is_root ? 15 : d.node_type === 'mixer' || d.node_type === 'darkweb' ? 11 : 7)
      .attr('fill', d => NODE_COLOR[d.node_type] || '#00f5ff')
      .attr('fill-opacity', 0.9)
      .attr('stroke', d => NODE_COLOR[d.node_type] || '#00f5ff')
      .attr('stroke-width', d => d.is_root ? 2 : 1)
      .style('filter', d => ['mixer','darkweb'].includes(d.node_type) ? 'url(#glow)' : '')

    // Labels
    node.append('text').attr('dy', d => (d.is_root ? 15 : 10) + 10)
      .attr('text-anchor','middle').attr('fill','rgba(200,216,240,0.5)')
      .attr('font-size',9).attr('font-family','IBM Plex Mono, monospace')
      .text(d => d.label)

    // ROOT label
    node.filter(d => d.is_root)
      .append('text').attr('dy', -20).attr('text-anchor','middle')
      .attr('fill','#00f5ff').attr('font-size',10).attr('font-weight','bold')
      .attr('font-family','Orbitron, monospace').attr('letter-spacing',2).text('TARGET')

    sim.on('tick', () => {
      link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    svg.on('click', () => setSelected(null))
    return () => sim.stop()
  }, [graphData, height])

  return (
    <div style={{ position: 'relative' }}>
      {/* Legend */}
      <div style={{ position:'absolute', top:12, left:12, zIndex:10, display:'flex', flexWrap:'wrap', gap:8 }}>
        {Object.entries(NODE_COLOR).map(([type,color]) => (
          <div key={type} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(6,13,31,0.85)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:4, padding:'4px 10px' }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:color, boxShadow:`0 0 6px ${color}` }} />
            <span style={{ fontFamily:'IBM Plex Mono', fontSize:9, color:'rgba(200,216,240,0.6)', textTransform:'capitalize', letterSpacing:1 }}>{type}</span>
          </div>
        ))}
      </div>

      {/* Controls hint */}
      <div style={{ position:'absolute', top:12, right:12, zIndex:10, fontFamily:'IBM Plex Mono', fontSize:9, color:'var(--text-muted)', background:'rgba(6,13,31,0.85)', border:'1px solid var(--border)', borderRadius:4, padding:'4px 10px', letterSpacing:1 }}>
        SCROLL ZOOM · DRAG PAN · CLICK NODE
      </div>

      {/* Graph stats bar */}
      <div style={{ position:'absolute', bottom:12, left:12, zIndex:10, display:'flex', gap:16, fontFamily:'IBM Plex Mono', fontSize:9 }}>
        {[['NODES', stats.total_nodes], ['EDGES', stats.total_edges], ['MIXERS', stats.mixer_nodes], ['DENSITY', stats.density]].map(([k,v]) => (
          <div key={k} style={{ background:'rgba(6,13,31,0.85)', border:'1px solid var(--border)', borderRadius:4, padding:'4px 10px' }}>
            <span style={{ color:'var(--text-muted)', letterSpacing:1 }}>{k}: </span>
            <span style={{ color: k === 'MIXERS' && v > 0 ? 'var(--red)' : 'var(--cyan)', fontWeight:600 }}>{v ?? '—'}</span>
          </div>
        ))}
      </div>

      <svg ref={svgRef} style={{ borderRadius:12, border:'1px solid var(--border)', display:'block', width:'100%' }} />
      <div ref={tooltipRef} className="graph-tooltip" style={{ display:'none' }} />

      {/* Selected node panel */}
      {selected && (
        <div style={{
          position:'absolute', bottom:48, right:12, width:260,
          background:'rgba(10,21,48,0.95)', border:`1px solid ${NODE_COLOR[selected.node_type]}44`,
          borderRadius:10, padding:16, backdropFilter:'blur(12px)',
          boxShadow: `0 0 30px ${NODE_COLOR[selected.node_type]}22`
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontFamily:'Orbitron', fontSize:10, fontWeight:700, color:NODE_COLOR[selected.node_type], letterSpacing:2 }}>
              {selected.node_type.toUpperCase()}
            </span>
            <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', color:'var(--text-dim)', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
          </div>
          <div style={{ fontFamily:'IBM Plex Mono', fontSize:10, color:'var(--text-dim)', wordBreak:'break-all', marginBottom:12, lineHeight:1.6 }}>{selected.id}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[['Risk Score', selected.risk_score], ['Hop Distance', selected.hop], ['Transactions', selected.tx_count || 0], ['Chain', (selected.chain || '—').toUpperCase()]].map(([k,v]) => (
              <div key={k} style={{ background:'rgba(0,0,0,0.3)', borderRadius:6, padding:8 }}>
                <div style={{ fontFamily:'IBM Plex Mono', fontSize:9, color:'var(--text-muted)', letterSpacing:1, marginBottom:3 }}>{k}</div>
                <div style={{ fontFamily:'Orbitron', fontSize:13, fontWeight:700, color:'white' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
