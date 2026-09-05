import { useEffect, useRef } from "react";
import { EmptyState } from "@/components/states";
import { GraphLegend, nodeColor } from "@/components/GraphLegend";
import type { GraphEdge, GraphNode } from "@/lib/types";

/** Three.js force-free spherical layout: sphere nodes, cylinder edges, orbit controls. */
export function TransactionGraph3D({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !nodes?.length) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed || !mountRef.current) return;

      const width = mount.clientWidth || 800;
      const height = 460;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#0a0f1e");

      const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000);
      camera.position.set(0, 0, 190);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      mount.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;

      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const dir = new THREE.DirectionalLight(0xffffff, 1.2);
      dir.position.set(60, 80, 120);
      scene.add(dir);

      const positions = new Map<string, InstanceType<typeof THREE.Vector3>>();
      const count = nodes.length;
      nodes.forEach((n, i) => {
        const id = n.id ?? n.address ?? String(i);
        if ((n.type ?? "").toLowerCase() === "root") {
          positions.set(id, new THREE.Vector3(0, 0, 0));
          return;
        }
        // Fibonacci sphere for even distribution
        const k = i + 0.5;
        const phi = Math.acos(1 - (2 * k) / count);
        const theta = Math.PI * (1 + Math.sqrt(5)) * k;
        const r = 70 + (i % 3) * 12;
        positions.set(
          id,
          new THREE.Vector3(r * Math.cos(theta) * Math.sin(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(phi)),
        );
      });

      nodes.forEach((n, i) => {
        const id = n.id ?? n.address ?? String(i);
        const isRoot = (n.type ?? "").toLowerCase() === "root";
        const geo = new THREE.SphereGeometry(isRoot ? 8 : 4, 24, 18);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(nodeColor(n.type)),
          emissive: new THREE.Color(nodeColor(n.type)),
          emissiveIntensity: isRoot ? 0.55 : 0.28,
          roughness: 0.45,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(positions.get(id)!);
        scene.add(mesh);
      });

      (edges ?? []).forEach((e) => {
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        if (!a || !b) return;
        const dirVec = new THREE.Vector3().subVectors(b, a);
        const len = dirVec.length();
        if (len < 0.01) return;
        const geo = new THREE.CylinderGeometry(0.5, 0.5, len, 6);
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#2f3b55") });
        const cyl = new THREE.Mesh(geo, mat);
        cyl.position.copy(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
        cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec.clone().normalize());
        scene.add(cyl);
      });

      let frame = 0;
      const animate = () => {
        frame = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      const onResize = () => {
        const w = mount.clientWidth || width;
        camera.aspect = w / height;
        camera.updateProjectionMatrix();
        renderer.setSize(w, height);
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", onResize);
        controls.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [nodes, edges]);

  if (!nodes?.length) {
    return <EmptyState title="No graph data" description="Nothing to render in 3D for this analysis." />;
  }

  return (
    <div className="space-y-3">
      <div ref={mountRef} className="h-[460px] w-full overflow-hidden rounded-lg border border-border bg-background" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GraphLegend />
        <p className="font-data text-xs text-muted-foreground">drag to orbit · scroll to zoom</p>
      </div>
    </div>
  );
}
