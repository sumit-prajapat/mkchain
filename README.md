# 🔗 MKChain — Blockchain Forensics Intelligence Platform

> Open-source Chainalysis alternative for tracing crypto transactions linked to drug markets, ransomware, APT groups, and OFAC-sanctioned entities.

![Risk Score](https://img.shields.io/badge/Risk_Engine-ML_RandomForest-red)
![Chains](https://img.shields.io/badge/Chains-ETH_BTC_Polygon-blue)
![Phase](https://img.shields.io/badge/Phase-5_Complete-green)

---

## 🧠 Features

| Feature | Detail |
|---|---|
| **Multi-chain support** | Ethereum, Bitcoin, Polygon |
| **Multi-hop graph** | BFS up to 3 hops, NetworkX |
| **Pattern detection** | 9 patterns: mixer, peel chain, structuring, velocity... |
| **ML risk scoring** | Random Forest, 21 features, 2300 training samples |
| **Dark web OSINT** | 100+ known bad addresses (OFAC, Lazarus, Hydra, WannaCry...) |
| **AI summaries** | Groq Llama-3.1 with rule-based fallback |
| **PDF reports** | ReportLab professional forensics PDF |
| **3D graph viz** | Three.js interactive 3D transaction network |
| **2D graph viz** | D3.js force-directed graph |

---

## 🗂 Project Structure

```
mkchain/
├── backend/
│   ├── main.py                 # FastAPI entry point
│   ├── models.py               # SQLAlchemy DB tables
│   ├── schemas.py              # Pydantic request/response
│   ├── database.py             # PostgreSQL connection
│   ├── routes/
│   │   ├── analysis.py         # POST /api/analyze
│   │   └── reports.py          # GET /api/reports/{id}/pdf
│   ├── services/
│   │   ├── blockchain.py       # Etherscan + BlockCypher APIs
│   │   ├── graph.py            # Multi-hop graph builder
│   │   ├── darkweb.py          # OFAC + dark web DB (100+ addresses)
│   │   ├── ai_summary.py       # Groq Llama-3 summaries
│   │   └── pdf_report.py       # ReportLab PDF generator
│   └── ml/
│       ├── risk_scorer.py      # Random Forest ML model
│       └── risk_model.pkl      # Pre-trained model
└── frontend/
    └── src/
        ├── components/
        │   ├── Graph3D.jsx      # Three.js 3D graph
        │   ├── TransactionGraph.jsx  # D3.js 2D graph
        │   ├── RiskGauge.jsx    # Animated SVG gauge
        │   └── RiskFactors.jsx  # Risk flag cards
        └── pages/
            ├── Home.jsx
            ├── Analyze.jsx
            ├── Results.jsx
            └── History.jsx
```

---

## 🚀 Local Setup

### Backend
```bash
cd mkchain
cp backend/.env.example backend/.env
# Fill in your API keys in backend/.env
docker-compose up
```

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
# → http://localhost:5173
```

### .env keys needed
```
DATABASE_URL=postgresql://mkchain:mkchain123@localhost:5432/mkchain
ETHERSCAN_API_KEY=your_key
BLOCKCYPHER_TOKEN=your_token
GROQ_API_KEY=your_key        # optional — rule-based fallback if missing
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/analyze` | Full forensic analysis |
| GET | `/api/analyses` | List recent analyses |
| GET | `/api/analyses/{id}` | Get specific analysis |
| GET | `/api/reports/{id}/pdf` | Download PDF report |
| POST | `/api/reports/{id}/ai-summary` | Regenerate AI summary |

---

## 🏗 Phases

- ✅ Phase 0 — FastAPI backend + PostgreSQL + blockchain APIs
- ✅ Phase 1 — Multi-hop graph builder + 9 pattern detectors
- ✅ Phase 2 — ML risk scoring (Random Forest, 21 features)
- ✅ Phase 3 — React frontend + cyberpunk UI
- ✅ Phase 4 — Three.js 3D graph + D3.js 2D graph
- ✅ Phase 5 — Groq AI summaries + ReportLab PDF reports
- 🔜 Phase 6 — Dark web OSINT expansion
- 🔜 Phase 7 — Deploy: Vercel + HuggingFace + Supabase

---

Built for Smart India Hackathon (SIH) · MIT License
