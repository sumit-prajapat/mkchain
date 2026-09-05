"""
routes/compare.py â€” Phase 9: Wallet Comparison
POST /api/compare  â†’ analyze two wallets, return side-by-side + shared intel
"""
import asyncio
import uuid
import logging
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from services.blockchain import fetch_transactions, classify_address
from services.darkweb import check_darkweb, check_all_addresses, get_risk_boost
from services.graph import build_hop_graph, compute_node_risks, detect_all_patterns, serialize_graph
from services.usage_tracker import get_usage_tracker
from ml.risk_scorer import ml_risk_score, get_risk_explanation

router = APIRouter()
logger = logging.getLogger(__name__)


class CompareRequest(BaseModel):
    address_a: str
    chain_a:   str = "eth"
    address_b: str
    chain_b:   str = "eth"


async def _quick_analyze(address: str, chain: str) -> dict:
    """Lightweight single-hop analysis for comparison."""
    address = address.lower().strip()
    try:
        G, hop_map, all_txns = await build_hop_graph(address, chain, max_hops=1)
    except Exception as e:
        raise HTTPException(502, f"Blockchain API error for {address[:10]}...: {str(e)}")

    txns  = all_txns.get(address, [])
    flags = detect_all_patterns(G, address, txns, hop_map)

    all_addrs    = list(set([address] + [t.get("to","") for t in txns] + [t.get("from","") for t in txns]))
    darkweb_hits = check_all_addresses(all_addrs)
    if darkweb_hits and "darkweb_match" not in flags:
        flags.append("darkweb_match")

    node_risks = compute_node_risks(G, address)
    graph_data = serialize_graph(G, node_risks, address)
    risk_score, risk_label, _ = ml_risk_score(txns, flags, graph_data)

    dw_boost = get_risk_boost(darkweb_hits)
    if dw_boost > 0:
        risk_score = max(risk_score, min(dw_boost + risk_score * 0.3, 100.0))
        if risk_score >= 90:   risk_label = "CRITICAL"
        elif risk_score >= 65: risk_label = "HIGH"

    risk_exp      = get_risk_explanation(risk_score, flags, txns, chain)
    total_volume  = sum(t.get("value", 0) for t in txns)
    ts            = sorted([t.get("timestamp","") for t in txns if t.get("timestamp")])
    direct_osint  = check_darkweb(address)

    return {
        "address":       address,
        "chain":         chain,
        "risk_score":    round(risk_score, 2),
        "risk_label":    risk_label,
        "total_txns":    len(txns),
        "total_volume":  round(total_volume, 6),
        "first_seen":    ts[0]  if ts else None,
        "last_seen":     ts[-1] if ts else None,
        "flags":         flags,
        "risk_factors":  risk_exp.get("factors", []),
        "darkweb_hits":  darkweb_hits,
        "osint_direct":  direct_osint,
        "graph_stats":   graph_data.get("stats", {}),
        "graph_nodes":   [n["id"] for n in graph_data.get("nodes", [])],
        "graph_edges":   graph_data.get("edges", []),
    }


def _find_shared_intel(a: dict, b: dict) -> dict:
    """Find overlaps between two wallet analyses."""
    nodes_a = set(a["graph_nodes"])
    nodes_b = set(b["graph_nodes"])
    shared_nodes = nodes_a & nodes_b
    shared_nodes.discard(a["address"])
    shared_nodes.discard(b["address"])

    shared_flags = list(set(a["flags"]) & set(b["flags"]))

    dw_a = {h["address"] for h in a["darkweb_hits"]}
    dw_b = {h["address"] for h in b["darkweb_hits"]}
    shared_darkweb = dw_a & dw_b

    # Risk delta
    risk_delta = round(abs(a["risk_score"] - b["risk_score"]), 2)
    higher_risk = a["address"] if a["risk_score"] >= b["risk_score"] else b["address"]

    # Relationship: do they share direct transactions?
    edges_a = {(e["source"], e["target"]) for e in a["graph_edges"]}
    edges_b = {(e["source"], e["target"]) for e in b["graph_edges"]}
    direct_link = (
        any(a["address"] in [e["source"], e["target"]] and b["address"] in [e["source"], e["target"]]
            for e in a["graph_edges"] + b["graph_edges"])
    )

    return {
        "shared_nodes":      list(shared_nodes)[:20],
        "shared_node_count": len(shared_nodes),
        "shared_flags":      shared_flags,
        "shared_darkweb":    list(shared_darkweb),
        "risk_delta":        risk_delta,
        "higher_risk":       higher_risk,
        "direct_link":       direct_link,
        "relationship":      "DIRECTLY LINKED" if direct_link
                             else f"{len(shared_nodes)} SHARED COUNTERPARTIES" if shared_nodes
                             else "NO DIRECT LINK",
        "combined_risk":     "CRITICAL" if (a["risk_label"]=="CRITICAL" or b["risk_label"]=="CRITICAL")
                             else "HIGH" if (a["risk_label"]=="HIGH" or b["risk_label"]=="HIGH")
                             else "MEDIUM" if (a["risk_label"]=="MEDIUM" or b["risk_label"]=="MEDIUM")
                             else "LOW",
    }


@router.post("/compare")
async def compare_wallets(request: Request, req: CompareRequest, db: Session = Depends(get_db)):
    """
    Compare two wallets side by side with shared intelligence.
    
    Multi-tenant: Authentication required but no data persistence, so no org filtering needed.
    The request.state.organization_id is available for future audit logging.
    """
    org_id = getattr(request.state, 'organization_id', None)
    
    if req.address_a.lower() == req.address_b.lower() and req.chain_a == req.chain_b:
        raise HTTPException(400, "Cannot compare a wallet with itself")

    # Run both analyses concurrently
    result_a, result_b = await asyncio.gather(
        _quick_analyze(req.address_a, req.chain_a),
        _quick_analyze(req.address_b, req.chain_b),
        return_exceptions=False,
    )

    shared = _find_shared_intel(result_a, result_b)
    
    # Track usage for comparison (counts as 2 analyses since we analyze 2 addresses)
    if org_id:
        try:
            usage_tracker = get_usage_tracker(db)
            await usage_tracker.increment_usage(
                org_id=uuid.UUID(org_id),
                metric_type="analysis",
                amount=2.0  # Count as 2 analyses
            )
        except Exception as e:
            # Log error but don't fail the request
            logger.warning(f"Failed to track usage for comparison (org: {org_id}): {e}")

    return {
        "wallet_a": result_a,
        "wallet_b": result_b,
        "shared":   shared,
    }

