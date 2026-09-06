from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
from models import Base
from routes import analysis, reports, osint, compare, alerts, btc, organizations, billing
from middleware.auth import auth_middleware
from middleware.usage_enforcer import usage_enforcer_middleware
from services.background_jobs import initialize_scheduler, shutdown_scheduler
from database import get_db
import os
import logging
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)
logger = logging.getLogger(__name__)

# Import models to ensure they're registered with Base.metadata
import models_organization
import models_billing

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MKChain — Blockchain Forensics Intelligence Platform",
    description="Multi-chain transaction tracing, ML risk scoring, and forensics reporting with multi-tenant support.",
    version="2.0.0",
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "")
origins = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080", "https://mkchain.vercel.app"]
if FRONTEND_URL:
    origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add JWT authentication middleware (runs first - sets org_id in request.state)
app.middleware('http')(auth_middleware)

# Add usage enforcement middleware (runs after auth - requires org_id)
app.middleware('http')(usage_enforcer_middleware)

# API Routes
app.include_router(organizations.router, tags=["Organizations"])  # NEW: Multi-tenancy
app.include_router(billing.router, tags=["Billing"])  # NEW: Subscription billing
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
        "features": ["analysis","compare","alerts","btc-deep","osint","pdf-reports","multi-tenant"],
        "demo_mode": os.getenv("DEMO_MODE", "false"),
    }


# Application lifecycle events
@app.on_event("startup")
async def startup_event():
    """Initialize background job scheduler on application startup"""
    try:
        logger.info("🚀 Starting MKChain Backend...")
        logger.info(f"Demo Mode: {os.getenv('DEMO_MODE', 'false')}")
        logger.info(f"Billing Enabled: {os.getenv('BILLING_ENABLED', 'false')}")
        logger.info("Starting background job scheduler...")
        
        # Create a database session factory for the scheduler
        def db_session_factory():
            return next(get_db())
        
        # Initialize and start the scheduler
        initialize_scheduler(db_session_factory=db_session_factory)
        logger.info("✅ Background job scheduler started successfully")
        
    except Exception as e:
        logger.error(f"❌ Failed to start background job scheduler: {e}")
        # Don't fail the application startup if scheduler fails
        # The rest of the API should still work


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown background job scheduler on application shutdown"""
    try:
        logger.info("Shutting down background job scheduler...")
        shutdown_scheduler()
        logger.info("Background job scheduler shut down successfully")
    except Exception as e:
        logger.error(f"Error shutting down background job scheduler: {e}")
