"""
MKChain — Blockchain Data Fetcher
Fetches transaction data from Etherscan (ETH+Polygon) and BlockCypher (BTC)
"""

import os
import httpx
import asyncio
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

ETHERSCAN_KEY   = os.getenv("ETHERSCAN_API_KEY", "")
BLOCKCYPHER_KEY = os.getenv("BLOCKCYPHER_TOKEN", "")

# Chain configs
CHAIN_CONFIG = {
    "eth":     {"chainid": 1,   "base": "https://api.etherscan.io/v2/api",     "symbol": "ETH",   "decimals": 1e18},
    "polygon": {"chainid": 137, "base": "https://api.etherscan.io/v2/api",     "symbol": "MATIC", "decimals": 1e18},
    "btc":     {"chainid": None,"base": "https://api.blockcypher.com/v1/btc/main", "symbol": "BTC", "decimals": 1e8},
}

# Known mixer/tumbler/bridge addresses (public list)
KNOWN_MIXERS = {
    # Ethereum Tornado Cash contracts
    "0x722122df12d4e14e13ac3b6895a86e84145b6967",
    "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b",
    "0xd96f2b1c14db8458374d9aca76e26c3950113464",
    "0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfba9d",
    "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf",
    "0xa160cdab225685da1d56aa342ad8841c3b53f291",
    "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936",
    "0x23773e65ed146a459667f7bc90be37e829796f5b",
    "0x22aaa7720ddd5388a3c0a3333430953c68f1849b",
    "0x03893a7c7463ae47d46bc7f091665f1893656003",
    "0x2717c5e28cf931547b621a5dddb772ab6a35b701",
    "0x58e8dcc13be9780fc42e8723d8ead4cf46943df2",
    "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b",
    "0x901bb9583b24d97e995513c6778dc6888ab6870e",
    "0xa7e5d5a720f06526557c513402f2e6b5fa20b008",
    "0x8589427373d6d84e98730d7795d8f6f8731fda16",
    # Bitcoin mixers (Wasabi, JoinMarket coordinators)
    "bc1qs604c7jv6amk4cxqlnvuxv26hv3e48cds4m0ew",
}

# Known exchange hot wallets (lower risk - just flag as exchange)
KNOWN_EXCHANGES = {
    "0x28c6c06298d514db089934071355e5743bf21d60",  # Binance
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549",  # Binance 2
    "0xdfd5293d8e347dfe59e90efd55b2956a1343963d",  # Binance 3
    "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be",  # Binance old
    "0xa910f92acdaf488fa6ef02174fb86208ad7722ba",  # Coinbase
    "0x71660c4005ba85c37ccec55d0c4493e66fe775d3",  # Coinbase 2
    "0x503828976d22510aad0201ac7ec88293211d23da",  # Coinbase 3
}


async def fetch_eth_transactions(address: str, chain: str = "eth", limit: int = 100) -> list:
    """Fetch transactions for an ETH/Polygon address via Etherscan API V2."""
    cfg = CHAIN_CONFIG[chain]
    params = {
        "chainid":   cfg["chainid"],
        "module":    "account",
        "action":    "txlist",
        "address":   address,
        "startblock": 0,
        "endblock":  99999999,
        "page":      1,
        "offset":    limit,
        "sort":      "desc",
        "apikey":    ETHERSCAN_KEY,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(cfg["base"], params=params)
        data = resp.json()

    if data.get("status") != "1":
        return []

    txns = []
    for tx in data.get("result", []):
        txns.append({
            "hash":       tx["hash"],
            "from":       tx["from"].lower(),
            "to":         (tx.get("to") or "").lower(),
            "value":      int(tx["value"]) / cfg["decimals"],
            "timestamp":  tx["timeStamp"],
            "chain":      chain,
            "is_error":   tx.get("isError") == "1",
        })
    return txns


async def fetch_btc_transactions(address: str, limit: int = 50) -> list:
    """Fetch Bitcoin transactions via BlockCypher."""
    url = f"https://api.blockcypher.com/v1/btc/main/addrs/{address}/full"
    params = {"token": BLOCKCYPHER_KEY, "limit": limit}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, params=params)
        if resp.status_code != 200:
            return []
        data = resp.json()

    txns = []
    for tx in data.get("txs", []):
        # Determine direction
        inputs  = [i.get("addresses", [""])[0] for i in tx.get("inputs", [])]
        outputs = [o.get("addresses", [""])[0] for o in tx.get("outputs", [])]
        value   = tx.get("total", 0) / 1e8

        for out_addr in outputs:
            if out_addr and out_addr != address:
                txns.append({
                    "hash":      tx["hash"],
                    "from":      address,
                    "to":        out_addr,
                    "value":     value,
                    "timestamp": str(tx.get("confirmed", tx.get("received", ""))),
                    "chain":     "btc",
                    "is_error":  False,
                })
    return txns


async def fetch_wallet_balance(address: str, chain: str) -> dict:
    """Fetch wallet balance and basic info."""
    if chain == "btc":
        url = f"https://api.blockcypher.com/v1/btc/main/addrs/{address}/balance"
        params = {"token": BLOCKCYPHER_KEY}
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                return {}
            data = resp.json()
        return {
            "balance":    data.get("balance", 0) / 1e8,
            "total_sent": data.get("total_sent", 0) / 1e8,
            "total_recv": data.get("total_received", 0) / 1e8,
            "tx_count":   data.get("n_tx", 0),
        }
    else:
        cfg = CHAIN_CONFIG[chain]
        params = {
            "chainid": cfg["chainid"],
            "module":  "account",
            "action":  "balance",
            "address": address,
            "tag":     "latest",
            "apikey":  ETHERSCAN_KEY,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(cfg["base"], params=params)
            data = resp.json()
        balance = int(data.get("result", 0)) / cfg["decimals"]
        return {"balance": balance, "total_sent": 0, "total_recv": 0, "tx_count": 0}


def classify_address(address: str) -> str:
    """Classify an address as mixer, exchange, or normal wallet."""
    addr = address.lower()
    if addr in KNOWN_MIXERS:
        return "mixer"
    if addr in KNOWN_EXCHANGES:
        return "exchange"
    return "wallet"


def detect_mixer_interaction(txns: list) -> bool:
    """Check if any transaction involves a known mixer."""
    for tx in txns:
        if tx.get("to", "").lower() in KNOWN_MIXERS:
            return True
        if tx.get("from", "").lower() in KNOWN_MIXERS:
            return True
    return False


async def fetch_transactions(address: str, chain: str, limit: int = 100) -> list:
    """Unified transaction fetcher for all chains."""
    if chain == "btc":
        return await fetch_btc_transactions(address, limit)
    else:
        return await fetch_eth_transactions(address, chain, limit)
