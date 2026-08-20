"""
FastAPI main application — entry point for the Medicine Savings Intelligence API.

Configures CORS, registers routers, manages database lifecycle.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database.database import init_db, close_db
from app.api.routes_prescription import router as prescription_router
from app.api.routes_medicines import router as medicines_router
from app.api.routes_prices import router as prices_router
from app.api.routes_pipeline import router as pipeline_router
from app.api.routes_results import router as results_router
from app.api.routes_evaluation import router as evaluation_router
from app.utils.logging import setup_logging, get_logger

# Configure structured logging
setup_logging("DEBUG" if settings.DEBUG else "INFO")
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — init DB on startup, cleanup on shutdown."""
    logger.info("app_startup", app_name=settings.APP_NAME)
    settings.ensure_upload_dir()
    await init_db()
    yield
    logger.info("app_shutdown")
    await close_db()


app = FastAPI(
    title=settings.APP_NAME,
    description="Analyze prescriptions to discover savings with generic medicines",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
        "http://192.0.0.2:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(prescription_router)
app.include_router(medicines_router)
app.include_router(prices_router)
app.include_router(pipeline_router)
app.include_router(results_router)
app.include_router(evaluation_router)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "name": settings.APP_NAME,
        "status": "healthy",
        "version": "1.0.0",
    }


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok"}
