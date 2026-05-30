"""
routes/alerts.py — Phase 9: Real-time Wallet Alerts
REST CRUD + SSE streaming for live wallet monitoring
"""
import asyncio
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models import WatchedAddress, Alert
from services.blockchain import fetch_transactions
from services.darkweb import check_darkweb, check_all_addresses
from services.graph import detect_all_patterns, build_hop_graph, compute_node_risks, serialize_graph
from ml.risk_scorer import ml_risk_score

router = APIRouter()


class WatchRequest(BaseModel):
    address:         str
    chain:           str = "eth"
    label:           str = ""
    alert_threshold: float = 50.0


class MarkReadRequest(BaseModel):
    alert_ids: list


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.post("/alerts/watch")
def add_watch(req: WatchRequest, db: Session = Depends(get_db)):
    """Add a wallet to the watch list."""
    existing = db.query(WatchedAddress).filter(
        WatchedAddress.address == req.address.lower(),
        WatchedAddress.chain   == req.chain,
    ).first()
    if existing:
        existing.is_active       = True
        existing.alert_threshold = req.alert_threshold
        existing.label           = req.label or existing.label
        db.commit()
        return {"message": "Watch updated", "id": existing.id}

    watch = WatchedAddress(
        address         = req.address.lower().strip(),
        chain           = req.chain,
        label           = req.label,
        alert_threshold = req.alert_threshold,
    )
    db.add(watch)
    db.commit()
    db.refresh(watch)
    return {"message": "Now watching", "id": watch.id}


@router.get("/alerts/watched")
def list_watched(db: Session = Depends(get_db)):
    """List all watched addresses."""
    watches = db.query(WatchedAddress).filter(WatchedAddress.is_active == True).order_by(
        WatchedAddress.created_at.desc()).all()
    return [
        {
            "id":               w.id,
            "address":          w.address,
            "chain":            w.chain,
            "label":            w.label,
            "alert_threshold":  w.alert_threshold,
            "last_checked":     str(w.last_checked),
            "created_at":       str(w.created_at),
            "alert_count":      len(w.alerts),
            "unread_count":     len([a for a in w.alerts if not a.is_read]),
        }
        for w in watches
    ]


@router.delete("/alerts/watch/{watch_id}")
def remove_watch(watch_id: int, db: Session = Depends(get_db)):
    """Remove a wallet from watch list."""
    watch = db.query(WatchedAddress).filter(WatchedAddress.id == watch_id).first()
    if not watch:
        raise HTTPException(404, "Watch not found")
    watch.is_active = False
    db.commit()
    return {"message": "Removed from watch list"}


@router.get("/alerts/feed")
def get_alerts(limit: int = 50, db: Session = Depends(get_db)):
    """Get recent alerts."""
    alerts = db.query(Alert).order_by(Alert.created_at.desc()).limit(limit).all()
    return [
        {
            "id":         a.id,
            "address":    a.address,
            "chain":      a.chain,
            "tx_hash":    a.tx_hash,
            "value":      a.value,
            "alert_type": a.alert_type,
            "message":    a.message,
            "is_read":    a.is_read,
            "created_at": str(a.created_at),
        }
        for a in alerts
    ]


@router.post("/alerts/read")
def mark_read(req: MarkReadRequest, db: Session = Depends(get_db)):
    """Mark alerts as read."""
    db.query(Alert).filter(Alert.id.in_(req.alert_ids)).update(
        {"is_read": True}, synchronize_session=False)
    db.commit()
    return {"message": f"Marked {len(req.alert_ids)} as read"}


@router.post("/alerts/check-now/{watch_id}")
async def check_now(watch_id: int, db: Session = Depends(get_db)):
    """Manually trigger a check for new transactions on a watched address."""
    watch = db.query(WatchedAddress).filter(
        WatchedAddress.id == watch_id, WatchedAddress.is_active == True).first()
    if not watch:
        raise HTTPException(404, "Watch not found")

    new_alerts = await _check_wallet(watch, db)
    db.commit()
    return {"new_alerts": new_alerts, "checked_at": str(datetime.utcnow())}


# ── SSE Real-time Stream ──────────────────────────────────────────────────────

@router.get("/alerts/stream")
async def alert_stream(db: Session = Depends(get_db)):
    """
    Server-Sent Events stream — pushes new alerts as they happen.
    Polls all watched addresses every 30 seconds.
    """
    async def event_generator():
        # Send initial heartbeat
        yield f"data: {json.dumps({'type': 'connected', 'message': 'Alert stream connected'})}\n\n"

        cycle = 0
        while True:
            await asyncio.sleep(30)
            cycle += 1

            try:
                # Re-query within the generator
                watches = db.query(WatchedAddress).filter(
                    WatchedAddress.is_active == True).all()

                new_count = 0
                for watch in watches:
                    alerts_created = await _check_wallet(watch, db)
                    new_count += alerts_created

                    for alert in db.query(Alert).filter(
                        Alert.watched_id == watch.id,
                        Alert.is_read == False
                    ).order_by(Alert.created_at.desc()).limit(3).all():
                        payload = {
                            "type":       "alert",
                            "id":         alert.id,
                            "address":    alert.address,
                            "chain":      alert.chain,
                            "alert_type": alert.alert_type,
                            "message":    alert.message,
                            "value":      alert.value,
                            "tx_hash":    alert.tx_hash,
                            "created_at": str(alert.created_at),
                        }
                        yield f"data: {json.dumps(payload)}\n\n"

                db.commit()

                # Heartbeat every cycle
                yield f"data: {json.dumps({'type': 'heartbeat', 'cycle': cycle, 'checked': len(watches)})}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
            "Access-Control-Allow-Origin": "*",
        }
    )


# ── Internal checker ─────────────────────────────────────────────────────────

async def _check_wallet(watch: WatchedAddress, db: Session) -> int:
    """Check a watched wallet for new transactions. Returns count of new alerts."""
    try:
        txns = await fetch_transactions(watch.address, watch.chain, limit=10)
    except Exception:
        return 0

    if not txns:
        watch.last_checked = datetime.utcnow()
        return 0

    latest_hash = txns[0].get("hash", "")
    if latest_hash == watch.last_tx_hash:
        watch.last_checked = datetime.utcnow()
        return 0  # No new transactions

    # New transactions detected
    new_txns = []
    known_hashes = {watch.last_tx_hash}
    for tx in txns:
        if tx.get("hash") in known_hashes:
            break
        new_txns.append(tx)

    alerts_created = 0
    for tx in new_txns[:5]:  # Max 5 alerts per check
        alert_type = "new_tx"
        message    = f"New transaction detected: {tx.get('value', 0):.6f} {watch.chain.upper()}"

        # Check if darkweb
        counter = tx.get("to", "") or tx.get("from", "")
        dw = check_darkweb(counter)
        if dw.get("is_known_bad"):
            alert_type = "darkweb"
            message    = f"⚠️ Transaction with known bad address: {dw.get('label', 'Unknown')} ({dw.get('category', '')})"

        alert = Alert(
            watched_id = watch.id,
            address    = watch.address,
            chain      = watch.chain,
            tx_hash    = tx.get("hash", ""),
            value      = tx.get("value", 0),
            alert_type = alert_type,
            message    = message,
        )
        db.add(alert)
        alerts_created += 1

    watch.last_tx_hash = latest_hash
    watch.last_checked = datetime.utcnow()
    return alerts_created
