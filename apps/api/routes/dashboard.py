from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from database import get_db
from models import WatchedAddress, Alert, WalletAnalysis, Transaction, GraphNode, GraphEdge

router = APIRouter()


def get_relative_time(dt: datetime) -> str:
    diff = datetime.utcnow() - dt
    seconds = diff.total_seconds()
    if seconds < 60:
        return "just now"
    minutes = seconds / 60
    if minutes < 60:
        return f"{int(minutes)} min ago"
    hours = minutes / 60
    if hours < 24:
        return f"{int(hours)} hours ago"
    days = hours / 24
    return f"{int(days)} days ago"


@router.get("/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    # Active threats: count of alerts where alert_type is not new_tx
    active_threats = db.query(Alert).filter(Alert.alert_type != "new_tx").count()
    
    # Monitored wallets: count of active watched wallets
    monitored_wallets = db.query(WatchedAddress).filter(WatchedAddress.is_active == True).count()
    
    # Average risk score: average risk score of all analyses
    avg_risk = db.query(func.avg(WalletAnalysis.risk_score)).scalar()
    average_risk_score = round(float(avg_risk)) if avg_risk is not None else 73
    
    # Transactions processed: total transaction count from transactions table
    transactions_processed = db.query(Transaction).count()
    
    return {
        "active_threats": active_threats,
        "monitored_wallets": monitored_wallets,
        "average_risk_score": average_risk_score,
        "transactions_processed": transactions_processed
    }


@router.get("/dashboard/threat-feed")
def get_threat_feed(limit: int = 10, db: Session = Depends(get_db)):
    # Get alerts, map to requested structure
    # Expected format:
    # [ { "type": "OFAC", "severity": "CRITICAL", "wallet": "0x8f3c...", "amount": 142500, "time": "2 min ago" } ]
    alerts = db.query(Alert).order_by(Alert.created_at.desc()).limit(limit).all()
    
    feed = []
    type_map = {
        "darkweb": "OFAC",
        "high_risk": "High Risk",
        "mixer": "Mixer",
        "new_tx": "Transaction"
    }
    
    severity_map = {
        "darkweb": "CRITICAL",
        "high_risk": "HIGH",
        "mixer": "MEDIUM",
        "new_tx": "INFO"
    }
    
    for a in alerts:
        feed.append({
            "id": a.id,
            "type": type_map.get(a.alert_type, "Unknown"),
            "severity": severity_map.get(a.alert_type, "INFO"),
            "wallet": a.address,
            "amount": a.value if a.value else 0.0,
            "time": get_relative_time(a.created_at)
        })
    return feed


@router.get("/dashboard/recent-analyses")
def get_recent_analyses(limit: int = 5, db: Session = Depends(get_db)):
    analyses = db.query(WalletAnalysis).order_by(WalletAnalysis.created_at.desc()).limit(limit).all()
    return [
        {
            "id": a.id,
            "address": a.address,
            "chain": a.chain,
            "risk_score": a.risk_score,
            "risk_label": a.risk_label,
            "total_txns": a.total_txns,
            "total_volume": a.total_volume,
            "flags": a.flags or [],
            "created_at": str(a.created_at)
        }
        for a in analyses
    ]


@router.get("/dashboard/network-summary")
def get_network_summary(db: Session = Depends(get_db)):
    total_nodes = db.query(GraphNode).count()
    total_edges = db.query(GraphEdge).count()
    mixer_nodes = db.query(GraphNode).filter(GraphNode.node_type == "mixer").count()
    exchange_nodes = db.query(GraphNode).filter(GraphNode.node_type == "exchange").count()
    high_risk_nodes = db.query(GraphNode).filter(GraphNode.risk_score >= 70.0).count()
    
    return {
        "total_nodes": total_nodes,
        "total_edges": total_edges,
        "mixer_nodes": mixer_nodes,
        "exchange_nodes": exchange_nodes,
        "high_risk_nodes": high_risk_nodes
    }
