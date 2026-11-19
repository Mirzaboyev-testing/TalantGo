"""A few seconds of memory for answers every visitor asks for (the public home, jobs, companies and universities
lists). One uvicorn process serves the app, so a dict is enough; a new job or approval shows on those public
pages within TTL seconds, while every signed-in screen still reads live data.

The 2026-11-19 live load test: past ~50 people at once the single process ran out of CPU and the public lists
took over a second each; with this they cost one database round per TTL instead of one per visitor."""
import functools
import time
from collections.abc import Awaitable, Callable
from typing import Any

from .config import settings

TTL = 30.0
MAX_KEYS = 500              # a page of search results per key: enough for normal browsing, bounded for odd queries
_store: dict[tuple, tuple[float, Any]] = {}


async def cached(key: tuple, build: Callable[[], Awaitable[Any]], ttl: float = TTL) -> Any:
    if settings.app_env == "test":           # tests check numbers right after changing data
        return await build()
    now = time.monotonic()
    hit = _store.get(key)
    if hit is not None and now - hit[0] < ttl:
        return hit[1]
    value = await build()
    if len(_store) >= MAX_KEYS:
        _store.clear()
    _store[key] = (now, value)
    return value


def clear() -> None:
    _store.clear()


def public(name: str):
    """Caches a public GET route by its query parameters. Goes under @router.get; functools.wraps keeps the
    route's signature, so FastAPI still sees the same parameters and dependencies."""
    def wrap(route):
        @functools.wraps(route)
        async def cached_route(**kwargs):
            key = (name, *sorted((k, v) for k, v in kwargs.items() if k != "session"))
            return await cached(key, lambda: route(**kwargs))
        return cached_route
    return wrap
