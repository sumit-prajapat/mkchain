"""
MKChain — ML Risk Scoring Engine
Random Forest classifier trained on synthetic blockchain behavior patterns.
Produces 0-100 risk score with SHAP-style explainability.
"""

import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import MinMaxScaler
from sklearn.pipeline import Pipeline
import joblib
import os

# ── Feature Names (in order) ──────────────────────────────────────────────────
FEATURE_NAMES = [
    "total_txns",
    "total_volume",
    "avg_value",
    "max_value",
    "unique_senders",
    "unique_receivers",
    "mixer_nodes_in_graph",
    "darkweb_nodes_in_graph",
    "mixer_edges_in_graph",
    "has_mixer_interaction",
    "has_peel_chain",
    "has_high_fanout",
    "has_high_fanin",
    "has_high_velocity",
    "has_round_structuring",
    "has_darkweb_match",
    "has_mixer_proximity",
    "has_layered_routing",
    "has_dormancy_activity",
    "graph_density",
    "max_hops",
]

# ── Synthetic Training Data ───────────────────────────────────────────────────
def _generate_training_data():
    """
    Generate synthetic labeled training data representing real-world
    wallet behavior patterns. Labels: 0=LOW, 1=MEDIUM, 2=HIGH, 3=CRITICAL
    """
    rng = np.random.RandomState(42)
    X, y = [], []

    # LOW risk — normal wallets (1000 samples)
    for _ in range(1000):
        X.append([
            rng.randint(1, 50),        # total_txns
            rng.uniform(0, 10),        # total_volume
            rng.uniform(0.01, 1),      # avg_value
            rng.uniform(0.1, 5),       # max_value
            rng.randint(1, 10),        # unique_senders
            rng.randint(1, 15),        # unique_receivers
            0,                          # mixer_nodes
            0,                          # darkweb_nodes
            0,                          # mixer_edges
            0,                          # has_mixer_interaction
            0,                          # has_peel_chain
            0,                          # has_high_fanout
            0,                          # has_high_fanin
            0,                          # has_high_velocity
            rng.choice([0, 1], p=[0.9, 0.1]),  # has_round_structuring
            0,                          # has_darkweb_match
            0,                          # has_mixer_proximity
            0,                          # has_layered_routing
            0,                          # has_dormancy_activity
            rng.uniform(0, 0.1),       # graph_density
            rng.randint(1, 2),         # max_hops
        ])
        y.append(0)

    # MEDIUM risk — slightly suspicious wallets (600 samples)
    for _ in range(600):
        X.append([
            rng.randint(20, 200),
            rng.uniform(5, 100),
            rng.uniform(0.1, 5),
            rng.uniform(1, 50),
            rng.randint(5, 30),
            rng.randint(10, 50),
            rng.randint(0, 1),
            0,
            rng.randint(0, 2),
            rng.choice([0, 1], p=[0.7, 0.3]),
            rng.choice([0, 1], p=[0.8, 0.2]),
            rng.choice([0, 1], p=[0.6, 0.4]),
            0,
            rng.choice([0, 1], p=[0.7, 0.3]),
            rng.choice([0, 1], p=[0.5, 0.5]),
            0,
            rng.choice([0, 1], p=[0.8, 0.2]),
            0,
            rng.choice([0, 1], p=[0.8, 0.2]),
            rng.uniform(0.1, 0.3),
            rng.randint(1, 3),
        ])
        y.append(1)

    # HIGH risk — mixer-interacting wallets (400 samples)
    for _ in range(400):
        X.append([
            rng.randint(10, 500),
            rng.uniform(10, 1000),
            rng.uniform(0.5, 20),
            rng.uniform(5, 200),
            rng.randint(2, 20),
            rng.randint(5, 100),
            rng.randint(1, 5),
            0,
            rng.randint(1, 10),
            1,                          # has_mixer_interaction = 1
            rng.choice([0, 1], p=[0.4, 0.6]),
            rng.choice([0, 1], p=[0.5, 0.5]),
            rng.choice([0, 1], p=[0.6, 0.4]),
            rng.choice([0, 1], p=[0.5, 0.5]),
            rng.choice([0, 1], p=[0.4, 0.6]),
            0,
            1,
            rng.choice([0, 1], p=[0.4, 0.6]),
            rng.choice([0, 1], p=[0.7, 0.3]),
            rng.uniform(0.2, 0.5),
            rng.randint(2, 3),
        ])
        y.append(2)

    # CRITICAL risk — darkweb + mixer + peel chain (300 samples)
    for _ in range(300):
        X.append([
            rng.randint(50, 1000),
            rng.uniform(100, 10000),
            rng.uniform(1, 50),
            rng.uniform(50, 5000),
            rng.randint(1, 10),
            rng.randint(50, 500),
            rng.randint(2, 10),
            rng.randint(1, 5),
            rng.randint(3, 20),
            1,
            1,
            1,
            rng.choice([0, 1], p=[0.3, 0.7]),
            rng.choice([0, 1], p=[0.3, 0.7]),
            1,
            rng.choice([0, 1], p=[0.4, 0.6]),
            1,
            1,
            rng.choice([0, 1], p=[0.5, 0.5]),
            rng.uniform(0.3, 0.8),
            3,
        ])
        y.append(3)

    return np.array(X), np.array(y)


# ── Train or Load Model ───────────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), "risk_model.pkl")

def _train_model():
    """Train the Random Forest risk classifier."""
    X, y = _generate_training_data()
    model = Pipeline([
        ("scaler", MinMaxScaler()),
        ("clf", RandomForestClassifier(
            n_estimators  = 200,
            max_depth     = 8,
            random_state  = 42,
            class_weight  = "balanced",
        ))
    ])
    model.fit(X, y)
    joblib.dump(model, MODEL_PATH)
    return model


def _load_model():
    if os.path.exists(MODEL_PATH):
        try:
            return joblib.load(MODEL_PATH)
        except Exception:
            pass
    return _train_model()


_MODEL = None

def get_model():
    global _MODEL
    if _MODEL is None:
        _MODEL = _load_model()
    return _MODEL


# ── Feature Extraction ────────────────────────────────────────────────────────
def extract_features(transactions: list, flags: list, graph_data: dict) -> np.ndarray:
    """Extract 21 features from wallet analysis data."""
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])
    stats = graph_data.get("stats", {})

    total_txns   = len(transactions)
    total_volume = sum(tx.get("value", 0) for tx in transactions)
    avg_value    = total_volume / max(total_txns, 1)
    max_value    = max((tx.get("value", 0) for tx in transactions), default=0)

    unique_senders   = len(set(tx.get("from","") for tx in transactions))
    unique_receivers = len(set(tx.get("to","")   for tx in transactions))

    mixer_nodes   = sum(1 for n in nodes if n.get("node_type") == "mixer")
    darkweb_nodes = sum(1 for n in nodes if n.get("node_type") == "darkweb")
    mixer_edges   = sum(1 for e in edges if e.get("edge_type") == "mixer")

    def f(flag): return int(flag in flags)

    return np.array([[
        min(total_txns,   10000),
        min(total_volume, 1e7),
        min(avg_value,    1e5),
        min(max_value,    1e6),
        min(unique_senders,   500),
        min(unique_receivers, 500),
        min(mixer_nodes,   20),
        min(darkweb_nodes, 20),
        min(mixer_edges,   50),
        f("mixer_interaction"),
        f("peel_chain_detected"),
        f("high_fan_out"),
        f("high_fan_in"),
        f("high_velocity"),
        f("round_amount_structuring"),
        f("darkweb_match"),
        f("mixer_proximity"),
        f("layered_mixer_routing"),
        f("dormancy_then_activity"),
        min(stats.get("density", 0), 1.0),
        min(stats.get("max_hops", 1), 3),
    ]])


# ── Scoring ───────────────────────────────────────────────────────────────────
LABEL_MAP    = {0: "LOW", 1: "MEDIUM", 2: "HIGH", 3: "CRITICAL"}
SCORE_RANGES = {0: (0, 24), 1: (25, 49), 2: (50, 74), 3: (75, 100)}

def ml_risk_score(transactions: list, flags: list, graph_data: dict) -> tuple:
    """
    Run ML model to produce risk score and label.
    Returns (score: float, label: str, probabilities: dict)
    """
    model    = get_model()
    features = extract_features(transactions, flags, graph_data)

    # Class probabilities
    proba     = model.predict_proba(features)[0]
    class_idx = int(np.argmax(proba))

    # Convert class probability to continuous 0-100 score
    low, high = SCORE_RANGES[class_idx]
    confidence = float(proba[class_idx])
    score = low + (high - low) * confidence

    # Blend with rule-based score for robustness
    rule_score, _ = rule_based_risk_score(flags, transactions, graph_data)
    final_score   = round(0.6 * score + 0.4 * rule_score, 1)
    final_score   = min(final_score, 100)

    # Recalculate label from final score
    if   final_score >= 75: label = "CRITICAL"
    elif final_score >= 50: label = "HIGH"
    elif final_score >= 25: label = "MEDIUM"
    else:                   label = "LOW"

    prob_dict = {LABEL_MAP[i]: round(float(p), 3) for i, p in enumerate(proba)}
    return final_score, label, prob_dict


def rule_based_risk_score(flags: list, transactions: list, graph_data: dict) -> tuple:
    """Rule-based fallback scorer."""
    score = 0
    nodes = graph_data.get("nodes", [])

    weights = {
        "mixer_interaction":        45,
        "darkweb_match":            60,
        "peel_chain_detected":      30,
        "layered_mixer_routing":    35,
        "mixer_proximity":          25,
        "high_velocity":            20,
        "round_amount_structuring": 15,
        "high_fan_out":             10,
        "high_fan_in":               8,
        "dormancy_then_activity":   12,
    }
    for flag, w in weights.items():
        if flag in flags:
            score += w

    score += min(sum(1 for n in nodes if n.get("node_type") == "mixer")   * 15, 30)
    score += min(sum(1 for n in nodes if n.get("node_type") == "darkweb") * 20, 40)
    score  = min(score, 100)

    if   score >= 75: label = "CRITICAL"
    elif score >= 50: label = "HIGH"
    elif score >= 25: label = "MEDIUM"
    else:             label = "LOW"

    return round(score, 1), label


# ── Explainability ────────────────────────────────────────────────────────────
FLAG_EXPLANATIONS = {
    "mixer_interaction": {
        "factor": "Mixer / Tumbler Interaction",
        "impact": "CRITICAL",
        "detail": "Wallet has directly transacted with a known cryptocurrency mixer (e.g., Tornado Cash). This is the strongest indicator of intentional transaction obfuscation to hide fund origins."
    },
    "darkweb_match": {
        "factor": "Dark Web / OFAC Address Match",
        "impact": "CRITICAL",
        "detail": "One or more addresses in the transaction graph appear in OFAC sanctions lists or known dark web marketplace databases (Hydra, Silk Road, Lazarus Group)."
    },
    "layered_mixer_routing": {
        "factor": "Multi-Hop Mixer Routing",
        "impact": "HIGH",
        "detail": "Funds are routed through multiple intermediate wallets before reaching a mixer — a classic layering technique used to increase forensic difficulty."
    },
    "peel_chain_detected": {
        "factor": "Peel Chain Pattern",
        "impact": "HIGH",
        "detail": "Transaction graph shows a series of single-output transfers — a Bitcoin mixing technique where small amounts are 'peeled' off sequentially to break the transaction trail."
    },
    "mixer_proximity": {
        "factor": "Mixer Proximity (2 hops)",
        "impact": "HIGH",
        "detail": "A known mixer address is reachable within 2 transaction hops from this wallet, suggesting indirect mixer usage."
    },
    "high_velocity": {
        "factor": "High Transaction Velocity",
        "impact": "MEDIUM",
        "detail": "Unusually high transaction frequency — more than 50 transactions per day. May indicate automated laundering scripts or exchange bot activity."
    },
    "round_amount_structuring": {
        "factor": "Round Amount Structuring",
        "impact": "MEDIUM",
        "detail": "Over 75% of transactions use round number amounts — a classic structuring technique to avoid triggering anti-money laundering (AML) reporting thresholds."
    },
    "high_fan_out": {
        "factor": "High Fan-Out (Layering)",
        "impact": "MEDIUM",
        "detail": "Wallet sends funds to 20+ different addresses — consistent with layering, where funds are split across many wallets to obscure the money trail."
    },
    "high_fan_in": {
        "factor": "High Fan-In (Aggregation)",
        "impact": "MEDIUM",
        "detail": "Wallet receives from 50+ different addresses — may indicate a collection wallet aggregating proceeds from multiple illicit sources."
    },
    "dormancy_then_activity": {
        "factor": "Dormancy then Sudden Activity",
        "impact": "MEDIUM",
        "detail": "Wallet was inactive for 6+ months then suddenly became active — a common pattern with dormant dark web wallets being activated to cash out."
    },
}


def get_risk_explanation(
    score: float,
    flags: list,
    transactions: list,
    chain: str,
    probabilities: dict = None,
) -> dict:
    """Generate full explainability report for the risk score."""
    factors = []

    for flag in flags:
        if flag in FLAG_EXPLANATIONS:
            factors.append(FLAG_EXPLANATIONS[flag])

    if not factors:
        factors.append({
            "factor": "No Suspicious Patterns Detected",
            "impact": "LOW",
            "detail": "Transaction history shows no known risk indicators. Wallet appears to operate normally with typical transfer patterns."
        })

    return {
        "score":         score,
        "factors":       factors,
        "total_txns":    len(transactions),
        "chain":         chain,
        "probabilities": probabilities or {},
        "ml_powered":    True,
    }
