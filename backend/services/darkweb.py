"""
MKChain — Dark Web & OFAC Address Database
Checks wallet addresses against known bad address databases
"""

# Public domain known bad addresses (from OFAC SDN list, public Chainalysis reports, etc.)
# These are REAL publicly known malicious addresses from public sources

DARKWEB_ADDRESSES = {
    # Hydra Market (sanctioned by OFAC 2022)
    "0x7f367cc41522ce07553e823bf3be79a889debe1b",
    "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b",
    # Lazarus Group (North Korea - OFAC sanctioned)
    "0x098b716b8aaf21512996dc57eb0615e2383e2f96",
    "0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b",
    "0x3cffd56b47278a3e29d7965a32fa7ef55c4a7c4a",
    "0x53b6936513e738f44fb50d2b9476730c0103ff00",
    # Ronin Bridge Hack (Lazarus)
    "0x098b716b8aaf21512996dc57eb0615e2383e2f96",
    # BitFinex Hack addresses (publicly known)
    "1CGA1S7gTmEMBBSFxdHLByHr1MzLAigjNk",
    "1JZEo4MVVB5sFQpSP5dXDh4BxdGdGFKBbS",
    # Silk Road (publicly identified)
    "1FfmbHfnpaZjKFvyi1okTjJJusN455paPH",
    # WannaCry ransomware wallets (publicly known)
    "115p7UMMngoj1pMvkpHijcRdfJNXj6LrLn",
    "12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw",
    "13AM4VW2dhxYgXeQepoHkHSQuy6NgaEb94",
}

CATEGORY_MAP = {
    "0x7f367cc41522ce07553e823bf3be79a889debe1b": ("darkweb", "Hydra Market - OFAC Sanctioned"),
    "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b": ("mixer", "Tornado Cash - OFAC Sanctioned"),
    "0x098b716b8aaf21512996dc57eb0615e2383e2f96": ("darkweb", "Lazarus Group - OFAC Sanctioned"),
    "0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b": ("darkweb", "Lazarus Group - OFAC Sanctioned"),
    "0x3cffd56b47278a3e29d7965a32fa7ef55c4a7c4a": ("darkweb", "Lazarus Group - OFAC Sanctioned"),
    "0x53b6936513e738f44fb50d2b9476730c0103ff00": ("darkweb", "Lazarus Group - OFAC Sanctioned"),
    "1FfmbHfnpaZjKFvyi1okTjJJusN455paPH": ("darkweb", "Silk Road - Seized by FBI"),
    "115p7UMMngoj1pMvkpHijcRdfJNXj6LrLn": ("ransomware", "WannaCry Ransomware Wallet"),
    "12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw": ("ransomware", "WannaCry Ransomware Wallet"),
    "13AM4VW2dhxYgXeQepoHkHSQuy6NgaEb94": ("ransomware", "WannaCry Ransomware Wallet"),
    "1CGA1S7gTmEMBBSFxdHLByHr1MzLAigjNk": ("exchange_hack", "BitFinex Hack - Identified"),
}


def check_darkweb(address: str) -> dict:
    """Check if an address appears in known bad address database."""
    addr = address.lower()
    if addr in DARKWEB_ADDRESSES or address in DARKWEB_ADDRESSES:
        info = CATEGORY_MAP.get(addr) or CATEGORY_MAP.get(address)
        return {
            "is_known_bad": True,
            "category":     info[0] if info else "unknown",
            "label":        info[1] if info else "Known Malicious Address",
            "source":       "OFAC SDN / Public Blockchain Forensics Reports",
        }
    return {"is_known_bad": False}


def check_all_addresses(addresses: list) -> list:
    """Check a list of addresses and return matches."""
    matches = []
    for addr in addresses:
        result = check_darkweb(addr)
        if result["is_known_bad"]:
            matches.append({"address": addr, **result})
    return matches
