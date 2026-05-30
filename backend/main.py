import models  # registers all models with Base — must be before create_all
import time
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from database import engine
from models import Base
from routes import analysis, reports, osint, compare, alerts, btc, dashboard

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="MKChain — Blockchain Forensics Intelligence Platform",
    description="Multi-chain transaction tracing, ML risk scoring, and forensics reporting.",
    version="2.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
FRONTEND_URL = os.getenv("FRONTEND_URL", "")
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
]
if FRONTEND_URL and FRONTEND_URL not in origins:
    origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(analysis.router,  prefix="/api", tags=["Analysis"])
app.include_router(reports.router,   prefix="/api", tags=["Reports"])
app.include_router(osint.router,     prefix="/api", tags=["OSINT"])
app.include_router(compare.router,   prefix="/api", tags=["Compare"])
app.include_router(alerts.router,    prefix="/api", tags=["Alerts"])
app.include_router(btc.router,       prefix="/api", tags=["Bitcoin"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])


# ── Startup: wait for DB then create all tables ───────────────────────────────
# This runs in the WORKER process (not the reloader), after uvicorn is ready.
# Module-level create_all fails with --reload because it runs in the reloader
# process before PostgreSQL accepts connections.
@app.on_event("startup")
async def startup():
    max_retries = 20
    for i in range(max_retries):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            Base.metadata.create_all(bind=engine)
            print("✅ Database connected and tables created")
            return
        except Exception as e:
            print(f"⏳ DB not ready yet ({i+1}/{max_retries}): {e}")
            time.sleep(3)
    print("❌ Failed to connect to database after all retries")


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def health():
    return {
        "status":   "ok",
        "project":  "MKChain — Blockchain Forensics Intelligence Platform",
        "chains":   ["ETH", "BTC", "POLYGON"],
        "version":  "2.0.0",
        "features": ["analysis", "compare", "alerts", "btc-deep", "osint", "pdf-reports"],
    }