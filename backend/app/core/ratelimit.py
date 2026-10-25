"""In-memory sliding-window limits. One uvicorn process serves the app, so a dict is enough;
move this to Redis before running several workers."""
import time
from collections import defaultdict

from fastapi import HTTPException, Request

_hits: dict[str, list[float]] = defaultdict(list)
TOO_MANY = "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring."


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "-"


def limit(key: str, max_hits: int, window_seconds: float, message: str = TOO_MANY) -> None:
    """Counts one hit for `key`; raises 429 once `max_hits` happened within the window."""
    now = time.time()
    if len(_hits) > 20_000:                    # keeps memory bounded: forget keys with nothing recent
        for k in [k for k, v in _hits.items() if not v or now - v[-1] > 86_400]:
            _hits.pop(k, None)
    hits = [t for t in _hits[key] if now - t < window_seconds]
    if len(hits) >= max_hits:
        _hits[key] = hits
        raise HTTPException(429, message)
    hits.append(now)
    _hits[key] = hits


def reset() -> None:
    _hits.clear()
