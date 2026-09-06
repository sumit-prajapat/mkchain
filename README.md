# MKChain - Blockchain Forensics Intelligence Platform

> Enterprise-grade blockchain analysis platform for cryptocurrency investigations

[![Live](https://img.shields.io/badge/demo-live-brightgreen)](https://mkchain.vercel.app) [![API](https://img.shields.io/badge/API-HuggingFace-yellow)](https://mk1311-mk1311-mkchain-api.hf.space) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)


[![Live](https://img.shields.io/badge/demo-live-brightgreen)](https://mkchain.vercel.app) [![API](https://img.shields.io/badge/API-HuggingFace-yellow)](https://mk1311-mk1311-mkchain-api.hf.space) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Overview

MKChain provides professional blockchain forensics for tracking cryptocurrency flows. Built for investigators, compliance teams, and security researchers.

### Key Features

- Multi-Chain Analysis - Ethereum, Bitcoin, Polygon
- ML Risk Scoring - Random Forest with 2,300+ samples
- Pattern Detection - Mixers, peel chains, structuring
- Dark Web Intelligence - OFAC, threat actors
- 3D/2D Graph Visualization
- AI-Powered Reports
- Multi-Tenant Architecture
- Real-Time Monitoring


### Live Demo

- Web: https://mkchain.vercel.app
- API: https://mk1311-mk1311-mkchain-api.hf.space/docs

Try: 0x28c6c06298d514db089934071355e5743bf21d60 (Binance)

---


## Tech Stack

**Frontend:** React 19, TypeScript, TanStack Router, Tailwind CSS, Three.js, D3.js

**Backend:** FastAPI, SQLAlchemy, NetworkX, scikit-learn, ReportLab

**Infrastructure:** Supabase, Vercel, HuggingFace Spaces

---


## Quick Start

Clone: git clone https://github.com/sumit-prajapat/mkchain.git

Backend: cd backend && pip install -r requirements.txt && uvicorn main:app --reload

Frontend: cd frontend && npm install && npm run dev

Visit: http://localhost:5173

---


## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/analyze | Run forensic analysis |
| GET | /api/analyses | List analyses |
| POST | /api/compare | Compare wallets |
| GET | /api/reports/{id}/pdf | Download PDF |

Docs: http://localhost:8000/docs

---


## License

MIT License - see [LICENSE](LICENSE)

---

## Links

- Live: https://mkchain.vercel.app
- API: https://mk1311-mk1311-mkchain-api.hf.space/docs
- GitHub: https://github.com/sumit-prajapat/mkchain

**Built with ❤️ by MKChain Team**

