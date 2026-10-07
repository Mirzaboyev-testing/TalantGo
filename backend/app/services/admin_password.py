"""The owner's admin-page password.

Starts as ADMIN_PASSWORD from the server's .env; once the owner changes it in the admin page, a
scrypt hash in app_config wins and the .env value is no longer accepted. Admin sessions carry a
fingerprint of the current password, so changing it signs every old session out.
"""
import hashlib
import hmac
import secrets

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..models import AppConfig

KEY = "admin_password"
_SCRYPT = dict(n=2 ** 14, r=8, p=1, dklen=32)


def _hash(password: str, salt: bytes) -> str:
    return hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT).hex()


async def verify(session: AsyncSession, candidate: str) -> bool:
    row = await session.get(AppConfig, KEY)
    if row:
        return hmac.compare_digest(_hash(candidate, bytes.fromhex(row.value["salt"])), row.value["hash"])
    return bool(settings.admin_password) and hmac.compare_digest(candidate.encode(), settings.admin_password.encode())


async def fingerprint(session: AsyncSession) -> str:
    row = await session.get(AppConfig, KEY)
    base = row.value["hash"] if row else f"env:{settings.admin_password}"
    return hashlib.sha256(base.encode()).hexdigest()[:16]


async def change(session: AsyncSession, new_password: str) -> None:
    salt = secrets.token_bytes(16)
    value = {"salt": salt.hex(), "hash": _hash(new_password, salt)}
    row = await session.get(AppConfig, KEY)
    if row:
        row.value = value
    else:
        session.add(AppConfig(key=KEY, value=value))
    await session.commit()
