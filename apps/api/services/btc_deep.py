"""
MKChain — Bitcoin Deep Dive Analysis Service
UTXO tracing, CoinJoin detection, coin age analysis, address clustering
"""
import httpx
import os
from datetime import datetime, timezone

BLOCKCYPHER_KEY = os.getenv("BLOCKCYPHER_TOKEN", "")
BASE = "https://api.blockcypher.com/v1/btc/main"


async def fetch_address_full(address: str) -> dict:
    """Fetch full address data from BlockCypher."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{BASE}/addrs/{address}/full",
                             params={"token": BLOCKCYPHER_KEY, "limit": 50})
        if r.status_code != 200:
            return {}
        return r.json()


async def fetch_tx_detail(tx_hash: str) -> dict:
    """Fetch single transaction detail."""
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{BASE}/txs/{tx_hash}",
                             params={"token": BLOCKCYPHER_KEY})
        if r.status_code != 200:
            return {}
        return r.json()


def detect_coinjoin(tx: dict) -> dict:
    """
    Detect CoinJoin transactions based on heuristics:
    - Equal output amounts (main CoinJoin signal)
    - High input count (≥3)
    - High output count (≥3)
    - Multiple distinct input addresses
    """
    inputs  = tx.get("inputs", [])
    outputs = tx.get("outputs", [])

    if len(inputs) < 3 or len(outputs) < 3:
        return {"is_coinjoin": False, "confidence": 0, "reason": "Too few inputs/outputs"}

    input_addrs  = [i.get("addresses", [""])[0] for i in inputs]
    output_vals  = [o.get("value", 0) for o in outputs]

    distinct_inputs = len(set(input_addrs))
    if distinct_inputs < 2:
        return {"is_coinjoin": False, "confidence": 0, "reason": "Single input address"}

    # Check for equal output amounts (Wasabi/JoinMarket pattern)
    from collections import Counter
    val_counts  = Counter(output_vals)
    most_common_val, most_common_count = val_counts.most_common(1)[0]
    equal_output_ratio = most_common_count / len(outputs)

    confidence = 0
    reasons    = []

    if equal_output_ratio >= 0.5:
        confidence += 60
        reasons.append(f"{most_common_count} equal outputs of {most_common_val/1e8:.8f} BTC")

    if distinct_inputs >= 5:
        confidence += 20
        reasons.append(f"{distinct_inputs} distinct input addresses")

    if len(outputs) >= 5:
        confidence += 10
        reasons.append(f"{len(outputs)} outputs")

    if len(inputs) >= 5:
        confidence += 10
        reasons.append(f"{len(inputs)} inputs")

    return {
        "is_coinjoin":        confidence >= 60,
        "confidence":         min(confidence, 100),
        "equal_output_ratio": round(equal_output_ratio, 3),
        "distinct_inputs":    distinct_inputs,
        "input_count":        len(inputs),
        "output_count":       len(outputs),
        "reason":             "; ".join(reasons) if reasons else "Low confidence",
    }


def compute_utxo_analysis(data: dict, address: str) -> dict:
    """Analyze UTXO-related metrics."""
    txrefs    = data.get("txrefs", []) + data.get("unconfirmed_txrefs", [])
    balance   = data.get("balance", 0) / 1e8
    total_rx  = data.get("total_received", 0) / 1e8
    total_sent= data.get("total_sent", 0) / 1e8
    utxo_count= data.get("final_n_tx", data.get("n_tx", 0))

    # Spent vs unspent ratio
    spent   = [t for t in txrefs if t.get("spent", False)]
    unspent = [t for t in txrefs if not t.get("spent", True)]

    # Average UTXO value
    unspent_vals = [u.get("value", 0)/1e8 for u in unspent]
    avg_utxo     = sum(unspent_vals) / len(unspent_vals) if unspent_vals else 0

    # Address reuse detection (single address with many txs = potential reuse risk)
    reuse_risk = "HIGH" if utxo_count > 50 else "MEDIUM" if utxo_count > 20 else "LOW"

    return {
        "balance":          round(balance, 8),
        "total_received":   round(total_rx, 8),
        "total_sent":       round(total_sent, 8),
        "n_tx":             utxo_count,
        "spent_outputs":    len(spent),
        "unspent_outputs":  len(unspent),
        "avg_utxo_value":   round(avg_utxo, 8),
        "address_reuse_risk": reuse_risk,
    }


def compute_coin_age(txs: list, address: str) -> dict:
    """
    Estimate coin age — how long coins sit before moving.
    Key AML indicator: very short coin age = layering.
    """
    ages = []
    now  = datetime.now(timezone.utc)

    for tx in txs[:30]:
        confirmed = tx.get("confirmed")
        if not confirmed:
            continue
        try:
            if isinstance(confirmed, str):
                dt = datetime.fromisoformat(confirmed.replace("Z", "+00:00"))
            else:
                continue
            age_days = (now - dt).days
            ages.append(age_days)
        except Exception:
            continue

    if not ages:
        return {"avg_coin_age_days": None, "min_age": None, "max_age": None, "rapid_movement": False}

    avg_age = sum(ages) / len(ages)
    return {
        "avg_coin_age_days": round(avg_age, 1),
        "min_age_days":      min(ages),
        "max_age_days":      max(ages),
        "rapid_movement":    avg_age < 2,        # < 2 days = highly suspicious
        "layering_risk":     "HIGH" if avg_age < 1 else "MEDIUM" if avg_age < 7 else "LOW",
    }


def detect_script_types(data: dict) -> dict:
    """Detect Bitcoin script types in use (P2PKH, P2SH, P2WPKH, P2WSH)."""
    address = data.get("address", "")
    if address.startswith("bc1q"):
        script_type = "P2WPKH"
        privacy     = "MEDIUM"
        note        = "Native SegWit — standard modern address"
    elif address.startswith("bc1p"):
        script_type = "P2TR"
        privacy     = "HIGH"
        note        = "Taproot — highest privacy Bitcoin address type"
    elif address.startswith("3"):
        script_type = "P2SH"
        privacy     = "MEDIUM"
        note        = "P2SH — could be multisig or wrapped SegWit"
    elif address.startswith("1"):
        script_type = "P2PKH"
        privacy     = "LOW"
        note        = "Legacy address — all transactions fully traceable"
    else:
        script_type = "UNKNOWN"
        privacy     = "UNKNOWN"
        note        = "Unrecognized address format"

    return {"script_type": script_type, "privacy_level": privacy, "note": note}


def detect_clustering_signals(txs: list, address: str) -> dict:
    """
    Detect common-input-ownership clustering signals.
    If multiple inputs in same tx from different addresses → those addresses
    are likely controlled by same entity (common heuristic).
    """
    co_spent = set()
    for tx in txs[:20]:
        inputs      = tx.get("inputs", [])
        input_addrs = [i.get("addresses", [""])[0] for i in inputs if i.get("addresses")]
        if address in input_addrs and len(input_addrs) > 1:
            for a in input_addrs:
                if a != address:
                    co_spent.add(a)

    return {
        "co_spent_addresses":  list(co_spent)[:10],
        "cluster_size_hint":   len(co_spent),
        "likely_same_wallet":  len(co_spent) > 0,
        "note": f"{len(co_spent)} addresses likely controlled by same entity" if co_spent else "No clustering signals detected",
    }


async def full_btc_analysis(address: str) -> dict:
    """Run full BTC deep dive analysis."""
    data = await fetch_address_full(address)
    if not data:
        return {"error": "Could not fetch BTC address data"}

    txs = data.get("txs", [])

    # CoinJoin scan on recent transactions
    coinjoin_txs = []
    for tx in txs[:15]:
        cj = detect_coinjoin(tx)
        if cj["is_coinjoin"]:
            coinjoin_txs.append({
                "tx_hash":    tx.get("hash", ""),
                "confidence": cj["confidence"],
                "reason":     cj["reason"],
            })

    utxo     = compute_utxo_analysis(data, address)
    coin_age = compute_coin_age(txs, address)
    script   = detect_script_types(data)
    cluster  = detect_clustering_signals(txs, address)

    # Overall BTC-specific risk flags
    btc_flags = []
    if coinjoin_txs:
        btc_flags.append("coinjoin_detected")
    if coin_age.get("rapid_movement"):
        btc_flags.append("rapid_coin_movement")
    if cluster["likely_same_wallet"] and cluster["cluster_size_hint"] > 5:
        btc_flags.append("large_address_cluster")
    if utxo["address_reuse_risk"] == "HIGH":
        btc_flags.append("address_reuse")

    return {
        "address":         address,
        "chain":           "btc",
        "utxo":            utxo,
        "coin_age":        coin_age,
        "script_type":     script,
        "clustering":      cluster,
        "coinjoin_txs":    coinjoin_txs,
        "btc_flags":       btc_flags,
        "raw_tx_count":    len(txs),
    }
