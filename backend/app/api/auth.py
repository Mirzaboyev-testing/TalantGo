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
from ..core.security import InitDataError, user_token, validate_init_data, validate_login_widget
from ..models import PasswordRequest, User
from ..schemas import DevAuthIn, TelegramAuthIn, TokenOut
from ..services import admin_inbox, bots, password_reset, telegram_bot, web_login
from ..services.admin_accounts import check_password, hash_password
from .deps import Session

router = APIRouter(prefix="/auth", tags=["auth"])


async def _upsert(session: Session, telegram_id: int, full_name: str, username: str | None,
                  photo_url: str | None) -> User:
    user = (await session.execute(select(User).where(User.telegram_id == telegram_id))).scalar_one_or_none()
    if user is None:
        user = User(telegram_id=telegram_id, full_name=full_name, username=username, photo_url=photo_url)
        session.add(user)
    else:
        # Telegram is the source of truth for username and photo, and for the name until the person edits it
        user.username = username
        if user.avatar_file_id is None:           # a photo uploaded on the profile wins
            user.photo_url = photo_url
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
    return TokenOut(token=user_token(user),
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
    return TokenOut(token=user_token(user))


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
    return TokenOut(token=user_token(user))




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
    return TokenOut(token=user_token(await session.get(User, user_id)))


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


# Wrong passwords for one account: 8 from one address, 40 from all addresses together. Keyed by address too, so a
# stranger typing someone's e-mail eight times no longer locks the owner out (2026-11-19 live test).
FAILS_ALLOWED, FAILS_ALLOWED_ALL, FAIL_WINDOW = 8, 40, 15 * 60
# Per IP, an hour. A whole class signs up from one campus Wi-Fi (one NAT address), so these are set for a room
# full of students, and only wrong passwords count against the IP: right ones from a shared address never block it.
IP_LOGIN_FAILS, IP_REGISTERS, IP_WINDOW = 60, 60, 60 * 60
_fails: dict[str, list[float]] = defaultdict(list)
_by_ip: dict[str, list[float]] = defaultdict(list)


def _recent(store: dict[str, list[float]], key: str, window: float) -> list[float]:
    now = time.time()
    if len(store) > 20_000:                    # keeps memory bounded: forget keys with nothing recent
        for k in [k for k, v in store.items() if not v or now - v[-1] > window]:
            store.pop(k, None)
    store[key] = [t for t in store.get(key, []) if now - t < window]
    return store[key]


def _client(request: Request) -> str:
    return request.client.host if request.client else "-"


def _check_rate(email: str, request: Request) -> None:
    if (len(_recent(_fails, f"{email}|{_client(request)}", FAIL_WINDOW)) >= FAILS_ALLOWED
            or len(_recent(_fails, email, FAIL_WINDOW)) >= FAILS_ALLOWED_ALL):
        raise HTTPException(429, "Juda ko'p noto'g'ri urinish. 15 daqiqadan keyin qayta urinib ko'ring.")


def _record_fail(email: str, request: Request) -> None:
    now = time.time()
    _fails[f"{email}|{_client(request)}"].append(now)
    _fails[email].append(now)


def _ip_key(request: Request, kind: str) -> str:
    return f"{kind}:{_client(request)}"


def _check_ip(request: Request, limit: int, kind: str, count: bool = True) -> None:
    """Raises 429 once `limit` hits happened from this address in the window; `count=False` only checks
    (the caller records a hit itself, e.g. only for a wrong password)."""
    hits = _recent(_by_ip, _ip_key(request, kind), IP_WINDOW)
    if len(hits) >= limit:
        raise HTTPException(429, "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.")
    if count:
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
    return TokenOut(token=user_token(user))


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, request: Request, session: Session) -> TokenOut:
    _check_rate(body.email, request)
    _check_ip(request, IP_LOGIN_FAILS, "login", count=False)
    user = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    # New people kept typing into "Kirish" before signing up (52 tries, one lockout, 2026-11-20 logs), so an unknown
    # e-mail says so plainly. Sign-up already tells whether an e-mail is taken, so this reveals nothing new.
    if user is None:
        _by_ip[_ip_key(request, "login")].append(time.time())
        raise HTTPException(404, "Bu email bilan akkaunt topilmadi. Platformada yangi bo'lsangiz, «Ro'yxatdan o'tish»ni bosing.")
    if not user.password_hash:
        raise HTTPException(409, "Bu akkauntga hali parol qo'yilmagan: Telegram orqali kiring yoki «Parolni unutdingizmi?» "
                                 "orqali parol o'rnating.")
    if not await asyncio.to_thread(check_password, body.password, user.password_hash):
        _record_fail(body.email, request)
        _by_ip[_ip_key(request, "login")].append(time.time())
        raise HTTPException(401, "Email yoki parol noto'g'ri")
    if user.is_blocked:
        raise HTTPException(403, "Hisobingiz bloklangan. Savollar bo'lsa, adminga yozing.")
    _fails.pop(f"{body.email}|{_client(request)}", None)
    user.last_seen_at = datetime.now(UTC)
    await session.commit()
    return TokenOut(token=user_token(user))


# --------------------------------------------------------------------------- forgotten password (services/password_reset.py)

class ForgotIn(BaseModel):
    email: Email


class ResetIn(BaseModel):
    password: Password
    token: str | None = Field(default=None, max_length=64)             # the link from the bot
    email: Email | None = None                                          # with `code`, or a new e-mail with `token`
    code: str | None = Field(default=None, pattern=r"^\d{6}$")


class HelpIn(BaseModel):
    email: Email
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=128)]
    phone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=7, max_length=20)]
    note: str = Field(default="", max_length=500)


@router.post("/password/forgot")
async def forgot_password(body: ForgotIn, request: Request, session: Session) -> dict:
    """Sends a code to the bot when the account has Telegram. The answer is the same either way."""
    ratelimit.limit(f"pw-forgot:{ratelimit.client_ip(request)}", 10, 60 * 60)
    ratelimit.limit(f"pw-forgot:{body.email}", 3, 15 * 60, "Kod yaqinda yuborildi. 15 daqiqadan keyin qayta so'rang.")
    user = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if user is not None and not user.is_blocked and user.telegram_id:
        await password_reset.send_by_bot(session, user)
    return {"ok": True}


@router.get("/password/reset/{token}")
async def reset_link(token: str, session: Session) -> dict:
    """What the reset page needs: whether the link still works and whether an e-mail has to be added."""
    reset = await password_reset.by_token(session, token[:64])
    user = await session.get(User, reset.user_id) if reset else None
    if user is None:
        raise HTTPException(404, "Havola eskirgan yoki ishlatilgan. Botda /parol buyrug'ini qayta yuboring.")
    return {"name": user.full_name.split()[0] if user.full_name else "", "email": user.email,
            "account_type": user.account_type}


@router.post("/password/reset", response_model=TokenOut)
async def reset_password(body: ResetIn, request: Request, session: Session) -> TokenOut:
    """A new password with the bot's link or the e-mail + code; signs the person in."""
    ratelimit.limit(f"pw-reset:{ratelimit.client_ip(request)}", 30, 60 * 60)
    if body.token:
        reset = await password_reset.by_token(session, body.token)
        new_email = body.email
    elif body.email and body.code:
        reset = await password_reset.by_code(session, body.email, body.code)
        new_email = None
    else:
        raise HTTPException(422, "Kodni yoki havolani yuboring")
    if reset is None:
        raise HTTPException(400, "Kod noto'g'ri yoki eskirgan. Yangi kod so'rang.")
    user = await password_reset.complete(session, reset, body.password, new_email)
    return TokenOut(token=user_token(user))


@router.post("/password/help")
async def password_help(body: HelpIn, request: Request, session: Session) -> dict:
    """No Telegram (or no code came): the owner gets the request and calls the person back."""
    ratelimit.limit(f"pw-help:{ratelimit.client_ip(request)}", 5, 60 * 60)
    user = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    open_one = await session.scalar(select(PasswordRequest.id).where(
        PasswordRequest.email == body.email, PasswordRequest.status == "open"))
    if open_one is None:
        session.add(PasswordRequest(kind="user", email=body.email, full_name=" ".join(body.full_name.split()),
                                    phone=body.phone, note=body.note.strip(), user_id=user.id if user else None))
        await session.commit()
        await admin_inbox.push(session, None, "password_request",
                               f"Parolni tiklash so'rovi: {' '.join(body.full_name.split())}, {body.email}, {body.phone}. "
                               "Telefon orqali tekshirib, «Talabalar va mentorlar» bo'limida tiklang.", "users")
    return {"ok": True}
