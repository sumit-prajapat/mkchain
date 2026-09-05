# Design: Monorepo Migration

## Architecture Overview

### Current Architecture (Legacy)
\mkchain/
├── backend/          # FastAPI monolith
├── frontend/         # Vite + React SPA
└── database/         # Migrations only
\
### Target Architecture (Monorepo)
\mkchain/
├── apps/
│   ├── api/         # FastAPI backend (migrated)
│   └── web/         # Next.js 15 frontend (new)
├── archive/         # Legacy code (post-migration)
└── database/        # Supabase migrations
\
---

## System Components

### 1. Backend API (/apps/api)

#### Directory Structure
\apps/api/
├── main.py                  # FastAPI app entry
├── requirements.txt         # Python dependencies
├── Dockerfile              # Container config
├── .env.example            # Environment template
├── core/
│   ├── config.py           # Settings (Pydantic BaseSettings)
│   ├── dependencies.py     # Dependency injection
│   ├── security.py         # JWT validation middleware
│   └── context.py          # Request context (user_id, org_id)
├── middleware/
│   └── auth.py             # Supabase JWT middleware
├── models.py               # SQLAlchemy models
├── schemas.py              # Pydantic request/response
├── database.py             # DB connection
├── routes/
│   ├── analysis.py         # Analysis endpoints
│   ├── reports.py          # PDF/AI summary
│   ├── osint.py            # Dark web OSINT
│   ├── compare.py          # Wallet comparison
│   ├── alerts.py           # Watchlist + SSE
│   └── btc.py              # Bitcoin deep dive
└── services/
    ├── blockchain.py       # Etherscan + BlockCypher
    ├── graph.py            # Multi-hop graph builder
    ├── darkweb.py          # OFAC database
    ├── ai_summary.py       # Groq integration
    ├── pdf_report.py       # ReportLab PDF
    └── btc_deep.py         # Bitcoin forensics
\
#### Authentication Flow
\┌─────────┐         ┌──────────┐         ┌─────────┐
│ Next.js │  JWT    │ FastAPI  │  Query  │Supabase │
│  /web   │────────>│Middleware│────────>│   DB    │
└─────────┘         └──────────┘         └─────────┘
    │                     │
    │ 1. Supabase Auth    │
    │ 2. Get JWT token    │
    │ 3. Send in header   │
    │                     │ 4. Validate JWT
    │                     │ 5. Extract user_id + org_id
    │                     │ 6. Add to request context
    │                     │ 7. RLS enforces isolation
\
#### Middleware Implementation
