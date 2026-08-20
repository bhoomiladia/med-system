"""
Pipeline Service — orchestrates the exact 5-phase architecture.

10-Stage Pipeline (matching architecture diagram):
 1. UPLOAD     — File received
 2. OCR        — Tesseract / Gemini Vision text extraction
 3. REFINE     — LLM cleans OCR text → pure medicine names only
 4. PARSE      — Regex + validation → structured ParsedMedicine list
 5. DB_LOOKUP  — Phase 1: Strict DB cache check (composition + prices by canonical key)
 6. COMPOSITION — Phase 2+3: Hallucination guard + Firecrawl/LLM composition discovery
 7. DISCOVERY  — Phase 3: Multi-shot parallel price discovery (Gemini grounding + Firecrawl + agents)
 8. CONSENSUS  — Phase 4: IQR outlier removal, CV tolerance check, median consensus
 9. SAVINGS    — Phase 5: Self-healing DB writeback + savings calculation
10. COMPLETE   — Pipeline finished
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import AsyncSessionLocal
from app.database.repositories.prescription_repo import PrescriptionRepository
from app.database.repositories.medicine_repo import MedicineRepository
from app.database.repositories.composition_repo import CompositionRepository
from app.database.repositories.price_repo import PriceRepository
from app.database.repositories.pipeline_repo import PipelineRepository
from app.services.ocr_service import get_ocr_provider
from app.services.medicine_parser import parse_medicines, refine_ocr_text, llm_parse_medicines
from app.services.composition_service import CompositionService
from app.services.composition_normalizer import normalize_composition
from app.services.scraper.firecrawl_scraper import FirecrawlScraper
from app.services.llm_router import LLMRouter
from app.services.price_discovery.branded_agent import BrandedPriceAgent
from app.services.price_discovery.generic_agent import GenericPriceAgent
from app.services.price_discovery.search_agent import SearchPriceAgent
from app.services.price_normalizer import normalize_to_unit_price, calculate_monthly_cost
from app.services.statistical_engine import analyze_prices
from app.services.savings_engine import calculate_medicine_savings
from app.models.pipeline_run import PipelineStage, PipelineStatus
from app.models.medicine import MedicineStatus
from app.models.prescription import PrescriptionStatus
from app.config import settings
from app.utils.logging import get_logger

logger = get_logger("pipeline_service")


class EventBus:
    """Async event bus for real-time SSE progress streaming."""

    def __init__(self):
        self._subscribers: Dict[str, List[asyncio.Queue]] = {}

    def subscribe(self, run_id: str) -> asyncio.Queue:
        if run_id not in self._subscribers:
            self._subscribers[run_id] = []
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[run_id].append(queue)
        return queue

    def unsubscribe(self, run_id: str, queue: asyncio.Queue) -> None:
        if run_id in self._subscribers:
            self._subscribers[run_id] = [
                q for q in self._subscribers[run_id] if q is not queue
            ]
            if not self._subscribers[run_id]:
                del self._subscribers[run_id]

    async def publish(self, run_id: str, event: dict) -> None:
        event["timestamp"] = datetime.now(timezone.utc).isoformat()
        if run_id in self._subscribers:
            for queue in self._subscribers[run_id]:
                await queue.put(event)

    async def close_run(self, run_id: str) -> None:
        if run_id in self._subscribers:
            for queue in self._subscribers[run_id]:
                await queue.put(None)
            del self._subscribers[run_id]


event_bus = EventBus()


class PipelineService:
    """Orchestrates the exact 5-phase architecture from the diagram."""

    def __init__(self):
        self._llm = LLMRouter()
        self._firecrawl = FirecrawlScraper()
        self._composition_service = CompositionService(
            firecrawl=self._firecrawl,
            llm=self._llm,
        )
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_REQUESTS)

    async def start_pipeline(self, prescription_id: str, run_id: str) -> None:
        """Run the end-to-end 10-stage pipeline."""
        try:
            logger.info("pipeline_start", prescription_id=prescription_id, run_id=run_id)

            async with AsyncSessionLocal() as db:
                pipeline_repo = PipelineRepository(db)
                await pipeline_repo.update_stage(
                    run_id, PipelineStage.OCR.value, PipelineStatus.RUNNING.value
                )

            # ────────────────────────────────────────
            # Stage 1: OCR Extraction
            # ────────────────────────────────────────
            raw_text = await self._stage_ocr(prescription_id, run_id)

            # ────────────────────────────────────────
            # Stage 2: Text Refinement (NEW)
            # ────────────────────────────────────────
            refined_text = await self._stage_refine(prescription_id, run_id, raw_text)

            # ────────────────────────────────────────
            # Stage 3: Medicine Parsing
            # ────────────────────────────────────────
            medicines = await self._stage_parse(prescription_id, run_id, refined_text)

            # ────────────────────────────────────────
            # Stage 4: DB Cache Lookup (Phase 1)
            # ────────────────────────────────────────
            cache_results = await self._stage_db_lookup(prescription_id, run_id, medicines)

            # ────────────────────────────────────────
            # Stages 5-8: Per-medicine processing (Phases 2-5)
            # ────────────────────────────────────────
            await self._stage_process_medicines(prescription_id, run_id, medicines, cache_results)

            # ────────────────────────────────────────
            # Stage 10: Complete
            # ────────────────────────────────────────
            async with AsyncSessionLocal() as db:
                pipeline_repo = PipelineRepository(db)
                prescription_repo = PrescriptionRepository(db)

                await pipeline_repo.update_stage(
                    run_id, PipelineStage.COMPLETE.value, PipelineStatus.COMPLETED.value
                )
                await prescription_repo.update_status(
                    prescription_id, PrescriptionStatus.COMPLETED.value
                )

            await event_bus.publish(run_id, {
                "event": "complete",
                "stage": "complete",
                "message": "Prescription analysis complete",
            })

            logger.info("pipeline_complete", prescription_id=prescription_id)

        except Exception as e:
            logger.error("pipeline_error", error=str(e), prescription_id=prescription_id)

            async with AsyncSessionLocal() as db:
                pipeline_repo = PipelineRepository(db)
                prescription_repo = PrescriptionRepository(db)
                await pipeline_repo.update_stage(
                    run_id, PipelineStage.FAILED.value, PipelineStatus.FAILED.value,
                    error=str(e),
                )
                await prescription_repo.update_status(
                    prescription_id, PrescriptionStatus.FAILED.value
                )

            await event_bus.publish(run_id, {
                "event": "error",
                "stage": "pipeline",
                "message": f"Pipeline failed: {str(e)}",
            })

        finally:
            await event_bus.close_run(run_id)

    # ═══════════════════════════════════════════
    # Stage 1: OCR
    # ═══════════════════════════════════════════

    async def _stage_ocr(self, prescription_id: str, run_id: str) -> str:
        """Extract text from prescription image/PDF."""
        await event_bus.publish(run_id, {
            "event": "stage_start",
            "stage": "ocr",
            "message": "Extracting text from prescription...",
        })

        async with AsyncSessionLocal() as db:
            prescription_repo = PrescriptionRepository(db)
            prescription = await prescription_repo.get_by_id(prescription_id)

            if not prescription:
                raise ValueError(f"Prescription not found: {prescription_id}")

            ocr_provider = get_ocr_provider(settings.OCR_PROVIDER)
            ocr_result = await ocr_provider.extract_text(prescription.file_path)

            await prescription_repo.update_status(
                prescription_id,
                PrescriptionStatus.PROCESSING.value,
                ocr_text=ocr_result.raw_text,
                ocr_confidence=ocr_result.confidence,
            )

            pipeline_repo = PipelineRepository(db)
            await pipeline_repo.update_stage(
                run_id, PipelineStage.REFINE.value, PipelineStatus.RUNNING.value
            )

        await event_bus.publish(run_id, {
            "event": "stage_complete",
            "stage": "ocr",
            "message": f"Text extracted via {ocr_result.provider} ({ocr_result.confidence:.0%} confidence)",
            "details": {
                "provider": ocr_result.provider,
                "confidence": ocr_result.confidence,
                "text_length": len(ocr_result.raw_text),
                "raw_preview": ocr_result.raw_text[:200] + "..." if len(ocr_result.raw_text) > 200 else ocr_result.raw_text,
            },
        })

        return ocr_result.raw_text

    # ═══════════════════════════════════════════
    # Stage 2: Text Refinement (NEW)
    # ═══════════════════════════════════════════

    async def _stage_refine(self, prescription_id: str, run_id: str, raw_text: str) -> str:
        """Use LLM to clean OCR text → extract only medicine names, dosage, frequency."""
        await event_bus.publish(run_id, {
            "event": "stage_start",
            "stage": "refine",
            "message": "Refining text — extracting medicine names only...",
        })

        refined_text = await refine_ocr_text(raw_text)

        async with AsyncSessionLocal() as db:
            pipeline_repo = PipelineRepository(db)
            await pipeline_repo.update_stage(
                run_id, PipelineStage.PARSE.value, PipelineStatus.RUNNING.value
            )

        await event_bus.publish(run_id, {
            "event": "stage_complete",
            "stage": "refine",
            "message": "Text refined — noise removed, medicine names isolated",
            "details": {
                "original_length": len(raw_text),
                "refined_length": len(refined_text),
                "refined_preview": refined_text[:300] + "..." if len(refined_text) > 300 else refined_text,
            },
        })

        return refined_text

    # ═══════════════════════════════════════════
    # Stage 3: Medicine Parsing
    # ═══════════════════════════════════════════

    async def _stage_parse(self, prescription_id: str, run_id: str, refined_text: str) -> list:
        """Parse refined text into structured medicine records."""
        await event_bus.publish(run_id, {
            "event": "stage_start",
            "stage": "parse",
            "message": "Identifying medicines from refined text...",
        })

        # Try regex parser first
        parsed = parse_medicines(refined_text)

        # If regex finds nothing, use LLM fallback
        if not parsed:
            parsed = await llm_parse_medicines(refined_text)

        if not parsed:
            raise ValueError("No recognizable medicines found in prescription text")

        # Save to DB
        async with AsyncSessionLocal() as db:
            medicine_repo = MedicineRepository(db)
            for med in parsed:
                await medicine_repo.create(
                    prescription_id=prescription_id,
                    name=med.name,
                    normalized_name=med.name.lower().strip(),
                    dosage=med.dosage,
                    frequency=med.frequency,
                    daily_quantity=med.daily_quantity,
                )

            pipeline_repo = PipelineRepository(db)
            await pipeline_repo.update_stage(
                run_id, PipelineStage.DB_LOOKUP.value, PipelineStatus.RUNNING.value
            )

        await event_bus.publish(run_id, {
            "event": "stage_complete",
            "stage": "parse",
            "message": f"Identified {len(parsed)} medicines",
            "details": {
                "count": len(parsed),
                "medicines": [
                    {"name": m.name, "dosage": m.dosage, "frequency": m.frequency}
                    for m in parsed
                ],
            },
        })

        # Reload from DB to get IDs
        async with AsyncSessionLocal() as db:
            medicine_repo = MedicineRepository(db)
            db_medicines = await medicine_repo.get_by_prescription(prescription_id)

        return db_medicines

    # ═══════════════════════════════════════════
    # Stage 4: Phase 1 — DB Cache Lookup
    # ═══════════════════════════════════════════

    async def _stage_db_lookup(self, prescription_id: str, run_id: str, medicines: list) -> dict:
        """
        Phase 1: Strict DB Search.
        Check if we already have cached composition + prices for each medicine.
        """
        await event_bus.publish(run_id, {
            "event": "stage_start",
            "stage": "db_lookup",
            "message": "Checking price database for cached results...",
        })

        cache_results = {}  # medicine_id -> {"composition": ..., "final_price": ...}
        hits = 0
        misses = 0

        async with AsyncSessionLocal() as db:
            comp_repo = CompositionRepository(db)

            for med in medicines:
                # Try to find cached composition by medicine name
                cached_comp = await comp_repo.find_by_medicine_name(med.name)

                if cached_comp and cached_comp.normalized_composition:
                    canonical_key = cached_comp.normalized_composition.get("canonical_key", "")

                    if canonical_key:
                        # Check for cached final price
                        price_repo = PriceRepository(db)
                        cached_price = await price_repo.find_cached_final_price(canonical_key)

                        if cached_price:
                            cache_results[med.id] = {
                                "composition": cached_comp,
                                "final_price": cached_price,
                                "canonical_key": canonical_key,
                            }
                            hits += 1

                            await event_bus.publish(run_id, {
                                "event": "medicine_progress",
                                "medicine_id": med.id,
                                "medicine_name": med.name,
                                "stage": "db_lookup",
                                "message": f"[HIT] Cache HIT -- {med.name} (prices from {cached_price.created_at.strftime('%b %d') if cached_price.created_at else 'earlier'})",
                            })
                            continue

                misses += 1
                await event_bus.publish(run_id, {
                    "event": "medicine_progress",
                    "medicine_id": med.id,
                    "medicine_name": med.name,
                    "stage": "db_lookup",
                    "message": f"[MISS] Cache MISS -- {med.name} (will discover via AI agents)",
                })

        async with AsyncSessionLocal() as db:
            pipeline_repo = PipelineRepository(db)
            await pipeline_repo.update_stage(
                run_id, PipelineStage.COMPOSITION.value, PipelineStatus.RUNNING.value
            )

        await event_bus.publish(run_id, {
            "event": "stage_complete",
            "stage": "db_lookup",
            "message": f"DB check: {hits} cache hits, {misses} need discovery",
            "details": {
                "hits": hits,
                "misses": misses,
                "total": len(medicines),
            },
        })

        return cache_results

    # ═══════════════════════════════════════════
    # Stages 5-9: Per-medicine processing
    # ═══════════════════════════════════════════

    async def _stage_process_medicines(
        self, prescription_id: str, run_id: str, medicines: list, cache_results: dict
    ) -> None:
        """Process medicines with controlled concurrency to prevent LLM/scraper rate limits."""
        sem = asyncio.Semaphore(1)  # Process 1 medicine at a time to prevent API quota storms

        async def _bounded_process(med):
            async with sem:
                cached = cache_results.get(med.id)
                if cached:
                    await self._process_cached_medicine(med.id, med.name, run_id, cached)
                else:
                    await self._process_uncached_medicine(med.id, med.name, run_id)

        tasks = [asyncio.create_task(_bounded_process(med)) for med in medicines]
        await asyncio.gather(*tasks, return_exceptions=True)

        await event_bus.publish(run_id, {
            "event": "stage_complete",
            "stage": "savings",
            "message": "Savings analysis completed for all medicines",
        })

    async def _process_cached_medicine(
        self, medicine_id: str, medicine_name: str, run_id: str, cached: dict
    ) -> None:
        """Process a medicine with cached DB data — copy cached records to new medicine and skip discovery."""
        try:
            cached_final_price = cached["final_price"]
            cached_comp = cached.get("composition")

            await event_bus.publish(run_id, {
                "event": "medicine_progress",
                "medicine_id": medicine_id,
                "medicine_name": medicine_name,
                "stage": "savings",
                "message": f"Attaching cached prices & composition for {medicine_name}",
            })

            async with AsyncSessionLocal() as db:
                med_repo = MedicineRepository(db)
                comp_repo = CompositionRepository(db)
                price_repo = PriceRepository(db)

                # 1. Attach Composition to new medicine
                if cached_comp:
                    await comp_repo.create(
                        medicine_id=medicine_id,
                        raw_text=cached_comp.raw_text,
                        normalized_composition=cached_comp.normalized_composition,
                        source=f"{cached_comp.source} (cache)",
                        source_url=cached_comp.source_url,
                        confidence=cached_comp.confidence,
                    )

                # 2. Copy candidates from the original cached medicine if available
                orig_med_id = cached_final_price.medicine_id
                if orig_med_id:
                    orig_candidates = await price_repo.get_candidates(orig_med_id)
                    for cand in orig_candidates:
                        await price_repo.create_candidate(
                            medicine_id=medicine_id,
                            type=cand.type,
                            candidate_name=cand.candidate_name,
                            composition=cand.composition,
                            price=cand.price,
                            currency=cand.currency,
                            pack_quantity=cand.pack_quantity,
                            unit_price=cand.unit_price,
                            source=cand.source,
                            source_url=cand.source_url,
                            confidence=cand.confidence,
                            is_outlier=cand.is_outlier,
                            raw_evidence=cand.raw_evidence,
                        )

                # 3. Create FinalPrice record for new medicine
                medicine = await med_repo.get_by_id(medicine_id)
                monthly_qty = medicine.monthly_quantity if medicine else (cached_final_price.monthly_quantity or 30)

                branded_unit = cached_final_price.branded_unit_price
                generic_unit = cached_final_price.generic_unit_price
                branded_monthly = round(branded_unit * monthly_qty, 2) if branded_unit else None
                generic_monthly = round(generic_unit * monthly_qty, 2) if generic_unit else None
                monthly_savings = round(branded_monthly - generic_monthly, 2) if (branded_monthly and generic_monthly) else None
                savings_pct = round((monthly_savings / branded_monthly * 100), 1) if (monthly_savings and branded_monthly and branded_monthly > 0) else None

                await price_repo.create_final_price(
                    medicine_id=medicine_id,
                    branded_unit_price=branded_unit,
                    generic_unit_price=generic_unit,
                    branded_pack_price=cached_final_price.branded_pack_price,
                    generic_pack_price=cached_final_price.generic_pack_price,
                    branded_pack_size=cached_final_price.branded_pack_size,
                    generic_pack_size=cached_final_price.generic_pack_size,
                    generic_name=cached_final_price.generic_name,
                    branded_monthly_cost=branded_monthly,
                    generic_monthly_cost=generic_monthly,
                    monthly_savings=monthly_savings,
                    savings_percentage=savings_pct,
                    confidence=cached_final_price.confidence,
                    monthly_quantity=monthly_qty,
                )

                await med_repo.update_status(medicine_id, MedicineStatus.COMPLETED.value)

            savings_msg = f"₹{monthly_savings or 0:.0f}/mo savings" if monthly_savings else "No savings data"
            await event_bus.publish(run_id, {
                "event": "medicine_progress",
                "medicine_id": medicine_id,
                "medicine_name": medicine_name,
                "stage": "complete",
                "message": f"[OK] {medicine_name}: {savings_msg} (from cache)",
            })

        except Exception as e:
            logger.error("cached_medicine_error", medicine_id=medicine_id, error=str(e))

    async def _process_uncached_medicine(
        self, medicine_id: str, medicine_name: str, run_id: str
    ) -> None:
        """Full Phase 2-5 discovery for a medicine not in cache."""
        async with self._semaphore:
            try:
                # ─── Phase 2: Hallucination Guard + Composition Discovery ───
                await event_bus.publish(run_id, {
                    "event": "medicine_progress",
                    "medicine_id": medicine_id,
                    "medicine_name": medicine_name,
                    "stage": "composition",
                    "message": f"Discovering composition for {medicine_name}...",
                })

                composition_result = await self._composition_service.find_composition(medicine_name)

                if not composition_result or not composition_result.ingredients:
                    async with AsyncSessionLocal() as db:
                        med_repo = MedicineRepository(db)
                        await med_repo.update_status(medicine_id, MedicineStatus.COMPOSITION_FAILED.value)

                    await event_bus.publish(run_id, {
                        "event": "medicine_progress",
                        "medicine_id": medicine_id,
                        "medicine_name": medicine_name,
                        "stage": "composition",
                        "message": f"[!] Composition not found for {medicine_name}",
                    })
                    return

                normalized = normalize_composition(composition_result.ingredients)

                # Save composition to DB (Phase 5 writeback for composition)
                async with AsyncSessionLocal() as db:
                    comp_repo = CompositionRepository(db)
                    await comp_repo.create(
                        medicine_id=medicine_id,
                        raw_text=composition_result.raw_text,
                        normalized_composition={
                            **normalized.to_dict(),
                            "canonical_key": normalized.canonical_key,
                            "medicine_name": medicine_name.lower().strip(),
                        },
                        source=composition_result.source,
                        source_url=composition_result.source_url,
                        confidence=composition_result.confidence,
                    )
                    med_repo = MedicineRepository(db)
                    await med_repo.update_status(medicine_id, MedicineStatus.COMPOSITION_FOUND.value)

                await event_bus.publish(run_id, {
                    "event": "medicine_progress",
                    "medicine_id": medicine_id,
                    "medicine_name": medicine_name,
                    "stage": "composition",
                    "message": f"[OK] {medicine_name}: {composition_result.raw_text}",
                })

                # ─── Phase 3: Multi-Shot Price Discovery ───
                await event_bus.publish(run_id, {
                    "event": "stage_start",
                    "stage": "discovery",
                    "medicine_id": medicine_id,
                    "medicine_name": medicine_name,
                    "message": f"Multi-shot price discovery for {medicine_name} across 4 LLM models & scrapers...",
                })

                async def _on_llm_start(provider: str, model: str, label: str, shot: int):
                    await event_bus.publish(run_id, {
                        "event": "llm_call",
                        "stage": "discovery",
                        "medicine_id": medicine_id,
                        "medicine_name": medicine_name,
                        "provider": provider,
                        "model": model,
                        "label": label,
                        "shot": shot,
                        "status": "running",
                        "message": f"Querying {label} (shot #{shot})...",
                    })

                async def _on_llm_done(provider: str, model: str, label: str, shot: int, success: bool, error: str = ""):
                    await event_bus.publish(run_id, {
                        "event": "llm_call",
                        "stage": "discovery",
                        "medicine_id": medicine_id,
                        "medicine_name": medicine_name,
                        "provider": provider,
                        "model": model,
                        "label": label,
                        "shot": shot,
                        "status": "completed" if success else "failed",
                        "message": f"[OK] {label} (shot #{shot}) response received" if success else f"[FAIL] {label} (shot #{shot}) error: {error}",
                    })

                branded_agent = BrandedPriceAgent(firecrawl=self._firecrawl, llm=self._llm)
                generic_agent = GenericPriceAgent(firecrawl=self._firecrawl, llm=self._llm)
                search_agent = SearchPriceAgent(firecrawl=self._firecrawl, llm=self._llm)

                # Parallel multi-shot discovery
                results = await asyncio.gather(
                    branded_agent.search_branded_prices(
                        medicine_name,
                        normalized,
                        on_call_start=_on_llm_start,
                        on_call_complete=_on_llm_done,
                    ),
                    generic_agent.search_generic_prices(
                        normalized,
                        medicine_name,
                        on_call_start=_on_llm_start,
                        on_call_complete=_on_llm_done,
                    ),
                    search_agent.search_branded_prices(medicine_name, normalized),
                    return_exceptions=True,
                )

                branded_candidates = results[0] if isinstance(results[0], list) else []
                generic_candidates = results[1] if isinstance(results[1], list) else []
                extra_candidates = results[2] if isinstance(results[2], list) else []
                branded_candidates.extend(extra_candidates)

                total_candidates = len(branded_candidates) + len(generic_candidates)

                # Save all candidates to DB for auditability
                async with AsyncSessionLocal() as db:
                    price_repo = PriceRepository(db)
                    for bc in branded_candidates:
                        await price_repo.create_candidate(medicine_id, **bc.model_dump())
                    for gc in generic_candidates:
                        await price_repo.create_candidate(medicine_id, **gc.model_dump())

                await event_bus.publish(run_id, {
                    "event": "stage_complete",
                    "stage": "discovery",
                    "medicine_id": medicine_id,
                    "medicine_name": medicine_name,
                    "message": f"[OK] {medicine_name}: Gathered {total_candidates} candidate prices ({len(branded_candidates)} branded, {len(generic_candidates)} generic)",
                    "details": {
                        "total_candidates": total_candidates,
                        "branded_count": len(branded_candidates),
                        "generic_count": len(generic_candidates),
                    },
                })

                # ─── Phase 4: Statistical Clustering & IQR Consensus ───
                await event_bus.publish(run_id, {
                    "event": "stage_start",
                    "stage": "consensus",
                    "medicine_id": medicine_id,
                    "medicine_name": medicine_name,
                    "message": f"Executing IQR Outlier Filtering & Statistical Consensus on {total_candidates} prices...",
                })

                branded_unit_prices = [c.unit_price for c in branded_candidates if c.unit_price]
                generic_unit_prices = [c.unit_price for c in generic_candidates if c.unit_price]

                branded_stats = analyze_prices(branded_unit_prices)
                generic_stats = analyze_prices(generic_unit_prices)

                # Calculate CV for tolerance check
                branded_cv = (branded_stats.std_dev / branded_stats.median_price) if (branded_stats.std_dev and branded_stats.median_price and branded_stats.median_price > 0) else None
                generic_cv = (generic_stats.std_dev / generic_stats.median_price) if (generic_stats.std_dev and generic_stats.median_price and generic_stats.median_price > 0) else None

                consensus_msg = f"Branded: ₹{branded_stats.median_price or 'N/A'}/unit | Generic: ₹{generic_stats.median_price or 'N/A'}/unit"

                await event_bus.publish(run_id, {
                    "event": "clustering_analysis",
                    "stage": "consensus",
                    "medicine_id": medicine_id,
                    "medicine_name": medicine_name,
                    "message": f"[OK] {medicine_name}: Consensus achieved ({consensus_msg})",
                    "details": {
                        "method": "Interquartile Range (IQR) Outlier Trimming & Median Consensus",
                        "branded_raw_prices": branded_unit_prices,
                        "generic_raw_prices": generic_unit_prices,
                        "branded_median": branded_stats.median_price,
                        "generic_median": generic_stats.median_price,
                        "branded_q1": branded_stats.q1,
                        "branded_q3": branded_stats.q3,
                        "branded_iqr": branded_stats.iqr,
                        "branded_lower_bound": branded_stats.lower_bound,
                        "branded_upper_bound": branded_stats.upper_bound,
                        "generic_q1": generic_stats.q1,
                        "generic_q3": generic_stats.q3,
                        "generic_iqr": generic_stats.iqr,
                        "generic_lower_bound": generic_stats.lower_bound,
                        "generic_upper_bound": generic_stats.upper_bound,
                        "branded_outliers": branded_stats.outlier_count,
                        "generic_outliers": generic_stats.outlier_count,
                        "branded_valid_count": len(branded_stats.valid_prices),
                        "generic_valid_count": len(generic_stats.valid_prices),
                        "branded_cv": round(branded_cv, 3) if branded_cv else None,
                        "generic_cv": round(generic_cv, 3) if generic_cv else None,
                        "branded_confidence": branded_stats.confidence,
                        "generic_confidence": generic_stats.confidence,
                    },
                })

                # ─── Phase 5: Savings Calculation + DB Writeback ───
                await event_bus.publish(run_id, {
                    "event": "medicine_progress",
                    "medicine_id": medicine_id,
                    "medicine_name": medicine_name,
                    "stage": "savings",
                    "message": f"Calculating savings for {medicine_name}...",
                })

                async with AsyncSessionLocal() as db:
                    med_repo = MedicineRepository(db)
                    medicine = await med_repo.get_by_id(medicine_id)
                    monthly_qty = medicine.monthly_quantity if medicine else 30

                    best_generic_name = generic_candidates[0].candidate_name if generic_candidates else None
                    best_generic_pack_price = generic_candidates[0].price if generic_candidates else None
                    best_generic_pack_size = generic_candidates[0].pack_quantity if generic_candidates else None
                    best_branded_pack_price = branded_candidates[0].price if branded_candidates else None
                    best_branded_pack_size = branded_candidates[0].pack_quantity if branded_candidates else None

                    savings = calculate_medicine_savings(
                        medicine_id=medicine_id,
                        medicine_name=medicine_name,
                        branded_unit_price=branded_stats.median_price,
                        generic_unit_price=generic_stats.median_price,
                        branded_pack_price=best_branded_pack_price,
                        generic_pack_price=best_generic_pack_price,
                        branded_pack_size=best_branded_pack_size,
                        generic_pack_size=best_generic_pack_size,
                        generic_name=best_generic_name,
                        monthly_quantity=monthly_qty,
                        confidence=min(
                            branded_stats.confidence,
                            generic_stats.confidence
                        ) if (branded_stats.confidence and generic_stats.confidence) else (
                            branded_stats.confidence or generic_stats.confidence
                        ),
                    )

                    # Phase 5: Self-healing DB writeback
                    price_repo = PriceRepository(db)
                    await price_repo.create_final_price(
                        medicine_id=medicine_id,
                        branded_unit_price=branded_stats.median_price,
                        generic_unit_price=generic_stats.median_price,
                        branded_pack_price=best_branded_pack_price,
                        generic_pack_price=best_generic_pack_price,
                        branded_pack_size=best_branded_pack_size,
                        generic_pack_size=best_generic_pack_size,
                        generic_name=best_generic_name,
                        branded_monthly_cost=savings.branded_monthly_cost,
                        generic_monthly_cost=savings.generic_monthly_cost,
                        monthly_savings=savings.monthly_savings,
                        savings_percentage=savings.savings_percentage,
                        confidence=savings.confidence,
                        monthly_quantity=savings.monthly_quantity,
                    )
                    await med_repo.update_status(medicine_id, MedicineStatus.COMPLETED.value)

                savings_pct = f"{savings.savings_percentage}%" if savings.savings_percentage else "N/A"
                savings_amt = f"₹{savings.monthly_savings:.0f}" if savings.monthly_savings else "₹0"

                await event_bus.publish(run_id, {
                    "event": "medicine_progress",
                    "medicine_id": medicine_id,
                    "medicine_name": medicine_name,
                    "stage": "complete",
                    "message": f"[OK] {medicine_name}: {savings_amt}/mo savings ({savings_pct})",
                })

            except Exception as e:
                logger.error("medicine_process_failed", medicine_id=medicine_id, error=str(e))
                async with AsyncSessionLocal() as db:
                    med_repo = MedicineRepository(db)
                    await med_repo.update_status(medicine_id, MedicineStatus.FAILED.value)

                await event_bus.publish(run_id, {
                    "event": "medicine_progress",
                    "medicine_id": medicine_id,
                    "medicine_name": medicine_name,
                    "stage": "error",
                    "message": f"[FAIL] Error processing {medicine_name}: {str(e)}",
                })
