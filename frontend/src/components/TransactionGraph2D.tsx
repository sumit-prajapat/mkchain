import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { EmptyState } from "@/components/states";
import { GraphLegend, nodeColor } from "@/components/GraphLegend";
import { truncate } from "@/lib/chain";
import type { GraphEdge, GraphNode } from "@/lib/types";

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label?: string;
  type?: string;
  address?: string;
}

export function TransactionGraph2D({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<SimNode | null>(null);

  useEffect(() => {
    if (!ref.current || !nodes?.length) return;
    const width = wrapRef.current?.clientWidth ?? 800;
    const height = 460;

    const simNodes: SimNode[] = nodes.map((n) => ({
      id: n.id ?? n.address ?? "",
      ...(n.label !== undefined ? { label: n.label } : {}),
      ...(n.type !== undefined ? { type: n.type } : {}),
      ...(n.address !== undefined ? { address: n.address } : {}),
    }));
    const ids = new Set(simNodes.map((n) => n.id));
    const links = (edges ?? [])
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, value: e.value ?? 0 }));

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const container = svg.append("g");
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on("zoom", (event) => container.attr("transform", event.transform.toString())),
    );

    const sim = d3
      .forceSimulation<SimNode>(simNodes)
      .force("link", d3.forceLink(links).id((d) => (d as SimNode).id).distance(110).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-320))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(26));

    const link = container
      .append("g")
      .attr("stroke", "#232c40")
      .attr("stroke-width", 1.2)
      .selectAll("line")
      .data(links)
      .join("line");

    const node = container
      .append("g")
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(simNodes)
      .join("circle")
      .attr("r", (d) => (d.type === "root" ? 13 : 8))
      .attr("fill", (d) => nodeColor(d.type))
      .attr("stroke", "#0a0f1e")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("click", (_e, d) => setSelected(d))
      .call(
        d3
          .drag<SVGCircleElement, SimNode>()
          .on("start", (event, d) => {
            if (!event.active) sim.alphaTarget(0.25).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    node.append("title").text((d) => `${d.label ?? d.address ?? d.id}\n${d.type ?? "unknown"}`);

    const label = container
      .append("g")
      .selectAll("text")
      .data(simNodes)
      .join("text")
      .text((d) => d.label ?? truncate(d.address ?? d.id, 4, 3))
      .attr("font-size", 9)
      .attr("font-family", "var(--font-mono)")
      .attr("fill", "#8b93a7")
      .attr("text-anchor", "middle")
      .attr("dy", -14);

    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as unknown as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as unknown as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as unknown as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as unknown as SimNode).y ?? 0);
      node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
      label.attr("x", (d) => d.x ?? 0).attr("y", (d) => d.y ?? 0);
    });

    return () => {
      sim.stop();
    };
  }, [nodes, edges]);

  if (!nodes?.length) {
    return <EmptyState title="No graph data" description="The traversal produced no counterparty nodes at this hop depth." />;
  }

  return (
    <div ref={wrapRef} className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border bg-background hairline-grid">
        <svg ref={ref} className="h-[460px] w-full" role="img" aria-label="Transaction graph" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GraphLegend />
        {selected ? (
          <p className="font-data text-xs text-muted-foreground">
            selected: <span className="text-foreground">{selected.label ?? truncate(selected.address ?? selected.id)}</span> · {selected.type ?? "unknown"}
          </p>
        ) : (
          <p className="font-data text-xs text-muted-foreground">drag to reposition · scroll to zoom · click a node</p>
        )}
      </div>
    </div>
  );
}
