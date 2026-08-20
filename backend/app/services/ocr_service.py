"""
OCR Service — real OCR engines with Tesseract and Gemini Vision multimodal support.

No mock data.
"""

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger("ocr_service")


@dataclass
class OCRResult:
    """Result from OCR extraction."""
    raw_text: str
    confidence: float
    provider: str


class OCRProvider(ABC):
    """Abstract base class for OCR providers."""

    @abstractmethod
    async def extract_text(self, file_path: str) -> OCRResult:
        """Extract text from an image or PDF file."""
        ...


class TesseractOCRProvider(OCRProvider):
    """OCR using local Tesseract via pytesseract with OpenCV preprocessing."""

    async def extract_text(self, file_path: str) -> OCRResult:
        import cv2
        import pytesseract
        import numpy as np

        logger.info("tesseract_ocr_start", file_path=file_path)
        ext = os.path.splitext(file_path)[1].lower()

        if ext == ".pdf":
            text = await self._extract_from_pdf(file_path)
        else:
            text = await self._extract_from_image(file_path)

        confidence = self._estimate_confidence(text)
        logger.info(
            "tesseract_ocr_complete",
            file_path=file_path,
            text_length=len(text),
            confidence=confidence,
        )

        return OCRResult(raw_text=text, confidence=confidence, provider="tesseract")

    async def _extract_from_image(self, file_path: str) -> str:
        import cv2
        import pytesseract

        image = cv2.imread(file_path)
        if image is None:
            raise ValueError(f"Cannot read image: {file_path}")

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        denoised = cv2.medianBlur(thresh, 3)

        text = pytesseract.image_to_string(denoised, config="--psm 6")
        return text.strip()

    async def _extract_from_pdf(self, file_path: str) -> str:
        import subprocess
        try:
            result = subprocess.run(
                ["pdftotext", file_path, "-"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except Exception:
            pass

        from PIL import Image
        import pytesseract
        try:
            img = Image.open(file_path)
            text = pytesseract.image_to_string(img, config="--psm 6")
            return text.strip()
        except Exception as e:
            logger.error("pdf_ocr_failed", error=str(e))
            return ""

    def _estimate_confidence(self, text: str) -> float:
        if not text:
            return 0.0
        words = text.split()
        if len(words) < 3:
            return 0.3
        readable_words = sum(1 for w in words if w.isalpha() and len(w) > 1)
        readable_ratio = readable_words / len(words) if words else 0
        return max(0.2, min(1.0, 0.4 + (readable_ratio * 0.6)))


class GeminiVisionOCRProvider(OCRProvider):
    """OCR using Gemini Vision multimodal model (handles doctor handwriting & complex layouts)."""

    async def extract_text(self, file_path: str) -> OCRResult:
        from app.services.llm_router import LLMRouter

        logger.info("gemini_vision_ocr_start", file_path=file_path)
        llm = LLMRouter()
        
        prompt = (
            "You are a medical OCR specialist. Extract all text from this prescription image verbatim. "
            "Pay special attention to medicine brand names, formulations (Tab, Cap, Syrup), "
            "strengths (e.g. 40mg, 500mg), dosage, and frequency (e.g. once daily, 1-0-1). "
            "Output the transcription cleanly line by line."
        )

        try:
            response = await llm.generate_with_image(prompt=prompt, image_path=file_path)
            text = response.text.strip()
            confidence = 0.92 if len(text) > 20 else 0.4
            return OCRResult(raw_text=text, confidence=confidence, provider="gemini_vision")
        except Exception as e:
            logger.error("gemini_vision_failed_falling_back_to_tesseract", error=str(e))
            tesseract = TesseractOCRProvider()
            return await tesseract.extract_text(file_path)


def get_ocr_provider(provider_name: str = "tesseract") -> OCRProvider:
    """Factory to get the configured OCR provider."""
    providers = {
        "tesseract": TesseractOCRProvider,
        "gemini_vision": GeminiVisionOCRProvider,
        "gemini": GeminiVisionOCRProvider,
    }
    provider_class = providers.get(provider_name.lower(), TesseractOCRProvider)
    return provider_class()
