"""Retry utilities with exponential backoff for external service calls."""

import asyncio
import functools
from typing import TypeVar, Callable, Any, Type, Tuple
from app.utils.logging import get_logger

logger = get_logger("retry")

T = TypeVar("T")


async def retry_async(
    func: Callable[..., Any],
    *args: Any,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    backoff_factor: float = 2.0,
    retry_exceptions: Tuple[Type[Exception], ...] = (Exception,),
    **kwargs: Any,
) -> Any:
    """
    Retry an async function with exponential backoff.

    Args:
        func: Async function to retry
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay between retries (seconds)
        max_delay: Maximum delay between retries (seconds)
        backoff_factor: Multiplier for delay after each retry
        retry_exceptions: Tuple of exception types to retry on
    """
    last_exception = None
    for attempt in range(max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except retry_exceptions as e:
            last_exception = e
            if attempt < max_retries:
                delay = min(base_delay * (backoff_factor ** attempt), max_delay)
                logger.warning(
                    "retry_attempt",
                    func=func.__name__,
                    attempt=attempt + 1,
                    max_retries=max_retries,
                    delay=delay,
                    error=str(e),
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    "retry_exhausted",
                    func=func.__name__,
                    attempts=max_retries + 1,
                    error=str(e),
                )

    raise last_exception  # type: ignore


def with_retry(
    max_retries: int = 3,
    base_delay: float = 1.0,
    retry_exceptions: Tuple[Type[Exception], ...] = (Exception,),
):
    """Decorator for async functions that adds retry with exponential backoff."""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            return await retry_async(
                func, *args,
                max_retries=max_retries,
                base_delay=base_delay,
                retry_exceptions=retry_exceptions,
                **kwargs,
            )
        return wrapper
    return decorator
