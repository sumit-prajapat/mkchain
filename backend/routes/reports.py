"""
routes/reports.py  —  Phase 5
Endpoints:
  GET  /api/reports/{id}/pdf          → stream forensics PDF
  POST /api/reports/{id}/ai-summary   → regenerate AI summary via Groq
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
    if value is None:
        return []
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return []


def _build_data(analysis: WalletAnalysis, db: Session) -> dict:
    nodes = db.query(GraphNode).filter(GraphNode.analysis_id == analysis.id).all()
    edges = db.query(GraphEdge).filter(GraphEdge.analysis_id == analysis.id).all()

    mixer_cnt = sum(1 for n in nodes if n.node_type == "mixer")
    exch_cnt  = sum(1 for n in nodes if n.node_type == "exchange")
    max_hops  = max((n.hop or 0 for n in nodes), default=2)
    n_count   = len(nodes)
    e_count   = len(edges)
    density   = round(e_count / max(n_count * (n_count - 1), 1), 4)

    return {
        "id":           analysis.id,
        "address":      analysis.address,
        "chain":        analysis.chain,
        "risk_score":   float(analysis.risk_score or 0),
        "risk_label":   analysis.risk_label or "LOW",
        "total_txns":   analysis.total_txns or 0,
        "total_volume": float(analysis.total_volume or 0),
        "flags":        _safe_json(analysis.flags),
        "darkweb_hits": _safe_json(analysis.darkweb_hits),
        "risk_factors": _safe_json(analysis.risk_factors),
        "ai_summary":   analysis.ai_summary or "",
        "graph": {"stats": {
            "total_nodes":    n_count,
            "total_edges":    e_count,
            "mixer_nodes":    mixer_cnt,
            "exchange_nodes": exch_cnt,
            "max_hops":       max_hops,
            "density":        density,
        }},
        "created_at": str(analysis.created_at),
    }


def _ensure_summary(analysis: WalletAnalysis, data: dict, db: Session) -> str:
    if analysis.ai_summary:
        return analysis.ai_summary
    summary = generate_ai_summary(
        address=data["address"], chain=data["chain"],
        risk_score=data["risk_score"], risk_label=data["risk_label"],
        flags=data["flags"], total_txns=data["total_txns"],
        total_volume=data["total_volume"], darkweb_hits=data["darkweb_hits"],
        graph_stats=data["graph"]["stats"],
    )
    analysis.ai_summary = summary
    data["ai_summary"]  = summary
    db.commit()
    return summary


@router.get("/reports/{analysis_id}/pdf")
def download_pdf(analysis_id: int, db: Session = Depends(get_db)):
    """Stream a professional forensics PDF. AI summary is auto-generated and cached."""
    analysis = db.query(WalletAnalysis).filter(WalletAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    data = _build_data(analysis, db)
    _ensure_summary(analysis, data, db)
    pdf_buf  = generate_pdf_report(data)
    filename = f"mkchain-{data['address'][:10]}-{analysis_id}.pdf"

    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/reports/{analysis_id}/ai-summary")
def regenerate_summary(analysis_id: int, db: Session = Depends(get_db)):
    """Force-regenerate the AI summary (useful if Groq was down during analysis)."""
    analysis = db.query(WalletAnalysis).filter(WalletAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    data    = _build_data(analysis, db)
    summary = generate_ai_summary(
        address=data["address"], chain=data["chain"],
        risk_score=data["risk_score"], risk_label=data["risk_label"],
        flags=data["flags"], total_txns=data["total_txns"],
        total_volume=data["total_volume"], darkweb_hits=data["darkweb_hits"],
        graph_stats=data["graph"]["stats"],
    )
    analysis.ai_summary = summary
    db.commit()
    return {"analysis_id": analysis_id, "ai_summary": summary}
