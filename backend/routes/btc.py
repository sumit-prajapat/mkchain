"""
routes/btc.py — Phase 9: Bitcoin Deep Dive
GET /api/btc/deep/{address}
"""
import uuid
import logging
from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy.orm import Session
from database import get_db
from services.btc_deep import full_btc_analysis
from services.usage_tracker import get_usage_tracker

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/btc/deep/{address}")
async def btc_deep_dive(address: str, request: Request, db: Session = Depends(get_db)):
    """Full Bitcoin forensics: UTXO, CoinJoin, coin age, clustering."""
    if not (address.startswith("1") or address.startswith("3") or address.startswith("bc1")):
        raise HTTPException(400, "Invalid Bitcoin address format")

    result = await full_btc_analysis(address)
    if "error" in result:
        raise HTTPException(502, result["error"])
    
    # Track usage for BTC deep analysis
    org_id = getattr(request.state, 'organization_id', None)
    if org_id:
        try:
            usage_tracker = get_usage_tracker(db)
            await usage_tracker.increment_usage(
                org_id=uuid.UUID(org_id),
                metric_type="analysis",
                amount=1.0
            )
        except Exception as e:
            # Log error but don't fail the request
            logger.warning(f"Failed to track usage for BTC deep analysis (org: {org_id}): {e}")
    
    return result
