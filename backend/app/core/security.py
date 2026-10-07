"""Instance key, encrypted settings, access tokens, Telegram initData validation.

One random key per installation lives in a file outside the database (secrets volume). Settings such
as the bot token are stored encrypted with it, so a database dump carries no usable token.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qsl

import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import settings

_key_cache: bytes | None = None


def instance_key() -> bytes:
    global _key_cache
    if _key_cache:
        return _key_cache
    path = Path(settings.secrets_dir) / "instance.key"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())
        path.chmod(0o600)
    _key_cache = base64.urlsafe_b64decode(path.read_text().strip())
    return _key_cache


def _subkey(purpose: str) -> bytes:
    return hashlib.blake2b(instance_key(), person=purpose.encode()[:16], digest_size=32).digest()


def encrypt(value: str) -> str:
    nonce = secrets.token_bytes(12)
    return base64.urlsafe_b64encode(nonce + AESGCM(_subkey("settings")).encrypt(nonce, value.encode(), None)).decode()


def decrypt(blob: str) -> str:
    raw = base64.urlsafe_b64decode(blob)
    return AESGCM(_subkey("settings")).decrypt(raw[:12], raw[12:], None).decode()


def mask(value: str) -> str:
    return "…" if len(value) <= 12 else f"{value[:6]}…{value[-4:]}"


# --------------------------------------------------------------------------- access tokens

def create_token(subject: str, scope: str, hours: int) -> str:
    payload = {"sub": subject, "scope": scope, "exp": datetime.now(UTC) + timedelta(hours=hours)}
    return jwt.encode(payload, _subkey("jwt"), algorithm="HS256")


def read_token(token: str, scope: str) -> str | None:
    try:
        payload = jwt.decode(token, _subkey("jwt"), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return payload["sub"] if payload.get("scope") == scope else None


def check_admin_password(candidate: str) -> bool:
    return bool(settings.admin_password) and hmac.compare_digest(candidate.encode(), settings.admin_password.encode())


# --------------------------------------------------------------------------- Telegram

class InitDataError(ValueError):
    pass


def validate_init_data(init_data: str, bot_token: str, max_age: int, now: float | None = None) -> dict:
    """Verify Telegram.WebApp.initData and return the `user` object.

    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
    hash   = hex(HMAC_SHA256(key=secret, msg=sorted "k=v" lines without `hash`, joined by "\n"))
    """
    fields = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=False))
    received = fields.pop("hash", None)
    if not received:
        raise InitDataError("hash yo'q")
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise InitDataError("imzo noto'g'ri")
    try:
        auth_date = int(fields["auth_date"])
        user = json.loads(fields["user"])
    except (KeyError, ValueError) as exc:
        raise InitDataError("ma'lumot to'liq emas") from exc
    if (now or time.time()) - auth_date > max_age:
        raise InitDataError("sessiya eskirgan, ilovani qayta oching")
    if not isinstance(user, dict) or "id" not in user:
        raise InitDataError("foydalanuvchi yo'q")
    return user
