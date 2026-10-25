import asyncio
import re
import time
from collections import defaultdict
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from pydantic import AfterValidator, BaseModel, Field, StringConstraints
from sqlalchemy import select

from ..core import ratelimit
from ..core.config import settings
from ..core.security import InitDataError, create_token, validate_init_data, validate_login_widget
from ..models import User
from ..schemas import DevAuthIn, TelegramAuthIn, TokenOut
from ..services import bots, telegram_bot, web_login
from ..services.admin_accounts import check_password, hash_password
from .deps import Session

router = APIRouter(prefix="/auth", tags=["auth"])

USER_TOKEN_HOURS = 24 * 7


async def _upsert(session: Session, telegram_id: int, full_name: str, username: str | None,
                  photo_url: str | None) -> User:
    user = (await session.execute(select(User).where(User.telegram_id == telegram_id))).scalar_one_or_none()
    if user is None:
        user = User(telegram_id=telegram_id, full_name=full_name, username=username, photo_url=photo_url)
        session.add(user)
    else:
        # Telegram is the source of truth for username and photo, and for the name until the person edits it
        user.username, user.photo_url = username, photo_url
        if not user.name_set_by_user:
            user.full_name = full_name
    user.last_seen_at = datetime.now(UTC)
    await session.commit()
    return user


async def _check(session: Session, check) -> tuple[dict, bool]:
    """Validates with the current bot, then with the previous one (people still opening the old bot).
    Returns the Telegram user and whether the old bot was used."""
    current, previous = await bots.current_and_previous(session)
    if not current:
        raise HTTPException(503, "Bot hali sozlanmagan: admin panelda bot tokenini kiriting")
    try:
        return check(current), False
    except InitDataError as exc:
        if previous:
            try:
                return check(previous), True
            except InitDataError:
                pass
        raise HTTPException(401, f"Telegram tekshiruvidan o'tmadi: {exc}") from exc


@router.post("/telegram", response_model=TokenOut)
async def telegram_login(body: TelegramAuthIn, session: Session) -> TokenOut:
    tg, old_bot = await _check(session, lambda token: validate_init_data(body.init_data, token, settings.init_data_max_age))
    full_name = " ".join(filter(None, [tg.get("first_name"), tg.get("last_name")])) or "Talaba"
    user = await _upsert(session, int(tg["id"]), full_name[:128], tg.get("username"), tg.get("photo_url"))
    return TokenOut(token=create_token(str(user.id), "user", USER_TOKEN_HOURS),
                    moved_to=await bots.username(session) if old_bot else None)


class WidgetAuthIn(BaseModel):
    id: int
    first_name: str = Field(default="", max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    username: str | None = Field(default=None, max_length=64)
    photo_url: str | None = Field(default=None, max_length=512)
    auth_date: int
    hash: str = Field(max_length=128)


@router.post("/telegram-web", response_model=TokenOut)
async def telegram_web_login(body: WidgetAuthIn, session: Session) -> TokenOut:
    """Sign-in on the website (outside Telegram) with the Telegram Login Widget: the same account
    as in the Telegram app, no separate password."""
    fields = body.model_dump(exclude_none=True)
    tg, _ = await _check(session, lambda token: validate_login_widget(fields, token, settings.init_data_max_age))
    full_name = " ".join(filter(None, [tg.get("first_name"), tg.get("last_name")])) or "Talaba"
    user = await _upsert(session, int(tg["id"]), full_name[:128], tg.get("username"), tg.get("photo_url"))
    return TokenOut(token=create_token(str(user.id), "user", USER_TOKEN_HOURS))


@router.get("/mode")
async def mode(session: Session) -> dict:
    """Tells the app whether the browser sign-in for development is available."""
    return {"dev": settings.app_env == "dev", "bot_username": await bots.username(session)}


@router.post("/dev", response_model=TokenOut, include_in_schema=False)
async def dev_login(body: DevAuthIn, session: Session) -> TokenOut:
    """Browser sign-in for local development only; disabled unless APP_ENV=dev."""
    if settings.app_env != "dev":
        raise HTTPException(404)
    user = await _upsert(session, body.telegram_id, body.full_name, body.username, None)
    return TokenOut(token=create_token(str(user.id), "user", USER_TOKEN_HOURS))




# --------------------------------------------------------------------------- website: through the bot

@router.post("/bot-login")
async def bot_login_start(request: Request, session: Session) -> dict:
    """A one-time link to the bot. Works on any domain: no Telegram login-widget setup is needed."""
    ratelimit.limit(f"bot-login:{ratelimit.client_ip(request)}", 30, 60 * 60)
    username = await bots.username(session)
    if not username:
        raise HTTPException(503, "Bot hali sozlanmagan")
    code = await web_login.create(session)
    return {"code": code, "url": telegram_bot.start_link(username, web_login.PREFIX + code),
            "expires_in": int(web_login.TTL.total_seconds())}


@router.get("/bot-login/{code}")
async def bot_login_status(code: str, session: Session) -> dict:
    status, note = await web_login.poll(session, code[:40])
    return {"status": status, "note": note}


class PinIn(BaseModel):
    pin: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


@router.post("/bot-login/{code}/verify", response_model=TokenOut)
async def bot_login_verify(code: str, body: PinIn, session: Session) -> TokenOut:
    """The PIN the bot showed after "Ha": only the browser that asked can finish the sign-in."""
    user_id = await web_login.verify_login(session, code[:40], body.pin, _upsert)
    return TokenOut(token=create_token(str(user_id), "user", USER_TOKEN_HOURS))


# --------------------------------------------------------------------------- website: email and password

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)


def _email(value: str) -> str:
    value = value.strip().lower()
    if not EMAIL_RE.match(value):
        raise ValueError("Email noto'g'ri: masalan, ism@gmail.com")
    return value


Email = Annotated[str, StringConstraints(max_length=160), AfterValidator(_email)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class RegisterIn(BaseModel):
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=128)]
    email: Email
    password: Password


class LoginIn(BaseModel):
    email: Email
    password: str = Field(max_length=128)


FAILS_ALLOWED, FAIL_WINDOW = 8, 15 * 60       # wrong passwords per email
IP_LOGINS, IP_REGISTERS, IP_WINDOW = 40, 10, 60 * 60
_fails: dict[str, list[float]] = defaultdict(list)
_by_ip: dict[str, list[float]] = defaultdict(list)


def _recent(store: dict[str, list[float]], key: str, window: float) -> list[float]:
    now = time.time()
    if len(store) > 20_000:                    # keeps memory bounded: forget keys with nothing recent
        for k in [k for k, v in store.items() if not v or now - v[-1] > window]:
            store.pop(k, None)
    store[key] = [t for t in store.get(key, []) if now - t < window]
    return store[key]


def _check_rate(email: str) -> None:
    if len(_recent(_fails, email, FAIL_WINDOW)) >= FAILS_ALLOWED:
        raise HTTPException(429, "Juda ko'p noto'g'ri urinish. 15 daqiqadan keyin qayta urinib ko'ring.")


def _check_ip(request: Request, limit: int, kind: str) -> None:
    ip = f"{kind}:{request.client.host if request.client else '-'}"
    hits = _recent(_by_ip, ip, IP_WINDOW)
    if len(hits) >= limit:
        raise HTTPException(429, "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.")
    hits.append(time.time())


@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn, request: Request, session: Session) -> TokenOut:
    """A website account without Telegram. Telegram can be tied to it later from the profile."""
    _check_ip(request, IP_REGISTERS, "register")
    taken = HTTPException(409, "Bu email bilan akkaunt bor. «Kirish» bo'limidan kiring.")
    if await session.scalar(select(User.id).where(User.email == body.email)):
        raise taken
    user = User(telegram_id=None, email=body.email, password_hash=await asyncio.to_thread(hash_password, body.password),
                full_name=" ".join(body.full_name.split()), name_set_by_user=True, last_seen_at=datetime.now(UTC))
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:              # the same email registered at the same moment
        await session.rollback()
        raise taken from exc
    return TokenOut(token=create_token(str(user.id), "user", USER_TOKEN_HOURS))


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, request: Request, session: Session) -> TokenOut:
    _check_rate(body.email)
    _check_ip(request, IP_LOGINS, "login")
    user = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if user is None or not user.password_hash or not await asyncio.to_thread(check_password, body.password, user.password_hash):
        _fails[body.email].append(time.time())
        raise HTTPException(401, "Email yoki parol noto'g'ri")
    if user.is_blocked:
        raise HTTPException(403, "Hisobingiz bloklangan. Savollar bo'lsa, adminga yozing.")
    _fails.pop(body.email, None)
    user.last_seen_at = datetime.now(UTC)
    await session.commit()
    return TokenOut(token=create_token(str(user.id), "user", USER_TOKEN_HOURS))
