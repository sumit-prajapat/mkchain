"""
MKChain — Multi-Hop Transaction Graph Builder
Traces transactions up to N hops deep from the target wallet.
Detects mixers, bridges, peel chains, and clustering patterns.
"""

import networkx as nx
import asyncio
import math
import random
from services.blockchain import (
    fetch_transactions, classify_address,
    KNOWN_MIXERS, KNOWN_EXCHANGES
)


async def build_hop_graph(
    root_address: str,
    chain: str,
    max_hops: int = 2,
    max_addresses_per_hop: int = 10,
) -> tuple:
    """
    Build a multi-hop transaction graph starting from root_address.
    Hop 0: root wallet | Hop 1: counterparties | Hop 2: their counterparties
    Returns (graph, hop_map, all_txns)
    """
    G        = nx.DiGraph()
    hop_map  = {}
    visited  = set()
    queue    = [(root_address, 0)]
    all_txns = {}

    while queue:
        address, hop = queue.pop(0)
        if address in visited or hop > max_hops:
            continue
        visited.add(address)
        hop_map[address] = hop

        try:
            txns = await fetch_transactions(address, chain, limit=50)
        except Exception:
            txns = []

        all_txns[address] = txns

        node_type = classify_address(address)
        G.add_node(address,
            node_type  = node_type,
            is_root    = (address == root_address),
            hop        = hop,
            chain      = chain,
            tx_count   = len(txns),
            risk_score = 0,
        )

        next_addresses = set()
        for tx in txns:
            src = tx.get("from", "").lower()
            dst = tx.get("to",   "").lower()
            val = tx.get("value", 0)
            if not src or not dst:
                continue

            for cp in (src, dst):
                if cp not in G:
                    G.add_node(cp,
                        node_type  = classify_address(cp),
                        is_root    = False,
                        hop        = hop + 1,
                        chain      = chain,
                        tx_count   = 0,
                        risk_score = 0,
                    )

            edge_type = "mixer" if (src in KNOWN_MIXERS or dst in KNOWN_MIXERS) else \
                        "exchange" if (src in KNOWN_EXCHANGES or dst in KNOWN_EXCHANGES) else "normal"

            if G.has_edge(src, dst):
                G[src][dst]["value"]    += val
                G[src][dst]["tx_count"] += 1
            else:
                G.add_edge(src, dst,
                    value     = val,
                    tx_count  = 1,
                    tx_hash   = tx.get("hash", ""),
                    timestamp = tx.get("timestamp", ""),
                    edge_type = edge_type,
                )

            counterparty = dst if src == address else src
            if counterparty not in visited and hop < max_hops:
                next_addresses.add(counterparty)

        for addr in list(next_addresses)[:max_addresses_per_hop]:
            queue.append((addr, hop + 1))

    return G, hop_map, all_txns


def compute_node_risks(G: nx.DiGraph, root: str) -> dict:
    """Compute risk scores for every node in the graph."""
    scores = {}
    try:
        pagerank = nx.pagerank(G, alpha=0.85, max_iter=100)
    except Exception:
        pagerank = {n: 0 for n in G.nodes}

    for node, attrs in G.nodes(data=True):
        score = {"mixer": 80, "darkweb": 90, "exchange": 5, "bridge": 30, "wallet": 0}.get(
            attrs.get("node_type", "wallet"), 0)

        if G.out_degree(node) > 20: score += 15
        if G.out_degree(node) > 50: score += 15
        if G.in_degree(node)  > 50: score += 10
        pr = pagerank.get(node, 0)
        if pr > 0.05: score += 10
        if pr > 0.15: score += 10
        if attrs.get("hop", 99) == 0:
            score = min(score, 40)

        scores[node] = min(round(score, 1), 100)
    return scores


def detect_all_patterns(G: nx.DiGraph, root: str, transactions: list, hop_map: dict) -> list:
    """Detect all suspicious patterns in the transaction graph."""
    flags = []
    addr  = root.lower()

    def add(f):
        if f not in flags: flags.append(f)

    # Mixer direct interaction
    for tx in transactions:
        if tx.get("from","").lower() in KNOWN_MIXERS or tx.get("to","").lower() in KNOWN_MIXERS:
            add("mixer_interaction")

    # Mixer within 2 hops
    for node, attrs in G.nodes(data=True):
        if attrs.get("node_type") == "mixer" and hop_map.get(node, 99) <= 2:
            add("mixer_proximity")

    # Peel chain
    out_edges   = list(G.out_edges(addr))
    single_hops = sum(1 for _, dst in out_edges if G.out_degree(dst) == 1)
    if len(out_edges) > 3 and single_hops / max(len(out_edges), 1) > 0.6:
        add("peel_chain_detected")

    # Fan-out / fan-in
    if G.out_degree(addr) > 20: add("high_fan_out")
    if G.in_degree(addr)  > 50: add("high_fan_in")

    # Transaction velocity
    ts = sorted([int(tx["timestamp"]) for tx in transactions
                 if tx.get("timestamp","").isdigit()])
    if len(ts) >= 10:
        span = max((ts[-1] - ts[0]) / 86400, 1)
        if len(transactions) / span > 50:
            add("high_velocity")

    # Round-amount structuring
    if transactions:
        rounds = sum(1 for tx in transactions
                     if tx.get("value",0) > 0 and float(tx["value"]) == int(tx["value"]))
        if rounds / len(transactions) > 0.75:
            add("round_amount_structuring")

    # Dormancy then sudden activity
    if len(ts) >= 5:
        gaps = [ts[i+1] - ts[i] for i in range(len(ts)-1)]
        if max(gaps) > sum(gaps)/len(gaps) * 10 and max(gaps) > 86400 * 180:
            add("dormancy_then_activity")

    # Multi-hop mixer routing
    hop2_mixers = sum(1 for n, h in hop_map.items()
                      if h == 2 and G.nodes[n].get("node_type") == "mixer")
    if hop2_mixers > 0:
        add("layered_mixer_routing")

    return flags


def serialize_graph(G: nx.DiGraph, risk_scores: dict, root: str) -> dict:
    """Convert graph to JSON for D3.js / Three.js with 3D coordinates."""
    nodes = []
    for i, (node_id, attrs) in enumerate(G.nodes(data=True)):
        hop    = attrs.get("hop", 1)
        angle  = (i * 137.5) % 360
        radius = hop * 120
        nodes.append({
            "id":         node_id,
            "label":      (node_id[:6] + "…" + node_id[-4:]) if len(node_id) > 12 else node_id,
            "node_type":  attrs.get("node_type", "wallet"),
            "is_root":    node_id == root,
            "hop":        hop,
            "risk_score": risk_scores.get(node_id, 0),
            "chain":      attrs.get("chain", "eth"),
            "tx_count":   attrs.get("tx_count", 0),
            "x": round(radius * math.cos(math.radians(angle)), 2),
            "y": round(radius * math.sin(math.radians(angle)), 2),
            "z": round(hop * 50 + random.uniform(-20, 20), 2),
        })

    edges = []
    for src, dst, attrs in G.edges(data=True):
        edges.append({
            "source":    src,
            "target":    dst,
            "value":     round(attrs.get("value", 0), 6),
            "tx_count":  attrs.get("tx_count", 1),
            "edge_type": attrs.get("edge_type", "normal"),
            "tx_hash":   attrs.get("tx_hash", ""),
            "timestamp": attrs.get("timestamp", ""),
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "total_nodes":    G.number_of_nodes(),
            "total_edges":    G.number_of_edges(),
            "mixer_nodes":    sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == "mixer"),
            "exchange_nodes": sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == "exchange"),
            "max_hops":       max((d.get("hop", 0) for _, d in G.nodes(data=True)), default=0),
            "density":        round(nx.density(G), 4),
        }
    }
