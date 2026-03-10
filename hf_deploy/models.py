from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class WalletAnalysis(Base):
    __tablename__ = "wallet_analyses"

    id            = Column(Integer, primary_key=True, index=True)
    address       = Column(String, index=True)
    chain         = Column(String)           # eth | btc | polygon
    risk_score    = Column(Float, default=0)
    risk_label    = Column(String)           # LOW | MEDIUM | HIGH | CRITICAL
    total_txns    = Column(Integer, default=0)
    total_volume  = Column(Float, default=0)
    first_seen    = Column(String)
    last_seen     = Column(String)
    flags         = Column(JSON, default=list)   # ["mixer_interaction", "darkweb_match", ...]
    ai_summary    = Column(Text)
    created_at    = Column(DateTime, default=datetime.utcnow)

    transactions  = relationship("Transaction", back_populates="analysis", cascade="all, delete")
    graph_nodes   = relationship("GraphNode",   back_populates="analysis", cascade="all, delete")
    graph_edges   = relationship("GraphEdge",   back_populates="analysis", cascade="all, delete")


class Transaction(Base):
    __tablename__ = "transactions"

    id            = Column(Integer, primary_key=True, index=True)
    analysis_id   = Column(Integer, ForeignKey("wallet_analyses.id"))
    tx_hash       = Column(String, index=True)
    chain         = Column(String)
    from_address  = Column(String)
    to_address    = Column(String)
    value         = Column(Float)
    timestamp     = Column(String)
    is_mixer      = Column(Boolean, default=False)
    is_darkweb    = Column(Boolean, default=False)
    risk_flag     = Column(String)

    analysis      = relationship("WalletAnalysis", back_populates="transactions")


class GraphNode(Base):
    __tablename__ = "graph_nodes"

    id            = Column(Integer, primary_key=True, index=True)
    analysis_id   = Column(Integer, ForeignKey("wallet_analyses.id"))
    node_id       = Column(String)
    label         = Column(String)
    node_type     = Column(String)   # wallet | mixer | exchange | darkweb | bridge
    risk_score    = Column(Float, default=0)
    chain         = Column(String)
    metadata_     = Column(JSON, default=dict)

    analysis      = relationship("WalletAnalysis", back_populates="graph_nodes")


class GraphEdge(Base):
    __tablename__ = "graph_edges"

    id            = Column(Integer, primary_key=True, index=True)
    analysis_id   = Column(Integer, ForeignKey("wallet_analyses.id"))
    source        = Column(String)
    target        = Column(String)
    value         = Column(Float)
    tx_hash       = Column(String)
    timestamp     = Column(String)
    edge_type     = Column(String)   # normal | suspicious | mixer | bridge

    analysis      = relationship("WalletAnalysis", back_populates="graph_edges")


class KnownBadAddress(Base):
    __tablename__ = "known_bad_addresses"

    id            = Column(Integer, primary_key=True, index=True)
    address       = Column(String, unique=True, index=True)
    chain         = Column(String)
    category      = Column(String)   # darkweb | mixer | scam | ransomware | exchange_hack
    label         = Column(String)
    source        = Column(String)   # chainalysis_public | ofac | manual
    added_at      = Column(DateTime, default=datetime.utcnow)
