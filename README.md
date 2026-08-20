# Medicine Savings Intelligence

A full-stack prescription analysis platform that extracts medicines from uploaded prescriptions, discovers real-time branded and generic prices across multiple sources, applies statistical consensus algorithms, and calculates potential monthly savings — with full source transparency and ML-powered accuracy evaluation.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Pipeline Stages](#pipeline-stages)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Frontend Pages](#frontend-pages)
- [LLM & AI Configuration](#llm--ai-configuration)
- [Statistical Engine](#statistical-engine)
- [ML Clustering Evaluation](#ml-clustering-evaluation)
- [Testing](#testing)
- [Medical Disclaimer](#medical-disclaimer)

---

## Overview

Patients in India often overpay for branded medicines when equivalent generics exist at a fraction of the cost. This platform automates the entire discovery process:

1. Upload a prescription image (handwritten or printed)
2. AI extracts medicine names via OCR (Gemini Vision / Tesseract)
3. Compositions are verified through real pharmacy data (1mg, DavaIndia)
4. Branded and generic prices are discovered via multi-model LLM agents + web scrapers
5. Statistical consensus (IQR outlier filtering) determines reliable prices
6. Monthly/yearly savings are calculated and presented with full source transparency

The system uses **zero mock data** — every price and composition comes from real, verifiable sources.

---

## Key Features

| Feature | Description |
|---|---|
| **Dual OCR Engine** | Gemini Vision (for handwritten prescriptions) with Tesseract fallback |
| **LLM Text Refinement** | Groq-powered OCR cleanup — strips doctor names, clinic headers, patient info; keeps only medicine data |
| **Multi-Provider Price Discovery** | Parallel queries across 4 LLM models (Groq Llama 70B, Groq Llama 8B, LM Studio Granite 3B, LM Studio Llama 3.2) with 5 temperature-varied shots each |
| **Real-Time Web Scraping** | Firecrawl + direct 1mg API scraping for live pharmacy prices |
| **Composition Verification** | Scrapes actual drug compositions from 1mg product pages, normalizes salt names and strengths |
| **IQR Statistical Consensus** | Interquartile Range outlier removal → median consensus pricing with confidence scoring |
| **ML Clustering Benchmark** | Compares K-Means, Agglomerative, DBSCAN, and Gaussian Mixture Models for price clustering accuracy |
| **Prescription-Level Accuracy Evaluation** | Per-medicine ground truth comparison with RMSE, MAE, R², MAPE metrics |
| **Real-Time SSE Pipeline** | Server-Sent Events stream every pipeline stage to the frontend in real time |
| **Intelligent Caching** | Canonical composition-based cache with 7-day TTL — avoids redundant LLM/scraper calls |
| **HTML Report Export** | One-click downloadable HTML report with savings breakdown and statistical details |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 16)                        │
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌─────────┐  ┌─────────────────┐  │
│  │  Upload   │→│  Processing  │→│ Results  │  │   Analytics     │  │
│  │  page.tsx │  │  Pipeline    │  │ + Cards  │  │  + Clustering   │  │
│  └──────────┘  │  (SSE live)  │  └─────────┘  │  + Evaluation   │  │
│                └──────────────┘               └─────────────────┘  │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP + SSE
┌────────────────────────▼────────────────────────────────────────────┐
│                     BACKEND (FastAPI + Uvicorn)                     │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Pipeline Service                          │    │
│  │  OCR → Refine → Parse → DB Lookup → Composition →           │    │
│  │  Price Discovery → Statistical Consensus → Savings           │    │
│  └──────┬──────────────┬──────────────┬────────────────────────┘    │
│         │              │              │                              │
│  ┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼──────┐                      │
│  │  LLM Router │ │ Scrapers  │ │ Statistical│                      │
│  │  (4 models) │ │ (1mg,     │ │ Engine     │                      │
│  │  Groq, LM   │ │ Firecrawl)│ │ (IQR,     │                      │
│  │  Studio,    │ │           │ │  Median)   │                      │
│  │  Gemini     │ └───────────┘ └────────────┘                      │
│  └─────────────┘                                                    │
│                                                                     │
│  ┌─────────────────┐  ┌──────────────────────────────────────┐     │
│  │  SQLite + async  │  │  Evaluation Engine (scikit-learn)    │     │
│  │  SQLAlchemy ORM  │  │  K-Means, DBSCAN, GMM, Agglom.     │     │
│  └─────────────────┘  └──────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Pipeline Stages

The system executes a 10-stage pipeline for each prescription, streamed in real time via SSE:

| Stage | Name | Description |
|-------|------|-------------|
| 1 | **Upload** | File received, validated (max 10MB), saved to disk |
| 2 | **OCR** | Gemini Vision multimodal extraction (handwriting-aware) with Tesseract fallback |
| 3 | **Refine** | LLM (Groq) cleans OCR noise — removes doctor/clinic/patient text, keeps only medicine lines |
| 4 | **Parse** | Regex pattern matching + LLM fallback extracts structured medicine records (name, dosage, frequency) |
| 5 | **DB Lookup** | Checks SQLite cache by canonical composition key — cache hits skip stages 6-8 |
| 6 | **Composition** | Scrapes 1mg product pages via Firecrawl, extracts and normalizes active ingredients (salt stripping, unit conversion) |
| 7 | **Discovery** | Multi-shot parallel price discovery: 4 LLM models x 5 temperature-varied shots + Firecrawl web search agent |
| 8 | **Consensus** | IQR outlier filtering on all candidate prices → median consensus with confidence scoring (CV-based) |
| 9 | **Savings** | Calculates branded vs generic monthly/yearly costs, savings percentage, writes final prices to DB |
| 10 | **Complete** | Pipeline finished, results available |

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **FastAPI** | Async REST API framework |
| **Uvicorn** | ASGI server |
| **SQLAlchemy 2.0** (async) | ORM with async session management |
| **aiosqlite** | Async SQLite driver |
| **Pydantic v2** | Request/response validation and settings |
| **SSE-Starlette** | Server-Sent Events for real-time pipeline streaming |
| **structlog** | Structured JSON logging |
| **Tenacity** | Retry logic with exponential backoff |
| **Pillow + OpenCV + pytesseract** | Image preprocessing and OCR |
| **BeautifulSoup + lxml** | HTML parsing for web scraping |
| **httpx** | Async HTTP client |
| **scikit-learn** | ML clustering (K-Means, DBSCAN, Agglomerative, GMM) |
| **NumPy + Pandas** | Numerical computation and data analysis |

### Frontend
| Technology | Purpose |
|---|---|
| **Next.js 16** | React framework with App Router |
| **React 19** | UI library |
| **TypeScript** | Type safety |
| **Tailwind CSS 4** | Utility-first styling |

### AI / LLM Providers
| Provider | Models | Usage |
|---|---|---|
| **Google Gemini** | gemini-3.1-flash-lite, gemini-3.5-flash-lite | OCR Vision (prescription image → text) |
| **Groq** | Llama 3.3 70B, Llama 3.1 8B | Text refinement, price discovery, composition extraction |
| **LM Studio** (local) | Granite 4.1 3B, Llama 3.2 3B | Local inference for price discovery shots |
| **Firecrawl** | — | Web scraping API for 1mg, DavaIndia, search results |

---

## Project Structure

```
final-medsys/
├── backend/
│   ├── app/
│   │   ├── api/                          # FastAPI route handlers
│   │   │   ├── routes_prescription.py    #   POST /api/prescriptions (upload + trigger pipeline)
│   │   │   ├── routes_pipeline.py        #   GET  /api/pipeline/{run_id}/stream (SSE)
│   │   │   ├── routes_results.py         #   GET  /api/results/{prescription_id}
│   │   │   ├── routes_medicines.py       #   GET  /api/medicines/{id}
│   │   │   ├── routes_prices.py          #   GET  /api/prices/{medicine_id}/candidates
│   │   │   └── routes_evaluation.py      #   GET  /api/evaluation/* (accuracy + clustering)
│   │   ├── database/
│   │   │   ├── database.py               # Async engine + session factory
│   │   │   └── repositories/            # Repository pattern (prescription, medicine, composition, price, pipeline)
│   │   ├── models/                       # SQLAlchemy ORM models
│   │   │   ├── prescription.py           #   Prescription with status tracking
│   │   │   ├── medicine.py               #   Medicine with normalized names + dosage
│   │   │   ├── composition.py            #   Verified compositions with canonical keys
│   │   │   ├── price.py                  #   PriceCandidate + FinalPrice
│   │   │   ├── pipeline_run.py           #   Pipeline execution tracking
│   │   │   └── evaluation_cache.py       #   Cached evaluation results
│   │   ├── schemas/                      # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── pipeline_service.py       # 10-stage orchestrator + EventBus (SSE)
│   │   │   ├── ocr_service.py            # Gemini Vision + Tesseract OCR providers
│   │   │   ├── medicine_parser.py        # Two-stage: LLM refinement + regex parsing
│   │   │   ├── composition_service.py    # Multi-provider composition discovery
│   │   │   ├── composition_normalizer.py # Salt stripping, unit conversion, canonical keys
│   │   │   ├── llm_router.py             # Unified router: Groq + LM Studio + Gemini (4 models)
│   │   │   ├── statistical_engine.py     # IQR outlier detection + median consensus + confidence
│   │   │   ├── savings_engine.py         # Monthly/yearly savings calculation
│   │   │   ├── price_normalizer.py       # Unit price normalization
│   │   │   ├── price_discovery/
│   │   │   │   ├── base_agent.py         # Abstract price agent
│   │   │   │   ├── branded_agent.py      # Multi-shot branded price discovery
│   │   │   │   ├── generic_agent.py      # Multi-shot generic price discovery
│   │   │   │   └── search_agent.py       # Web search-based price agent
│   │   │   └── scraper/
│   │   │       ├── base_scraper.py        # Abstract scraper interface
│   │   │       ├── firecrawl_scraper.py   # Firecrawl API wrapper
│   │   │       └── one_mg_scraper.py      # 1mg composition + price scraper
│   │   ├── utils/
│   │   │   ├── logging.py                # structlog configuration
│   │   │   ├── retry.py                  # Tenacity retry decorators
│   │   │   ├── url_builder.py            # URL construction helpers
│   │   │   └── validation.py             # Input validation utilities
│   │   ├── config.py                     # Pydantic Settings (env-based)
│   │   └── main.py                       # FastAPI app entry point
│   ├── tests/                            # Unit tests
│   ├── eval_clustering.py                # Standalone ML clustering benchmark script
│   ├── requirements.txt
│   └── uploads/                          # Uploaded prescription images
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                  # Home — prescription upload
│   │   │   ├── processing/page.tsx       # Live pipeline visualization (SSE)
│   │   │   ├── results/page.tsx          # Savings results + accuracy evaluation
│   │   │   ├── history/page.tsx          # Past prescription history
│   │   │   ├── analytics/page.tsx        # ML clustering benchmarks + per-medicine breakdown
│   │   │   ├── sources/page.tsx          # Full price source transparency
│   │   │   ├── layout.tsx                # Root layout with navigation
│   │   │   └── globals.css               # Global styles
│   │   ├── components/
│   │   │   ├── PrescriptionUploader.tsx          # Drag-and-drop file upload
│   │   │   ├── ProcessingPipeline.tsx             # Real-time SSE pipeline stages
│   │   │   ├── LLMCallTracker.tsx                 # Per-model LLM call status tracker
│   │   │   ├── MedicineCard.tsx                   # Individual medicine savings card
│   │   │   ├── SavingsSummary.tsx                 # Aggregate savings overview
│   │   │   ├── PrescriptionAccuracyEvaluator.tsx  # Ground truth + method accuracy ranking
│   │   │   ├── StatisticalClusteringView.tsx      # Clustering analysis visualization
│   │   │   ├── PriceSources.tsx                   # Source attribution display
│   │   │   └── ConfidenceBadge.tsx                # Confidence level indicator
│   │   └── lib/
│   │       ├── api.ts                    # Backend API client
│   │       ├── types.ts                  # TypeScript type definitions
│   │       └── exportHtml.ts             # HTML report generation
│   ├── package.json
│   └── tsconfig.json
│
├── docker-compose.yml                    # Multi-service Docker setup
├── .env.example                          # Root environment template
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 20+**
- **Tesseract OCR** (optional, for local OCR fallback)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd final-medsys
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys (see Environment Variables below)

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local

# Start dev server
npm run dev
```

### 4. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation** (Swagger): http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

### Docker (Alternative)

```bash
docker-compose up --build
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | No | `sqlite+aiosqlite:///./medsavings.db` | Database connection string |
| `GEMINI_API_KEY` | **Yes** | — | Google Gemini API key (for OCR Vision) |
| `GROQ_API_KEY` | **Yes** | — | Groq API key (primary LLM for text processing) |
| `GROQ_API_KEY_FALLBACK_1` | No | — | Groq fallback key 1 (rate limit rotation) |
| `GROQ_API_KEY_FALLBACK_2` | No | — | Groq fallback key 2 |
| `FIRECRAWL_API_KEY` | **Yes** | — | Firecrawl API key (web scraping) |
| `OCR_PROVIDER` | No | `gemini_vision` | OCR engine: `gemini_vision` or `tesseract` |
| `FRONTEND_URL` | No | `http://localhost:3000` | CORS allowed origin |
| `LM_STUDIO_BASE_URL` | No | `http://localhost:1234/v1` | Local LM Studio endpoint |
| `COMPOSITION_CACHE_TTL` | No | `604800` (7 days) | Composition cache duration (seconds) |
| `PRICE_CACHE_TTL` | No | `604800` (7 days) | Price cache duration (seconds) |
| `MAX_CONCURRENT_REQUESTS` | No | `2` | Pipeline concurrency limit |
| `LLM_SHOTS_PER_MODEL` | No | `5` | Multi-shot attempts per LLM model |

### Frontend (`frontend/.env.local`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:8000` | Backend API base URL |

---

## API Endpoints

### Prescriptions
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/prescriptions` | Upload prescription image, triggers analysis pipeline |
| `GET` | `/api/prescriptions` | List all prescriptions |

### Pipeline
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/pipeline/{run_id}/stream` | SSE stream of pipeline progress events |

### Results
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/results/{prescription_id}` | Full results with medicines, prices, savings |

### Medicines & Prices
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/medicines/{id}` | Single medicine details |
| `GET` | `/api/prices/{medicine_id}/candidates` | All price candidates with sources |

### Evaluation & Analytics
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/evaluation/{prescription_id}/accuracy` | Per-medicine accuracy metrics (RMSE, MAE, MAPE, R²) |
| `POST` | `/api/evaluation/{prescription_id}/ground-truth` | Set ground truth prices for accuracy comparison |
| `GET` | `/api/evaluation/{prescription_id}/clustering` | ML clustering benchmark results |
| `GET` | `/api/evaluation/scraped-sources/{prescription_id}` | Live-scraped 1mg + DavaIndia price data |

---

## Frontend Pages

| Route | Page | Description |
|---|---|---|
| `/` | **Home** | Prescription upload with drag-and-drop |
| `/processing` | **Pipeline** | Real-time SSE visualization of all 10 stages with LLM call tracking |
| `/results` | **Results** | Medicine cards with branded vs generic pricing, savings summary, accuracy evaluator |
| `/history` | **History** | Past prescriptions list with status and savings overview |
| `/analytics` | **Analytics** | ML clustering benchmark table, per-medicine accuracy breakdown, live scraped data |
| `/sources` | **Sources** | Full price candidate table with source URLs, confidence scores, outlier flags |

---

## LLM & AI Configuration

### Multi-Model Architecture

The system uses 4 text/reasoning models for price discovery, plus Gemini Vision exclusively for OCR:

```
                    ┌──────────────────────────────┐
                    │      LLM Router              │
                    │  (task-based routing +        │
                    │   provider fallback chain)    │
                    └──────┬───────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌──────▼──────┐
    │   Groq    │   │ LM Studio │   │   Gemini    │
    │           │   │  (local)  │   │  (Vision)   │
    ├───────────┤   ├───────────┤   ├─────────────┤
    │ Llama 70B │   │ Granite   │   │ OCR only    │
    │ Llama 8B  │   │ 3B        │   │ (images →   │
    │           │   │ Llama 3.2 │   │  text)      │
    │           │   │ 3B        │   │             │
    └───────────┘   └───────────┘   └─────────────┘
```

### Multi-Shot Price Discovery

Each price agent (branded, generic, search) queries all 4 models with 5 temperature-varied shots (temperatures 0.2 → 0.8), yielding up to **20 price candidates per agent** for statistical consensus.

### Rate Limiting & Resilience

- **Groq**: API key rotation (up to 3 keys), 1.2s inter-call delay, semaphore-based concurrency
- **Gemini**: Strict 1-concurrent limit, 2.0s throttle, exponential backoff on 429/503
- **LM Studio**: Sequential processing to avoid GPU/VRAM contention

---

## Statistical Engine

The statistical engine is a pure-math module (no LLM dependency) that determines reliable consensus prices:

### Pipeline

```
Raw Candidate Prices
        │
        ▼
  ┌─────────────┐
  │  Validation  │  Remove negatives, zeros, outlier extremes (< ₹1 or > ₹50,000)
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  IQR Filter  │  Q1, Q3, IQR = Q3-Q1 → remove prices outside [Q1-1.5*IQR, Q3+1.5*IQR]
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │   Median     │  Consensus price = median of valid prices
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ Confidence   │  Weighted score from: source count (40%), price agreement/CV (40%), outlier ratio (20%)
  └─────────────┘
```

### Composition Normalization

Medicines are matched by canonical composition keys, enabling cache lookups even across brand names:

- **Salt stripping**: "Amlodipine Besylate" → "amlodipine"
- **Unit conversion**: mcg → mg, g → mg
- **Alphabetical ordering**: Ensures "A+B" and "B+A" produce the same canonical key
- **5% tolerance**: Floating-point-safe strength matching

---

## ML Clustering Evaluation

The analytics page benchmarks 4 clustering algorithms against ground truth prices:

| Algorithm | Method | Use Case |
|---|---|---|
| **K-Means** | Centroid-based partitioning | Best for well-separated spherical clusters |
| **Agglomerative** | Hierarchical ward linkage | Handles non-spherical cluster shapes |
| **DBSCAN** | Density-based spatial clustering | Discovers clusters of arbitrary shape, identifies noise |
| **Gaussian Mixture** | Probabilistic soft clustering | Handles overlapping clusters with uncertainty |

### Metrics Computed

| Metric | Description |
|---|---|
| **Silhouette Score** | Cluster cohesion vs separation (-1 to 1, higher = better) |
| **Davies-Bouldin Index** | Average cluster similarity ratio (lower = better) |
| **Calinski-Harabasz Index** | Ratio of between-cluster to within-cluster dispersion (higher = better) |
| **RMSE** | Root Mean Squared Error vs ground truth |
| **MAE** | Mean Absolute Error vs ground truth |
| **R²** | Coefficient of determination |
| **MAPE** | Mean Absolute Percentage Error |
| **Accuracy %** | Percentage of predictions within acceptable tolerance |

---

## Testing

```bash
cd backend
source venv/bin/activate

# Run unit tests
python -m pytest tests/ -v

# Available test modules:
#   test_composition_normalizer.py  — salt stripping, unit conversion, canonical keys
#   test_medicine_parser.py         — regex extraction, frequency detection
#   test_statistical_engine.py      — IQR outlier detection, confidence scoring
```

---

## Medical Disclaimer

This application is a **price comparison and savings estimation tool**. It does NOT provide medical advice. Any medication changes — especially generic substitution — should be confirmed with a licensed healthcare professional. Prices shown are estimates based on publicly available data and may vary by location, pharmacy, and availability.

---

## License

This project is for educational and research purposes.
