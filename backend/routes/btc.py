"""
routes/btc.py — Phase 9: Bitcoin Deep Dive
GET /api/btc/deep/{address}
"""
from fastapi import APIRouter, HTTPException
from services.btc_deep import full_btc_analysis

router = APIRouter()


@router.get("/btc/deep/{address}")
async def btc_deep_dive(address: str):
    """Full Bitcoin forensics: UTXO, CoinJoin, coin age, clustering."""
    if not (address.startswith("1") or address.startswith("3") or address.startswith("bc1")):
        raise HTTPException(400, "Invalid Bitcoin address format")

    result = await full_btc_analysis(address)
    if "error" in result:
        raise HTTPException(502, result["error"])
    return result
