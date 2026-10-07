"""Operator settings pasted in the admin page, stored encrypted. Only a masked hint is ever shown."""
import time

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.security import decrypt, encrypt, mask
from ..models import AppSetting

BOT_TOKEN = "telegram_bot_token"
_cache: dict[str, tuple[float, str | None]] = {}
_TTL = 30.0


async def get_value(session: AsyncSession, key: str) -> str | None:
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    row = await session.get(AppSetting, key)
    value = decrypt(row.ciphertext) if row else None
    _cache[key] = (time.monotonic() + _TTL, value)
    return value


async def set_value(session: AsyncSession, key: str, value: str) -> str:
    row = await session.get(AppSetting, key)
    hint = mask(value)
    if row:
        row.ciphertext, row.hint = encrypt(value), hint
    else:
        session.add(AppSetting(key=key, ciphertext=encrypt(value), hint=hint))
    await session.commit()
    _cache.pop(key, None)
    return hint


async def get_hint(session: AsyncSession, key: str) -> str | None:
    row = await session.get(AppSetting, key)
    return row.hint if row else None
