from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import WalletAnalysis, Transaction, GraphNode, GraphEdge
from schemas import AnalyzeRequest, AnalysisResponse, AnalysisSummary
from services.blockchain import fetch_wallet_balance, KNOWN_MIXERS
from services.graph import build_hop_graph, compute_node_risks, detect_all_patterns, serialize_graph
from services.darkweb import check_darkweb, check_all_addresses
from ml.risk_scorer import ml_risk_score, get_risk_explanation
from services.ai_summary import generate_ai_summary
from typing import List
import re

router = APIRouter()


def validate_address(address: str, chain: str) -> bool:
    if chain in ("eth", "polygon"):
        return bool(re.match(r'^0x[a-fA-F0-9]{40}$', address))
    elif chain == "btc":
        return bool(re.match(r'^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$', address))
    return False


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_wallet(req: AnalyzeRequest, db: Session = Depends(get_db)):
    """
    Full forensic analysis pipeline:
    1. Fetch transactions
    2. Build multi-hop graph (up to 3 hops)
    3. Detect patterns (mixer, peel chain, velocity, structuring...)
    4. Check dark web / OFAC database
    5. Score risk 0-100 with explainability
    6. Store to DB and return
    """
    address = req.address.lower().strip()
    chain   = req.chain.lower()
    hops    = max(1, min(req.hops, 3))   # clamp 1-3

    if not validate_address(req.address, chain):
        raise HTTPException(status_code=400, detail=f"Invalid {chain.upper()} address format")

    # ── Return cached result if exists ──────────────────────────────────────
    existing = db.query(WalletAnalysis).filter(
        WalletAnalysis.address == address,
        WalletAnalysis.chain   == chain,
    ).order_by(WalletAnalysis.created_at.desc()).first()

    if existing:
        graph_nodes = db.query(GraphNode).filter(GraphNode.analysis_id == existing.id).all()
        graph_edges = db.query(GraphEdge).filter(GraphEdge.analysis_id == existing.id).all()
        graph = {
            "nodes": [{"id": n.node_id, "label": n.label, "node_type": n.node_type,
                       "is_root": n.node_id == address, "risk_score": n.risk_score,
                       "hop": 0, "chain": n.chain, "tx_count": 0,
                       "x": 0, "y": 0, "z": 0} for n in graph_nodes],
            "edges": [{"source": e.source, "target": e.target, "value": e.value,
                       "tx_count": 1, "edge_type": e.edge_type, "tx_hash": e.tx_hash,
                       "timestamp": e.timestamp} for e in graph_edges],
            "stats": {"total_nodes": len(graph_nodes), "total_edges": len(graph_edges),
                      "mixer_nodes": 0, "exchange_nodes": 0, "max_hops": hops, "density": 0},
        }
        risk_exp = get_risk_explanation(existing.risk_score, existing.flags or [], [], chain)
        return _build_response(existing, graph, risk_exp["factors"], [], existing.created_at)

    # ── Build multi-hop graph ────────────────────────────────────────────────
    try:
        G, hop_map, all_txns = await build_hop_graph(address, chain, max_hops=hops)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Blockchain API error: {str(e)}")

    root_txns = all_txns.get(address, [])

    # ── Detect patterns ──────────────────────────────────────────────────────
    flags = detect_all_patterns(G, address, root_txns, hop_map)

    # ── Dark web / OFAC check ────────────────────────────────────────────────
    all_addresses = list(set(
        [address] +
        [tx.get("to","")   for tx in root_txns] +
        [tx.get("from","") for tx in root_txns]
    ))
    darkweb_hits = check_all_addresses(all_addresses)
    if darkweb_hits or check_darkweb(address)["is_known_bad"]:
        if "darkweb_match" not in flags:
            flags.append("darkweb_match")

    # ── Risk scoring ─────────────────────────────────────────────────────────
    node_risks  = compute_node_risks(G, address)
    graph_data  = serialize_graph(G, node_risks, address)
    risk_score, risk_label, probabilities = ml_risk_score(root_txns, flags, graph_data)
    risk_exp    = get_risk_explanation(risk_score, flags, root_txns, chain, probabilities)

    # ── Timeline + volume ────────────────────────────────────────────────────
    ts = sorted([tx.get("timestamp","") for tx in root_txns if tx.get("timestamp")])
    total_volume = sum(tx.get("value",0) for tx in root_txns)

    # ── Persist to DB ─────────────────────────────────────────────────────────
    analysis = WalletAnalysis(
        address      = address,
        chain        = chain,
        risk_score   = risk_score,
        risk_label   = risk_label,
        total_txns   = len(root_txns),
        total_volume = total_volume,
        first_seen   = ts[0]  if ts else None,
        last_seen    = ts[-1] if ts else None,
        flags        = flags,
        ai_summary   = generate_ai_summary(
            address      = address,
            chain        = chain,
            risk_score   = risk_score,
            risk_label   = risk_label,
            flags        = flags,
            total_txns   = len(root_txns),
            total_volume = total_volume,
            darkweb_hits = darkweb_hits,
            graph_stats  = graph_data.get("stats", {}),
        ),
    )
    db.add(analysis)
    db.flush()

    for node in graph_data["nodes"]:
        db.add(GraphNode(analysis_id=analysis.id, node_id=node["id"],
                         label=node["label"], node_type=node["node_type"],
                         risk_score=node["risk_score"], chain=node["chain"]))

    for edge in graph_data["edges"]:
        db.add(GraphEdge(analysis_id=analysis.id, source=edge["source"],
                         target=edge["target"], value=edge["value"],
                         tx_hash=edge["tx_hash"], timestamp=edge["timestamp"],
                         edge_type=edge["edge_type"]))

    for tx in root_txns[:50]:
        db.add(Transaction(
            analysis_id  = analysis.id,
            tx_hash      = tx.get("hash",""),
            chain        = chain,
            from_address = tx.get("from",""),
            to_address   = tx.get("to",""),
            value        = tx.get("value",0),
            timestamp    = tx.get("timestamp",""),
            is_mixer     = tx.get("to","").lower() in KNOWN_MIXERS,
            is_darkweb   = any(h["address"] in [tx.get("to",""), tx.get("from","")] for h in darkweb_hits),
        ))

    db.commit()
    db.refresh(analysis)

    return _build_response(analysis, graph_data, risk_exp["factors"], darkweb_hits, analysis.created_at)


def _build_response(analysis, graph, risk_factors, darkweb_hits, created_at):
    return AnalysisResponse(
        id           = analysis.id,
        address      = analysis.address,
        chain        = analysis.chain,
        risk_score   = analysis.risk_score,
        risk_label   = analysis.risk_label,
        total_txns   = analysis.total_txns,
        total_volume = analysis.total_volume,
        first_seen   = analysis.first_seen,
        last_seen    = analysis.last_seen,
        flags        = analysis.flags or [],
        ai_summary   = analysis.ai_summary,
        graph        = graph,
        risk_factors = risk_factors,
        darkweb_hits = darkweb_hits,
        created_at   = created_at,
    )


@router.get("/analyses", response_model=List[AnalysisSummary])
def list_analyses(limit: int = 20, db: Session = Depends(get_db)):
    return db.query(WalletAnalysis).order_by(
        WalletAnalysis.created_at.desc()).limit(limit).all()


@router.get("/analyses/{analysis_id}", response_model=AnalysisResponse)
def get_analysis(analysis_id: int, db: Session = Depends(get_db)):
    analysis = db.query(WalletAnalysis).filter(WalletAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    graph_nodes = db.query(GraphNode).filter(GraphNode.analysis_id == analysis_id).all()
    graph_edges = db.query(GraphEdge).filter(GraphEdge.analysis_id == analysis_id).all()
    graph = {
        "nodes": [{"id": n.node_id, "label": n.label, "node_type": n.node_type,
                   "is_root": n.node_id == analysis.address, "risk_score": n.risk_score,
                   "hop": 0, "chain": n.chain, "tx_count": 0, "x": 0, "y": 0, "z": 0}
                  for n in graph_nodes],
        "edges": [{"source": e.source, "target": e.target, "value": e.value,
                   "tx_count": 1, "edge_type": e.edge_type, "tx_hash": e.tx_hash,
                   "timestamp": e.timestamp} for e in graph_edges],
        "stats": {"total_nodes": len(graph_nodes), "total_edges": len(graph_edges),
                  "mixer_nodes": 0, "exchange_nodes": 0, "max_hops": 2, "density": 0},
    }
    risk_exp = get_risk_explanation(analysis.risk_score, analysis.flags or [], [], analysis.chain)
    return _build_response(analysis, graph, risk_exp["factors"], [], analysis.created_at)


@router.delete("/analyses/{analysis_id}")
def delete_analysis(analysis_id: int, db: Session = Depends(get_db)):
    analysis = db.query(WalletAnalysis).filter(WalletAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    db.delete(analysis)
    db.commit()
    return {"message": "Deleted successfully"}
