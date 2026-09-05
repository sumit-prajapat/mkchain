# 🔗 MKChain — Blockchain Forensics Intelligence Platform

> Open-source alternative to Chainalysis for tracing crypto transactions linked to drug markets, ransomware, APT groups, and OFAC-sanctioned entities.

![Status](https://img.shields.io/badge/Status-Production-brightgreen)
![Backend](https://img.shields.io/badge/Backend-HuggingFace-yellow)
![Frontend](https://img.shields.io/badge/Frontend-Vercel-black)
![Database](https://img.shields.io/badge/Database-Supabase-green)

**🚀 Live Demo:** [mkchain.vercel.app](https://mkchain.vercel.app)
**📡 API:** [mk1311-mkchain-api.hf.space](https://mk1311-mk1311-mkchain-api.hf.space)
**📚 Docs:** [See /docs folder](./docs/)

---

## ✨ Features

- **Multi-chain support** - Ethereum, Bitcoin, Polygon with multi-hop graph traversal
- **ML risk scoring** - Random Forest model with 21 features, 2300+ training samples
- **Pattern detection** - 9 behavioral detectors: mixers, peel chains, structuring, velocity
- **Dark web OSINT** - 100+ flagged addresses (OFAC, Lazarus Group, Hydra, WannaCry)
- **3D graph visualization** - Three.js interactive transaction network
- **2D force graph** - D3.js force-directed layout
- **AI summaries** - Groq Llama-3.1 analyst narratives
- **PDF reports** - Professional forensic reports with ReportLab
- **Real-time alerts** - SSE-based watchlist monitoring
- **Wallet comparison** - Side-by-side risk analysis

---

## 📂 Project Structure

```
mkchain/
├── frontend/              # Vite + React + TanStack Router (Lovable-generated)
│   ├── src/
│   │   ├── routes/       # File-based routing
│   │   ├── components/   # UI components (RiskGauge, Graph3D, etc.)
│   │   └── lib/          # API client, utilities
│   ├── package.json
│   └── vite.config.ts
│
├── backend/              # FastAPI + PostgreSQL
│   ├── main.py           # FastAPI app entry
│   ├── models.py         # SQLAlchemy database models
│   ├── routes/           # API endpoints
│   ├── services/         # Business logic
│   ├── ml/               # Machine learning
│   └── requirements.txt
│
├── database/             # Supabase SQL schemas & migrations
│   ├── migrations/
│   ├── schemas/
│   └── seed-data/
│
├── docs/                 # Documentation
│   ├── API.md
│   └── DEPLOYMENT.md
│
└── README.md             # This file
```

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites
- Node.js 18+ & npm
- Python 3.11+
- PostgreSQL 14+ (or Supabase account)
- API keys: Etherscan, BlockCypher (free tiers available)

### 1. Clone & Install
```bash
git clone https://github.com/sumit-prajapat/mkchain.git
cd mkchain

# Install frontend
cd frontend && npm install && cd ..

# Install backend
cd backend && pip install -r requirements.txt && cd ..
```

### 2. Configure Environment
```bash
# Copy template
cp .env.example .env.local

# Edit .env.local with your keys:
# - DATABASE_URL (Supabase connection string)
# - SUPABASE_URL, SUPABASE_ANON_KEY
# - ETHERSCAN_API_KEY, BLOCKCYPHER_TOKEN
# - GROQ_API_KEY (optional)
```

### 3. Run Development Servers
```bash
# Terminal 1: Frontend (http://localhost:5173)
cd frontend && npm run dev

# Terminal 2: Backend (http://localhost:8000)
cd backend && uvicorn main:app --reload
```

### 4. Test
Visit [http://localhost:5173](http://localhost:5173), click 'Start analysis', paste a demo wallet, and run!

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/analyze | Run forensic analysis on address |
| GET | /api/analyses | List past analyses (paginated) |
| GET | /api/analyses/{id} | Get specific analysis results |
| GET | /api/reports/{id}/pdf | Download PDF report |
| POST | /api/reports/{id}/ai-summary | Regenerate AI summary |
| GET | /api/darkweb/stats | OSINT database statistics |
| POST | /api/compare | Compare two wallets |
| POST | /api/alerts/watch | Add address to watchlist |
| GET | /api/alerts/stream | SSE event stream for alerts |

Full API docs: [docs/API.md](./docs/API.md)

---

## 🎨 Tech Stack

**Frontend:** Vite 8 + React 19 + TanStack Router + Tailwind CSS 4 + Three.js + D3.js
**Backend:** FastAPI + SQLAlchemy + NetworkX + scikit-learn + ReportLab + Groq API
**Database:** PostgreSQL (Supabase) with Row-Level Security
**Deployment:** Vercel (Frontend) + HuggingFace Spaces (Backend)

---

## 🚢 Deployment

### Frontend (Vercel)
```bash
cd frontend && vercel --prod
```

### Backend (HuggingFace Spaces)
Already deployed at: https://mk1311-mk1311-mkchain-api.hf.space

Full deployment guide: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)

---

## 📊 Roadmap

- [x] Multi-chain analysis (ETH, BTC, Polygon)
- [x] ML risk scoring (Random Forest)
- [x] Pattern detection (9 detectors)
- [x] Dark web OSINT matching
- [x] 3D/2D graph visualizations
- [x] AI summaries + PDF reports
- [x] Production deployment
- [ ] Mobile app
- [ ] Advanced ML (GNN)
- [ ] Multi-user orgs

---

## 🔗 Links

- **Live App:** https://mkchain.vercel.app
- **API Docs:** https://mk1311-mkchain-api.hf.space/docs
- **GitHub:** https://github.com/sumit-prajapat/mkchain

---

Built by **MKChain Team** · [GitHub](https://github.com/sumit-prajapat)

**Disclaimer:** MKChain is an investigative tool. Analytical output is investigative signal, not legal determination.
