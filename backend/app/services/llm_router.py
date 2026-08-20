"""
LLM Router — unified interface for Groq (Llama 70B & 8B), LM Studio (Qwen 8B & Qwen 3 VL 4B), and Gemini (OCR Vision only).

Configured models:
  1. Groq - llama-3.3-70b-versatile
  2. Groq - llama-3.1-8b-instant
  3. LM Studio - qwen/qwen3-vl-4b
  4. LM Studio - qwen/qwen3-8b
  * Gemini Vision is reserved exclusively for multimodal OCR image text extraction.

Provides multi-shot parallel execution across all 4 text/reasoning models.
"""

import json
import asyncio
import httpx
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger("llm_router")


@dataclass
class LLMResponse:
    """Unified response from any LLM provider."""
    text: str
    provider: str
    model: str
    usage: Optional[Dict[str, int]] = None


class GeminiProvider:
    """Google Gemini with optional Google Search grounding and Vision multimodal capabilities."""

    def __init__(self):
        self._client = None
        self._semaphore = asyncio.Semaphore(settings.GEMINI_MAX_CONCURRENT)
        self._last_call_time = 0.0

    def _get_client(self):
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
        return self._client

    async def _throttle(self):
        """Enforce delay between Gemini API calls to prevent 429 quota exhaustion."""
        import time
        now = time.monotonic()
        elapsed = now - self._last_call_time
        delay = settings.GEMINI_CALL_DELAY
        if elapsed < delay:
            await asyncio.sleep(delay - elapsed)
        self._last_call_time = time.monotonic()

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        use_search: bool = False,
        model: Optional[str] = None,
        temperature: float = 0.2,
        retries: int = 2,
    ) -> LLMResponse:
        """Generate a response, optionally with Google Search grounding and 429 backoff."""
        client = self._get_client()
        model_name = model or settings.GEMINI_MODEL

        config: Dict[str, Any] = {"temperature": temperature}
        if system_prompt:
            config["system_instruction"] = system_prompt

        tools = []
        if use_search:
            tools = [{"google_search": {}}]

        async with self._semaphore:
            for attempt in range(retries + 1):
                try:
                    await self._throttle()
                    response = await asyncio.to_thread(
                        client.models.generate_content,
                        model=model_name,
                        contents=prompt,
                        config={
                            **config,
                            "tools": tools,
                        } if tools else config,
                    )

                    return LLMResponse(
                        text=response.text or "",
                        provider="gemini",
                        model=model_name,
                    )
                except Exception as e:
                    err_str = str(e)
                    is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str
                    if is_rate_limit and attempt < retries:
                        backoff = (attempt + 1) * 3.0
                        logger.warning(
                            "gemini_rate_limit_backoff",
                            attempt=attempt,
                            backoff_seconds=backoff,
                            error=err_str,
                        )
                        await asyncio.sleep(backoff)
                        continue

                    logger.error("gemini_error", error=err_str, model=model_name)
                    raise

    async def generate_with_image(
        self,
        prompt: str,
        image_path: str,
        model: Optional[str] = None,
        retries: int = 3,
    ) -> LLMResponse:
        """Generate a response with image input for OCR and vision extraction with backoff & model fallback."""
        from PIL import Image

        client = self._get_client()
        models_to_try = [
            model or settings.GEMINI_MODEL,
            getattr(settings, "GEMINI_MODEL_FALLBACK", "gemini-3.1-flash-lite-preview"),
            "gemini-3.5-flash-lite",
            "gemma-4-26b-a4b-it",
        ]
        # Remove duplicates while preserving order
        models_to_try = list(dict.fromkeys(models_to_try))

        last_err = None
        for model_name in models_to_try:
            async with self._semaphore:
                for attempt in range(retries):
                    try:
                        await self._throttle()
                        img = Image.open(image_path)
                        response = await asyncio.to_thread(
                            client.models.generate_content,
                            model=model_name,
                            contents=[prompt, img],
                        )

                        return LLMResponse(
                            text=response.text or "",
                            provider="gemini_vision",
                            model=model_name,
                        )
                    except Exception as e:
                        err_str = str(e)
                        last_err = e
                        is_recoverable = (
                            "429" in err_str
                            or "503" in err_str
                            or "RESOURCE_EXHAUSTED" in err_str
                            or "UNAVAILABLE" in err_str
                            or "high demand" in err_str.lower()
                        )
                        if is_recoverable and attempt < retries - 1:
                            backoff = (attempt + 1) * 2.5
                            logger.warning(
                                "gemini_vision_temporary_error_retry",
                                model=model_name,
                                attempt=attempt + 1,
                                backoff_seconds=backoff,
                                error=err_str[:120],
                            )
                            await asyncio.sleep(backoff)
                            continue
                        logger.warning(
                            "gemini_vision_model_failed_trying_next",
                            model=model_name,
                            error=err_str[:120],
                        )
                        break

        logger.error("all_gemini_vision_models_failed", error=str(last_err))
        raise last_err or RuntimeError("All Gemini vision models failed")


class GroqProvider:
    """Groq — ultra-fast LLM inference with key rotation fallbacks and rate throttling."""

    def __init__(self):
        self._keys = [
            settings.GROQ_API_KEY,
            settings.GROQ_API_KEY_FALLBACK_1,
            settings.GROQ_API_KEY_FALLBACK_2,
        ]
        self._keys = [k for k in self._keys if k]
        self._semaphore = asyncio.Semaphore(1)  # 1 request at a time to stay under TPM/RPM limits
        self._last_call_time = 0.0

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.2,
    ) -> LLMResponse:
        """Generate using Groq's fast inference with fallback keys and strict rate throttling."""
        from groq import Groq
        import time

        model_name = model or settings.GROQ_MODEL
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        async with self._semaphore:
            # Enforce 1.2s delay between consecutive Groq calls across the entire process
            elapsed = time.monotonic() - self._last_call_time
            if elapsed < 1.2:
                await asyncio.sleep(1.2 - elapsed)
            self._last_call_time = time.monotonic()

            last_error = None
            for key in self._keys:
                try:
                    client = Groq(api_key=key)
                    response = await asyncio.to_thread(
                        client.chat.completions.create,
                        model=model_name,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=4096,
                    )

                    return LLMResponse(
                        text=response.choices[0].message.content or "",
                        provider="groq",
                        model=model_name,
                        usage={
                            "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                            "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                        },
                    )
                except Exception as e:
                    last_error = e
                    logger.warning("groq_key_failed_trying_fallback", error=str(e), model=model_name)
                    continue

            raise RuntimeError(f"All Groq keys failed for {model_name}. Last error: {last_error}")



class LMStudioProvider:
    """LM Studio — Local OpenAI-compatible server (http://localhost:1234/v1)."""

    def __init__(self):
        self.base_url = settings.LM_STUDIO_BASE_URL.rstrip("/")
        self.api_key = settings.LM_STUDIO_API_KEY
        self.default_model = settings.LM_STUDIO_MODEL
        # Local inference concurrency limiter (prevent overloading GPU/VRAM with parallel context swaps)
        self._semaphore = asyncio.Semaphore(1)

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.2,
        timeout: float = 60.0,
        retries: int = 2,
    ) -> LLMResponse:
        """Generate text using local LM Studio instance."""
        model_name = model or self.default_model
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 2048,
        }

        async with self._semaphore:
            for attempt in range(retries + 1):
                try:
                    async with httpx.AsyncClient(timeout=timeout) as client:
                        response = await client.post(url, headers=headers, json=payload)
                        if response.status_code == 200:
                            data = response.json()
                            content = data["choices"][0]["message"]["content"] or ""
                            return LLMResponse(
                                text=content,
                                provider="lm_studio",
                                model=model_name,
                            )
                        else:
                            resp_text = response.text
                            if attempt < retries and ("Model unloaded" in resp_text or "Internal Server Error" in resp_text):
                                logger.info("lm_studio_retrying_after_model_load", model=model_name, attempt=attempt + 1)
                                await asyncio.sleep(2.0)
                                continue
                            raise RuntimeError(
                                f"LM Studio returned status {response.status_code}: {resp_text[:120]}"
                            )
                except Exception as e:
                    if attempt < retries:
                        await asyncio.sleep(2.0)
                        continue
                    logger.warning("lm_studio_call_failed", error=str(e), model=model_name)
                    raise


TASK_ROUTING = {
    "parse_prescription": "groq",
    "extract_composition": "groq",
    "search_branded_prices": "groq",
    "search_generic_prices": "groq",
    "extract_prices": "groq",
    "general": "groq",
}

# The 4 target models configured for price discovery & generation:
# 2 Groq models + 2 LM Studio models (Gemini is reserved only for image text extraction OCR)
MODELS_CATALOG = [
    {"provider": "groq", "model": settings.GROQ_MODEL, "label": "Groq GPT-OSS-120B"},
    {"provider": "groq", "model": settings.GROQ_MODEL_FALLBACK, "label": "Groq Qwen-3.6-27B"},
    {"provider": "lm_studio", "model": settings.LM_STUDIO_MODEL_VL, "label": "LM Studio Llama-3.2-3B"},
    {"provider": "lm_studio", "model": settings.LM_STUDIO_MODEL, "label": "LM Studio Granite-4.1-3B"},
]


class LLMRouter:
    """
    Unified LLM router supporting all 4 models and multi-shot discovery loops.
    """

    def __init__(self):
        self._providers: Dict[str, Any] = {}
        self._initialized = False

    def _init_providers(self):
        if self._initialized:
            return

        if settings.GEMINI_API_KEY:
            self._providers["gemini"] = GeminiProvider()
            logger.info("llm_provider_initialized", provider="gemini")

        if settings.GROQ_API_KEY:
            self._providers["groq"] = GroqProvider()
            logger.info("llm_provider_initialized", provider="groq")

        # LM Studio provider
        self._providers["lm_studio"] = LMStudioProvider()
        logger.info("llm_provider_initialized", provider="lm_studio")

        self._initialized = True

    def _get_fallback_chain(self, task: str) -> List[str]:
        primary = TASK_ROUTING.get(task, "groq")
        all_providers = ["groq", "lm_studio"]
        chain = [primary] + [p for p in all_providers if p != primary]
        return [p for p in chain if p in self._providers]

    async def generate(
        self,
        task: str,
        prompt: str,
        system_prompt: Optional[str] = None,
        use_search: bool = False,
        model: Optional[str] = None,
        temperature: float = 0.2,
    ) -> LLMResponse:
        self._init_providers()

        chain = self._get_fallback_chain(task)
        if not chain:
            raise RuntimeError("No LLM providers configured.")

        last_error = None
        for provider_name in chain:
            provider = self._providers[provider_name]
            try:
                logger.info(
                    "llm_request",
                    task=task,
                    provider=provider_name,
                    use_search=use_search,
                )

                if provider_name == "gemini" and isinstance(provider, GeminiProvider):
                    response = await provider.generate(
                        prompt=prompt,
                        system_prompt=system_prompt,
                        use_search=use_search,
                        model=model,
                        temperature=temperature,
                    )
                elif provider_name == "groq" and isinstance(provider, GroqProvider):
                    response = await provider.generate(
                        prompt=prompt,
                        system_prompt=system_prompt,
                        model=model,
                        temperature=temperature,
                    )
                elif provider_name == "lm_studio" and isinstance(provider, LMStudioProvider):
                    response = await provider.generate(
                        prompt=prompt,
                        system_prompt=system_prompt,
                        model=model,
                        temperature=temperature,
                    )
                else:
                    continue

                logger.info(
                    "llm_response",
                    task=task,
                    provider=provider_name,
                    length=len(response.text),
                )
                return response

            except Exception as e:
                last_error = e
                logger.warning(
                    "llm_provider_failed",
                    task=task,
                    provider=provider_name,
                    error=str(e),
                )
                continue

        raise RuntimeError(
            f"All LLM providers failed for task '{task}'. Last error: {last_error}"
        )

    async def generate_with_image(
        self,
        prompt: str,
        image_path: str,
    ) -> LLMResponse:
        self._init_providers()

        if "gemini" in self._providers:
            provider = self._providers["gemini"]
            return await provider.generate_with_image(prompt, image_path)

        raise RuntimeError("Gemini API key required for multimodal image processing")

    async def execute_multi_shot(
        self,
        prompt_generator: Any,
        system_prompt: Optional[str] = None,
        shots_per_model: Optional[int] = None,
        temperatures: Optional[List[float]] = None,
        on_call_start: Optional[Any] = None,
        on_call_complete: Optional[Any] = None,
    ) -> List[LLMResponse]:
        """
        Execute prompt across configured models (Groq Llama 70B & 8B, LM Studio Qwen 8B & Qwen 3 VL 4B).
        Uses varying temperatures from 0.2 to 0.8.
        """
        self._init_providers()
        shots = shots_per_model or getattr(settings, "LLM_SHOTS_PER_MODEL", 3)
        if not temperatures:
            # Temperature levels across shots
            temperatures = [0.2 + (0.6 / max(1, shots - 1)) * i for i in range(shots)]

        tasks = []
        for model_spec in MODELS_CATALOG:
            provider_name = model_spec["provider"]
            model_name = model_spec["model"]
            label = model_spec.get("label", f"{provider_name}:{model_name}")
            provider = self._providers.get(provider_name)
            if not provider:
                continue

            for shot_idx, temp in enumerate(temperatures[:shots]):
                prompt = prompt_generator(shot_idx, temp) if callable(prompt_generator) else prompt_generator

                async def _call_single(p_name=provider_name, m_name=model_name, m_label=label, p=prompt, t=temp, s_idx=shot_idx):
                    if on_call_start:
                        try:
                            await on_call_start(provider=p_name, model=m_name, label=m_label, shot=s_idx + 1)
                        except Exception:
                            pass
                    try:
                        # Slight stagger per shot to avoid blasting API endpoints simultaneously
                        if s_idx > 0:
                            await asyncio.sleep(0.3 * s_idx)

                        resp = None
                        if p_name == "groq":
                            resp = await self._providers["groq"].generate(
                                prompt=p,
                                system_prompt=system_prompt,
                                model=m_name,
                                temperature=t,
                            )
                        elif p_name == "lm_studio":
                            resp = await self._providers["lm_studio"].generate(
                                prompt=p,
                                system_prompt=system_prompt,
                                model=m_name,
                                temperature=t,
                            )

                        if on_call_complete:
                            try:
                                await on_call_complete(provider=p_name, model=m_name, label=m_label, shot=s_idx + 1, success=resp is not None)
                            except Exception:
                                pass
                        return resp
                    except Exception as e:
                        logger.warning(
                            "multi_shot_call_failed",
                            provider=p_name,
                            model=m_name,
                            shot=s_idx,
                            error=str(e),
                        )
                        if on_call_complete:
                            try:
                                await on_call_complete(provider=p_name, model=m_name, label=m_label, shot=s_idx + 1, success=False, error=str(e)[:80])
                            except Exception:
                                pass
                        return None

                tasks.append(_call_single())

        results = await asyncio.gather(*tasks, return_exceptions=False)
        successful_responses = [r for r in results if r is not None and isinstance(r, LLMResponse)]
        logger.info(
            "multi_shot_execution_complete",
            total_attempted=len(tasks),
            successful=len(successful_responses),
        )
        return successful_responses

    def available_providers(self) -> List[str]:
        self._init_providers()
        return list(self._providers.keys())
