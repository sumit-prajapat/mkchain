"""
routes/reports.py — Phase 5
GET  /api/reports/{id}/pdf        → stream forensics PDF
POST /api/reports/{id}/ai-summary → regenerate AI summary
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import WalletAnalysis, GraphNode, GraphEdge
from services.ai_summary import generate_ai_summary
from services.pdf_report import generate_pdf_report

router = APIRouter()


def _safe_json(value):
    """Safely parse JSON whether stored as string or already a list/dict."""
    if value is None:
        return []
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return []


def _build_data(analysis: WalletAnalysis, db: Session) -> dict:
    """Assemble full dict for PDF/AI — safe against missing columns."""
    nodes = db.query(GraphNode).filter(GraphNode.analysis_id == analysis.id).all()
    edges = db.query(GraphEdge).filter(GraphEdge.analysis_id == analysis.id).all()

    mixer_cnt    = sum(1 for n in nodes if n.node_type == "mixer")
    exch_cnt     = sum(1 for n in nodes if n.node_type == "exchange")
    darkweb_cnt  = sum(1 for n in nodes if n.node_type == "darkweb")
    n_count      = len(nodes)
    e_count      = len(edges)
    density      = round(e_count / max(n_count * (n_count - 1), 1), 4)

    # Safely read flags — stored as JSON in DB
    flags = _safe_json(getattr(analysis, 'flags', None))

    # darkweb_hits and risk_factors may not be DB columns —
    # reconstruct from flags and node types instead
    darkweb_hits = []
    if "darkweb_match" in flags:
        # Try to find darkweb nodes from graph
        from services.darkweb import check_darkweb
        for n in nodes:
            if n.node_type in ("darkweb", "mixer"):
                result = check_darkweb(n.node_id)
                if result.get("is_known_bad"):
                    darkweb_hits.append(result)

    risk_factors = []
    flag_map = {
        "mixer_interaction":        ("Mixer Interaction",       "CRITICAL", "Direct transaction with a known Tornado Cash / mixer contract."),
        "darkweb_match":            ("Dark Web / OFAC Match",   "CRITICAL", "Address matched OFAC sanctions or dark web intelligence database."),
        "peel_chain_detected":      ("Peel Chain",              "HIGH",     "Funds progressively split across hops — obfuscation technique."),
        "layered_mixer_routing":    ("Layered Mixer Routing",   "HIGH",     "Multi-hop routing through intermediate wallets before mixer."),
        "mixer_proximity":          ("Mixer Proximity",         "HIGH",     "Mixer address found within 2 hops of target wallet."),
        "high_velocity":            ("High Velocity",           "MEDIUM",   "Unusually high transaction frequency detected."),
        "round_amount_structuring": ("Structuring",             "MEDIUM",   "Round-value transactions consistent with AML threshold evasion."),
        "high_fan_out":             ("High Fan-Out",            "MEDIUM",   "Extremely high number of unique outgoing recipient addresses."),
        "high_fan_in":              ("High Fan-In",             "MEDIUM",   "Extremely high number of unique incoming sender addresses."),
        "dormancy_then_activity":   ("Dormancy→Activity",       "MEDIUM",   "Long inactivity followed by sudden high-volume activity burst."),
    }
    for flag in flags:
        if flag in flag_map:
            name, impact, detail = flag_map[flag]
            risk_factors.append({"factor": name, "impact": impact, "detail": detail})

    return {
        "id":           analysis.id,
        "address":      analysis.address,
        "chain":        analysis.chain or "eth",
        "risk_score":   float(analysis.risk_score or 0),
        "risk_label":   analysis.risk_label or "LOW",
        "total_txns":   analysis.total_txns or 0,
        "total_volume": float(analysis.total_volume or 0),
        "flags":        flags,
        "darkweb_hits": darkweb_hits,
        "risk_factors": risk_factors,
        "ai_summary":   analysis.ai_summary or "",
        "graph": {"stats": {
            "total_nodes":    n_count,
            "total_edges":    e_count,
            "mixer_nodes":    mixer_cnt,
            "darkweb_nodes":  darkweb_cnt,
            "exchange_nodes": exch_cnt,
            "max_hops":       2,
            "density":        density,
        }},
        "created_at": str(analysis.created_at),
    }


def _ensure_summary(analysis: WalletAnalysis, data: dict, db: Session) -> str:
    """Generate + cache AI summary if not already stored."""
    if analysis.ai_summary:
        return analysis.ai_summary
    summary = generate_ai_summary(
        address=data["address"],      chain=data["chain"],
        risk_score=data["risk_score"], risk_label=data["risk_label"],
        flags=data["flags"],          total_txns=data["total_txns"],
        total_volume=data["total_volume"], darkweb_hits=data["darkweb_hits"],
        graph_stats=data["graph"]["stats"],
    )
    analysis.ai_summary = summary
    data["ai_summary"]  = summary
    db.commit()
    return summary


@router.get("/reports/{analysis_id}/pdf")
def download_pdf(analysis_id: int, db: Session = Depends(get_db)):
    """Generate and stream a professional forensics PDF report."""
    analysis = db.query(WalletAnalysis).filter(WalletAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    try:
        data = _build_data(analysis, db)
        _ensure_summary(analysis, data, db)
        pdf_buf  = generate_pdf_report(data)
        filename = f"mkchain-{data['address'][:10]}-{analysis_id}.pdf"
        return StreamingResponse(
            pdf_buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


@router.post("/reports/{analysis_id}/ai-summary")
def regenerate_summary(analysis_id: int, db: Session = Depends(get_db)):
    """Force-regenerate the AI summary."""
    analysis = db.query(WalletAnalysis).filter(WalletAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    data    = _build_data(analysis, db)
    summary = generate_ai_summary(
        address=data["address"],      chain=data["chain"],
        risk_score=data["risk_score"], risk_label=data["risk_label"],
        flags=data["flags"],          total_txns=data["total_txns"],
        total_volume=data["total_volume"], darkweb_hits=data["darkweb_hits"],
        graph_stats=data["graph"]["stats"],
    )
    analysis.ai_summary = summary
    db.commit()
    return {"analysis_id": analysis_id, "ai_summary": summary}
