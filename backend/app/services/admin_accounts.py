"""Admin-site accounts: email + password, separate from Telegram.

The very first account becomes the owner and must prove it with the setup code (the server's admin
password from .env, or the one changed later). After that anyone may register, but stays pending
until an owner approves them. A session token carries a fingerprint of the password hash, so a
password change or reset signs that account's old sessions out.
"""
import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.security import create_token
from ..models import AdminAccount

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)
TOKEN_HOURS = 12
_SCRYPT = dict(n=2 ** 14, r=8, p=1, dklen=32)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"{salt.hex()}${hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT).hex()}"


def check_password(password: str, stored: str) -> bool:
    salt, digest = stored.split("$", 1)
    return hmac.compare_digest(hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **_SCRYPT).hex(), digest)


def fingerprint(account: AdminAccount) -> str:
    return hashlib.sha256(account.password_hash.encode()).hexdigest()[:12]


def issue_token(account: AdminAccount) -> str:
    return create_token(f"acct:{account.id}:{fingerprint(account)}", "admin", TOKEN_HOURS)


def normalize_email(email: str) -> str:
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Email noto'g'ri")
    return email


async def owners_count(session: AsyncSession) -> int:
    return await session.scalar(select(func.count()).select_from(AdminAccount).where(
        AdminAccount.role == "owner", AdminAccount.status == "active"))


async def touch_login(session: AsyncSession, account: AdminAccount) -> None:
    account.last_login_at = datetime.now(UTC)
    await session.commit()
