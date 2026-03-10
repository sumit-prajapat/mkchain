from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
from models import Base
from routes import analysis, reports, osint
import os

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MKChain — Blockchain Forensics Intelligence Platform",
    description="Multi-chain transaction tracing, ML risk scoring, and forensics reporting.",
    version="1.0.0",
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "")

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
]
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


@app.get("/", tags=["Health"])
def health():
    return {
        "status":  "ok",
        "project": "MKChain — Blockchain Forensics Intelligence Platform",
        "chains":  ["ETH", "BTC", "POLYGON"],
        "version": "1.0.0",
    }
