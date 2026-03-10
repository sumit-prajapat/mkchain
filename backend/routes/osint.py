"""
routes/osint.py — Phase 6
OSINT Bad Address Database API
Endpoints:
  GET /api/darkweb/stats
  GET /api/darkweb/search?q=lazarus&category=apt&chain=eth
  GET /api/darkweb/entity/{entity_id}
  GET /api/darkweb/check/{address}
"""
from fastapi import APIRouter, Query, HTTPException
from services.darkweb import (
    check_darkweb, search_db, get_entity, get_db_stats, ENTITY_INDEX
)

router = APIRouter()


@router.get("/darkweb/stats")
def darkweb_stats():
    """
    Return statistics about the OSINT bad address database.
    Useful for the frontend dashboard tile.
    """
    return get_db_stats()


@router.get("/darkweb/check/{address}")
def check_address(address: str):
    """
    Check a single wallet address against the OSINT database.
    Returns full match metadata including cross-chain entity links.
    """
    result = check_darkweb(address)
    if not result.get("is_known_bad"):
        return {"is_known_bad": False, "address": address}
    return result


@router.get("/darkweb/search")
def search_osint(
    q:        str            = Query(..., description="Search query — label, tag, or partial address"),
    category: str | None     = Query(None, description="Filter by category (apt, ransomware, mixer, etc.)"),
    chain:    str | None     = Query(None, description="Filter by chain (eth, btc, polygon)"),
    limit:    int            = Query(20,   description="Max results", ge=1, le=100),
):
    """
    Full-text search across the OSINT database.
    Searches by label, entity name, tags, and partial address.
    """
    if len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters")

    results = search_db(q, category=category, chain=chain, limit=limit)
    return {
        "query":   q,
        "filters": {"category": category, "chain": chain},
        "count":   len(results),
        "results": results,
    }


@router.get("/darkweb/entity/{entity_id}")
def get_entity_profile(entity_id: str):
    """
    Get the full cross-chain profile of a known criminal entity.
    Returns all addresses attributed to this entity across all chains.
    """
    entity = get_entity(entity_id)
    if not entity:
        raise HTTPException(
            status_code=404,
            detail=f"Entity '{entity_id}' not found in OSINT database"
        )
    return entity


@router.get("/darkweb/entities")
def list_entities(
    category: str | None = Query(None, description="Filter by category"),
    limit:    int        = Query(50,   ge=1, le=200),
):
    """
    List all known entities in the OSINT database.
    """
    entities = []
    for eid, addresses in ENTITY_INDEX.items():
        if not addresses:
            continue
        sample = addresses[0]
        if category and sample.get("category") != category:
            continue
        entities.append({
            "entity_id":       eid,
            "label":           sample["label"].split(" (")[0],
            "category":        sample["category"],
            "source":          sample["source"],
            "chains":          list({a["chain"] for a in addresses}),
            "address_count":   len(addresses),
        })
        if len(entities) >= limit:
            break
    return {"count": len(entities), "entities": entities}
