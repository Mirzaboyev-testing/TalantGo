"""Operator settings pasted in the admin page, stored encrypted. Only a masked hint is ever shown."""
import logging
import time

from cryptography.exceptions import InvalidTag
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.security import decrypt, encrypt, mask
from ..models import AppSetting

BOT_TOKEN = "telegram_bot_token"
PREVIOUS_BOT_TOKEN = "telegram_bot_token_previous"   # the old bot, kept while people move to the new one
GEMINI_KEY = "gemini_api_key"
_cache: dict[str, tuple[float, str | None]] = {}
_TTL = 30.0
log = logging.getLogger("careerflow.settings")


async def get_value(session: AsyncSession, key: str) -> str | None:
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    row = await session.get(AppSetting, key)
    try:
        value = decrypt(row.ciphertext) if row else None
    except (InvalidTag, ValueError):
        # saved under another instance key (e.g. copied from a different database): treat it as not set,
        # so the pages that read it keep working until an admin pastes the value again
        log.warning("setting %s cannot be decrypted with this instance key; treating it as empty", key)
        value = None
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


async def delete_value(session: AsyncSession, key: str) -> None:
    row = await session.get(AppSetting, key)
    if row:
        await session.delete(row)
        await session.commit()
    _cache.pop(key, None)


async def get_hint(session: AsyncSession, key: str) -> str | None:
    row = await session.get(AppSetting, key)
    return row.hint if row else None
