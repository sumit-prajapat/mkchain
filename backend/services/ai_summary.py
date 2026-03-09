"""
services/ai_summary.py
AI Summary Service — Groq + Llama 3.1 8B
Generates plain-English forensics summaries.
Falls back to rule-based summary if GROQ_API_KEY is not set.
"""
import os

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY", "")
        if api_key:
            try:
                from groq import Groq
                _client = Groq(api_key=api_key)
            except Exception:
                pass
    return _client


def generate_ai_summary(
    address: str,
    chain: str,
    risk_score: float,
    risk_label: str,
    flags: list,
    total_txns: int,
    total_volume: float,
    darkweb_hits: list,
    graph_stats: dict,
) -> str:
    """
    Generate a forensics summary.
    Uses Groq Llama-3 if available, otherwise deterministic rule-based fallback.
    """
    groq = _get_client()
    if not groq:
        return _rule_based(
            address, chain, risk_score, risk_label,
            flags, total_txns, total_volume, darkweb_hits, graph_stats,
        )

    flags_str   = ", ".join(flags) if flags else "none"
    dw_str      = ", ".join(h.get("label", "") for h in darkweb_hits) if darkweb_hits else "none"
    mixer_nodes = graph_stats.get("mixer_nodes", 0)
    total_nodes = graph_stats.get("total_nodes", 0)

    prompt = (
        "You are a blockchain forensics analyst writing a compliance report summary.\n"
        "Write exactly 3-4 sentences. Be factual and professional.\n"
        "Do NOT use bullet points. Do NOT start with 'This wallet'.\n\n"
        f"Chain: {chain.upper()}\n"
        f"Address: {address}\n"
        f"Risk Score: {risk_score:.1f}/100  Label: {risk_label}\n"
        f"Transactions: {total_txns:,}  Volume: {total_volume:.4f} {chain.upper()}\n"
        f"Risk Flags: {flags_str}\n"
        f"OFAC/DarkWeb Matches: {dw_str}\n"
        f"Graph: {total_nodes} nodes, {mixer_nodes} mixer node(s)\n"
    )

    try:
        resp = groq.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.25,
            max_tokens=250,
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return _rule_based(
            address, chain, risk_score, risk_label,
            flags, total_txns, total_volume, darkweb_hits, graph_stats,
        )


def _rule_based(
    address, chain, risk_score, risk_label,
    flags, total_txns, total_volume, darkweb_hits, graph_stats,
) -> str:
    """Deterministic fallback — no external API needed."""
    sentences = []

    # 1. Opening risk sentence
    openers = {
        "CRITICAL": (
            f"Wallet {address[:10]}...{address[-6:]} received a CRITICAL risk score of "
            f"{risk_score:.1f}/100 and requires immediate investigation."
        ),
        "HIGH": (
            f"Wallet {address[:10]}...{address[-6:]} scored {risk_score:.1f}/100 (HIGH RISK) "
            f"with {len(flags)} suspicious indicator(s) detected."
        ),
        "MEDIUM": (
            f"Wallet {address[:10]}...{address[-6:]} scored {risk_score:.1f}/100 (MEDIUM RISK) "
            f"with some behavioral patterns warranting review."
        ),
        "LOW": (
            f"Wallet {address[:10]}...{address[-6:]} scored {risk_score:.1f}/100 (LOW RISK). "
            f"No major suspicious activity was detected across {total_txns:,} transactions."
        ),
    }
    sentences.append(openers.get(risk_label, f"Wallet scored {risk_score:.1f}/100."))

    # 2. Dark web / OFAC hit
    if darkweb_hits:
        labels = [h.get("label", "unknown entity") for h in darkweb_hits]
        sentences.append(
            f"Address matched OFAC sanctions / dark web intelligence entries: {', '.join(labels)}."
        )

    # 3. Most critical flag
    flag_sentences = {
        "mixer_interaction":        "Direct interaction with a known Tornado Cash mixer contract was confirmed.",
        "peel_chain_detected":      "A peel chain pattern was identified — funds progressively split across hops to obscure origin.",
        "layered_mixer_routing":    "Layered mixer routing through intermediate wallets indicates deliberate obfuscation of fund flows.",
        "high_velocity":            f"High transaction velocity was observed across {total_txns:,} total on-chain transactions.",
        "round_amount_structuring": "Round-value transaction structuring was detected, consistent with AML threshold evasion.",
        "dormancy_then_activity":   "An extended dormancy period followed by sudden high-volume activity is a known laundering indicator.",
        "mixer_proximity":          "Mixer contract addresses were identified within 2 hops of the target wallet.",
        "high_fan_out":             "An unusually high number of unique outgoing recipient addresses suggests deliberate dispersal.",
    }
    for flag in flags:
        if flag in flag_sentences:
            sentences.append(flag_sentences[flag])
            break

    # 4. Graph / volume finding
    mixer_nodes = graph_stats.get("mixer_nodes", 0)
    if mixer_nodes > 0:
        sentences.append(
            f"Multi-hop graph analysis revealed {mixer_nodes} mixer node(s) within "
            f"{graph_stats.get('max_hops', 2)} hops of the target address."
        )
    elif total_volume > 500:
        sentences.append(
            f"Total on-chain volume of {total_volume:,.2f} {chain.upper()} across "
            f"{graph_stats.get('total_nodes', 0)} connected addresses warrants further review."
        )

    return " ".join(sentences[:4])
