from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
from models import Base
from routes import analysis, reports, osint, compare, alerts, btc
import os

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MKChain — Blockchain Forensics Intelligence Platform",
    description="Multi-chain transaction tracing, ML risk scoring, and forensics reporting.",
    version="2.0.0",
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "")
origins = ["http://localhost:5173", "http://localhost:3000"]
if FRONTEND_URL:
    origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis.router, prefix="/api", tags=["Analysis"])
app.include_router(reports.router,  prefix="/api", tags=["Reports"])
app.include_router(osint.router,    prefix="/api", tags=["OSINT"])
app.include_router(compare.router,  prefix="/api", tags=["Compare"])
app.include_router(alerts.router,   prefix="/api", tags=["Alerts"])
app.include_router(btc.router,      prefix="/api", tags=["Bitcoin"])


@app.get("/", tags=["Health"])
def health():
    return {
        "status":   "ok",
        "project":  "MKChain — Blockchain Forensics Intelligence Platform",
        "chains":   ["ETH", "BTC", "POLYGON"],
        "version":  "2.0.0",
        "features": ["analysis","compare","alerts","btc-deep","osint","pdf-reports"],
    }
