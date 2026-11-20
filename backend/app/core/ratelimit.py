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


def recent(key: str, window_seconds: float) -> int:
    """How many hits `key` had within the window, without adding one."""
    now = time.time()
    hits = [t for t in _hits.get(key, []) if now - t < window_seconds]
    _hits[key] = hits
    return len(hits)


def hit(key: str) -> None:
    _hits[key].append(time.time())


GUESSES, GUESS_WINDOW = 8, 15 * 60
GUESS_MESSAGE = "Joriy parol 8 marta noto'g'ri kiritildi. 15 daqiqadan keyin qayta urinib ko'ring."


def check_guesses(key: str) -> None:
    """Wrong current passwords on a signed-in session (password or e-mail change): the same 8 per 15 minutes
    as the sign-in page, so an unattended session cannot be used to guess the password."""
    if recent(key, GUESS_WINDOW) >= GUESSES:
        raise HTTPException(429, GUESS_MESSAGE)


def reset() -> None:
    _hits.clear()
