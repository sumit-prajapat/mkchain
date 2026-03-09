import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

const NODE_COLORS = {
  mixer:    0xff0033,
  darkweb:  0x7c4dff,
  exchange: 0xffc400,
  bridge:   0xff6d00,
  wallet:   0x00e5ff,
}
const NODE_EMISSIVE = {
  mixer:    0x440008,
  darkweb:  0x1a0a44,
  exchange: 0x332800,
  bridge:   0x331a00,
  wallet:   0x002233,
}

export default function Graph3D({ graphData, height = 540 }) {
  const mountRef   = useRef(null)
  const sceneRef   = useRef(null)
  const [selected, setSelected] = useState(null)
  const [hovered,  setHovered]  = useState(null)

  useEffect(() => {
    if (!graphData?.nodes?.length) return
    const mount = mountRef.current
    const W = mount.clientWidth, H = height

    /* ── Renderer ─────────────────────────────────────── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x020812, 1)
    mount.appendChild(renderer.domElement)

    /* ── Scene & Camera ───────────────────────────────── */
    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 2000)
    camera.position.set(0, 0, 380)
    sceneRef.current = { scene, camera, renderer }

    /* ── Lights ───────────────────────────────────────── */
    scene.add(new THREE.AmbientLight(0x112233, 2))
    const dirLight = new THREE.DirectionalLight(0x00e5ff, 1.5)
    dirLight.position.set(100, 200, 100)
    scene.add(dirLight)
    const pointRed = new THREE.PointLight(0xff0033, 2, 300)
    pointRed.position.set(-150, 0, 0)
    scene.add(pointRed)
    const pointCyan = new THREE.PointLight(0x00e5ff, 1.5, 300)
    pointCyan.position.set(150, 100, 100)
    scene.add(pointCyan)

    /* ── Background particles ─────────────────────────── */
    const starGeo = new THREE.BufferGeometry()
    const starPos = new Float32Array(1500 * 3)
    for (let i = 0; i < 1500 * 3; i++) starPos[i] = (Math.random() - 0.5) * 1400
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const starMat = new THREE.PointsMaterial({ color: 0x1a3a6a, size: 0.8, transparent: true, opacity: 0.6 })
    scene.add(new THREE.Points(starGeo, starMat))

    /* ── Build nodes & edges ──────────────────────────── */
    const nodes      = graphData.nodes.map(n => ({ ...n }))
    const edges      = graphData.edges.map(e => ({ ...e }))
    const nodeMeshes = []
    const nodeMap    = {}

    // Spread nodes in 3D space using existing x/y + z from backend
    nodes.forEach(n => {
      const spread = n.is_root ? 0 : (n.hop || 1) * 130
      if (!n.z) n.z = (Math.random() - 0.5) * spread * 0.6
      n._3x = n.is_root ? 0 : (n.x - 450) * 0.7
      n._3y = n.is_root ? 0 : -(n.y - 280) * 0.7
      n._3z = n.z || 0
    })

    nodes.forEach(n => {
      const color   = NODE_COLORS[n.node_type]  || NODE_COLORS.wallet
      const emissive= NODE_EMISSIVE[n.node_type] || NODE_EMISSIVE.wallet
      const radius  = n.is_root ? 14 : n.node_type === 'mixer' || n.node_type === 'darkweb' ? 9 : 6

      // Node mesh
      const geo = n.node_type === 'mixer'
        ? new THREE.OctahedronGeometry(radius, 0)
        : n.node_type === 'darkweb'
          ? new THREE.TetrahedronGeometry(radius, 0)
          : n.is_root
            ? new THREE.IcosahedronGeometry(radius, 1)
            : new THREE.SphereGeometry(radius, 12, 8)

      const mat = new THREE.MeshStandardMaterial({
        color, emissive, emissiveIntensity: 0.4,
        metalness: 0.7, roughness: 0.2,
        transparent: true, opacity: 0.92,
      })

      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(n._3x, n._3y, n._3z)
      mesh.userData = { node: n }
      scene.add(mesh)
      nodeMeshes.push(mesh)
      nodeMap[n.id] = mesh

      // Glow halo for special nodes
      if (n.node_type === 'mixer' || n.node_type === 'darkweb' || n.is_root) {
        const haloGeo = new THREE.SphereGeometry(radius * 2.5, 12, 8)
        const haloMat = new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.06,
          side: THREE.BackSide,
        })
        const halo = new THREE.Mesh(haloGeo, haloMat)
        halo.position.copy(mesh.position)
        scene.add(halo)
        mesh.userData.halo = halo
      }

      // Outer ring for root
      if (n.is_root) {
        const ringGeo = new THREE.TorusGeometry(radius + 8, 0.8, 8, 32)
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.5 })
        const ring = new THREE.Mesh(ringGeo, ringMat)
        ring.position.copy(mesh.position)
        ring.rotation.x = Math.PI / 4
        scene.add(ring)
        mesh.userData.ring = ring
      }
    })

    /* ── Edges ────────────────────────────────────────── */
    edges.forEach(e => {
      const srcNode = nodes.find(n => n.id === (e.source?.id || e.source))
      const tgtNode = nodes.find(n => n.id === (e.target?.id || e.target))
      if (!srcNode || !tgtNode) return

      const src = new THREE.Vector3(srcNode._3x, srcNode._3y, srcNode._3z)
      const tgt = new THREE.Vector3(tgtNode._3x, tgtNode._3y, tgtNode._3z)

      // Curved tube edge
      const mid = new THREE.Vector3().addVectors(src, tgt).multiplyScalar(0.5)
      mid.z += (Math.random() - 0.5) * 40
      const curve = new THREE.QuadraticBezierCurve3(src, mid, tgt)
      const tubeGeo = new THREE.TubeGeometry(curve, 12, 0.4, 4, false)
      const isMixer = e.edge_type === 'mixer'
      const tubeMat = new THREE.MeshBasicMaterial({
        color: isMixer ? 0xff003322 : 0x1a407088,
        transparent: true,
        opacity: isMixer ? 0.5 : 0.25,
      })
      scene.add(new THREE.Mesh(tubeGeo, tubeMat))

      // Arrow at target
      const dir = new THREE.Vector3().subVectors(tgt, src).normalize()
      const arrowGeo = new THREE.ConeGeometry(1.5, 5, 6)
      const arrowMat = new THREE.MeshBasicMaterial({
        color: isMixer ? 0xff0033 : 0x1a4070,
        transparent: true, opacity: isMixer ? 0.7 : 0.4,
      })
      const arrow = new THREE.Mesh(arrowGeo, arrowMat)
      arrow.position.copy(tgt).addScaledVector(dir, -12)
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      scene.add(arrow)
    })

    /* ── Orbit controls (manual) ──────────────────────── */
    let isDragging = false, lastMx = 0, lastMy = 0
    let rotX = 0, rotY = 0, autoRotate = true
    let zoomDist = 380

    const onDown = e => {
      isDragging = true; autoRotate = false
      lastMx = e.clientX || e.touches?.[0]?.clientX || 0
      lastMy = e.clientY || e.touches?.[0]?.clientY || 0
    }
    const onUp = () => { isDragging = false }
    const onMove = e => {
      if (!isDragging) return
      const x = e.clientX || e.touches?.[0]?.clientX || 0
      const y = e.clientY || e.touches?.[0]?.clientY || 0
      rotY += (x - lastMx) * 0.008
      rotX += (y - lastMy) * 0.008
      rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX))
      lastMx = x; lastMy = y
    }
    const onWheel = e => {
      zoomDist = Math.max(80, Math.min(700, zoomDist + e.deltaY * 0.5))
    }

    renderer.domElement.addEventListener('mousedown', onDown)
    renderer.domElement.addEventListener('touchstart', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true })

    /* ── Raycaster for hover ──────────────────────────── */
    const raycaster = new THREE.Raycaster()
    const mouse     = new THREE.Vector2()
    let hoveredMesh = null

    const onMouseMove = e => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / W) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / H) * 2 + 1
    }
    const onClick = () => {
      if (hoveredMesh) setSelected(hoveredMesh.userData.node)
    }
    renderer.domElement.addEventListener('mousemove', onMouseMove)
    renderer.domElement.addEventListener('click', onClick)

    /* ── Animation loop ───────────────────────────────── */
    let frame = 0
    let animId

    const animate = () => {
      animId = requestAnimationFrame(animate)
      frame++

      // Auto rotate
      if (autoRotate) rotY += 0.003

      // Camera orbit
      camera.position.x = zoomDist * Math.sin(rotY) * Math.cos(rotX)
      camera.position.y = zoomDist * Math.sin(rotX)
      camera.position.z = zoomDist * Math.cos(rotY) * Math.cos(rotX)
      camera.lookAt(0, 0, 0)

      // Pulse nodes
      nodeMeshes.forEach((mesh, i) => {
        const n = mesh.userData.node
        const pulse = Math.sin(frame * 0.04 + i * 0.3) * 0.08 + 0.92
        mesh.material.emissiveIntensity = 0.3 + pulse * 0.3

        if (n.is_root) {
          mesh.rotation.y += 0.012
          if (mesh.userData.ring) {
            mesh.userData.ring.rotation.z += 0.015
            mesh.userData.ring.rotation.x = Math.PI / 4 + Math.sin(frame * 0.02) * 0.2
          }
        }
        if (n.node_type === 'mixer') {
          mesh.rotation.y += 0.02
          mesh.rotation.z += 0.01
        }
        if (mesh.userData.halo) {
          mesh.userData.halo.material.opacity = 0.04 + Math.abs(Math.sin(frame * 0.03 + i)) * 0.06
        }
      })

      // Raycasting
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(nodeMeshes)
      if (hits.length > 0) {
        const h = hits[0].object
        if (hoveredMesh !== h) {
          if (hoveredMesh) hoveredMesh.scale.setScalar(1)
          hoveredMesh = h
          h.scale.setScalar(1.25)
          renderer.domElement.style.cursor = 'pointer'
          setHovered(h.userData.node)
        }
      } else {
        if (hoveredMesh) {
          hoveredMesh.scale.setScalar(1)
          hoveredMesh = null
          renderer.domElement.style.cursor = 'grab'
          setHovered(null)
        }
      }

      renderer.render(scene, camera)
    }
    animate()

    /* ── Resize ───────────────────────────────────────── */
    const onResize = () => {
      const w = mount.clientWidth
      camera.aspect = w / H
      camera.updateProjectionMatrix()
      renderer.setSize(w, H)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchend', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('mousedown', onDown)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('wheel', onWheel)
      mount.removeChild(renderer.domElement)
      renderer.dispose()
    }
  }, [graphData, height])

  const NODE_HEX = { mixer:'#ff0033', darkweb:'#7c4dff', exchange:'#ffc400', wallet:'#00e5ff', bridge:'#ff6d00' }

  return (
    <div style={{ position:'relative' }}>

      {/* Shapes legend */}
      <div style={{ position:'absolute', top:14, left:14, zIndex:10, display:'flex', flexWrap:'wrap', gap:8 }}>
        {[['Wallet','⬤','#00e5ff'],['Mixer','◆','#ff0033'],['Darkweb','▲','#7c4dff'],['Exchange','⬤','#ffc400']].map(([t,s,c]) => (
          <div key={t} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(2,8,18,.85)', border:'1px solid rgba(255,255,255,.06)', borderRadius:4, padding:'4px 10px' }}>
            <span style={{ color:c, fontSize:9 }}>{s}</span>
            <span style={{ fontFamily:'Space Mono', fontSize:9, color:'rgba(184,212,240,.5)', letterSpacing:.5 }}>{t}</span>
          </div>
        ))}
      </div>

      {/* Controls hint */}
      <div style={{ position:'absolute', top:14, right:14, zIndex:10, fontFamily:'Space Mono', fontSize:8, color:'rgba(30,58,90,.9)', background:'rgba(2,8,18,.85)', border:'1px solid rgba(255,255,255,.05)', borderRadius:4, padding:'4px 10px', letterSpacing:1 }}>
        DRAG ROTATE · SCROLL ZOOM · CLICK NODE
      </div>

      {/* Auto-rotate badge */}
      <div style={{ position:'absolute', bottom:14, left:14, zIndex:10, fontFamily:'Space Mono', fontSize:8, color:'rgba(0,229,255,.5)', background:'rgba(2,8,18,.85)', border:'1px solid rgba(0,229,255,.1)', borderRadius:4, padding:'4px 10px', letterSpacing:1 }}>
        3D — THREE.JS
      </div>

      {/* Mount */}
      <div
        ref={mountRef}
        style={{ width:'100%', height, borderRadius:12, border:'1px solid var(--border)', overflow:'hidden', cursor:'grab' }}
      />

      {/* Hover tooltip */}
      {hovered && (
        <div style={{
          position:'absolute', bottom:50, right:14, width:250, zIndex:10,
          background:'rgba(11,29,53,.97)', border:`1px solid ${NODE_HEX[hovered.node_type]}44`,
          borderRadius:10, padding:16, backdropFilter:'blur(12px)',
          boxShadow:`0 0 30px ${NODE_HEX[hovered.node_type]}18`,
          pointerEvents:'none',
        }}>
          <div style={{ fontFamily:'Oxanium', fontSize:10, fontWeight:700, color:NODE_HEX[hovered.node_type], letterSpacing:2, marginBottom:8 }}>{hovered.node_type.toUpperCase()}</div>
          <div style={{ fontFamily:'Space Mono', fontSize:10, color:'var(--text)', wordBreak:'break-all', marginBottom:10, lineHeight:1.5 }}>{hovered.id}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[['Risk Score', hovered.risk_score], ['Hop', hovered.hop], ['Txns', hovered.tx_count || 0], ['Chain', (hovered.chain||'eth').toUpperCase()]].map(([k,v]) => (
              <div key={k} style={{ background:'rgba(0,0,0,.3)', borderRadius:6, padding:'8px 10px' }}>
                <div style={{ fontFamily:'Space Mono', fontSize:8, color:'var(--muted)', letterSpacing:1, marginBottom:3 }}>{k}</div>
                <div style={{ fontFamily:'Oxanium', fontSize:13, fontWeight:700, color:'white' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected node panel */}
      {selected && !hovered && (
        <div style={{
          position:'absolute', bottom:50, right:14, width:260, zIndex:10,
          background:'rgba(11,29,53,.97)', border:`1px solid ${NODE_HEX[selected.node_type]}44`,
          borderRadius:10, padding:16,
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontFamily:'Oxanium', fontSize:10, fontWeight:700, color:NODE_HEX[selected.node_type], letterSpacing:2 }}>
              {selected.node_type.toUpperCase()} — SELECTED
            </span>
            <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
          </div>
          <div style={{ fontFamily:'Space Mono', fontSize:10, color:'var(--text)', wordBreak:'break-all', marginBottom:10 }}>{selected.id}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[['Risk Score',selected.risk_score],['Hop',selected.hop],['Txns',selected.tx_count||0],['Chain',(selected.chain||'eth').toUpperCase()]].map(([k,v]) => (
              <div key={k} style={{ background:'rgba(0,0,0,.3)', borderRadius:6, padding:'8px 10px' }}>
                <div style={{ fontFamily:'Space Mono', fontSize:8, color:'var(--muted)', letterSpacing:1, marginBottom:3 }}>{k}</div>
                <div style={{ fontFamily:'Oxanium', fontSize:13, fontWeight:700, color:'white' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
