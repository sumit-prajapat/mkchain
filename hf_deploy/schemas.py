from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class AnalyzeRequest(BaseModel):
    address: str
    chain:   str = "eth"   # eth | btc | polygon
    hops:    int = 2        # how many hops to trace (1-3)


class GraphNode(BaseModel):
    id:         str
    label:      str
    node_type:  str
    is_root:    bool
    risk_score: float
    chain:      str


class GraphEdge(BaseModel):
    source:    str
    target:    str
    value:     float
    tx_count:  int
    edge_type: str
    tx_hash:   str
    timestamp: str


class RiskFactor(BaseModel):
    factor: str
    impact: str
    detail: str


class AnalysisResponse(BaseModel):
    id:            int
    address:       str
    chain:         str
    risk_score:    float
    risk_label:    str
    total_txns:    int
    total_volume:  float
    first_seen:    Optional[str]
    last_seen:     Optional[str]
    flags:         List[str]
    ai_summary:    Optional[str]
    graph:         dict
    risk_factors:  List[dict]
    darkweb_hits:  List[dict]
    created_at:    datetime

    class Config:
        from_attributes = True


class AnalysisSummary(BaseModel):
    id:          int
    address:     str
    chain:       str
    risk_score:  float
    risk_label:  str
    total_txns:  int
    flags:       List[str]
    created_at:  datetime

    class Config:
        from_attributes = True
