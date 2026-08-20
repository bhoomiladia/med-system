# Medicine Prescription Savings Intelligence System

A full-stack web application that analyzes medical prescriptions to identify potential savings by comparing branded medicine prices with equivalent generic alternatives.

## Architecture

```
Frontend (Next.js)  ←→  REST API  ←→  Backend (FastAPI)
                                          ├── OCR Service
                                          ├── Medicine Parser
                                          ├── Composition Scraper (1mg)
                                          ├── Price Discovery Agents
                                          ├── Statistical Engine
                                          ├── Savings Engine
                                          └── SQLite Database
```

### Pipeline Flow

```
Prescription Upload → OCR → Medicine Extraction → Composition Discovery (1mg)
→ Composition Normalization → Parallel Branded Price Discovery
→ Parallel Generic Price Discovery → Price Normalization
→ Statistical Consensus (IQR Outlier Removal) → Savings Calculation → Dashboard
```

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Tesseract OCR (`brew install tesseract` on macOS)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The application runs at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Medical Disclaimer

This application is a **price comparison and savings estimation tool**. It does NOT provide medical advice. Any medication changes should be confirmed with a licensed healthcare professional.

## License

MIT
