import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..core.config import settings
from ..core.security import InitDataError, check_admin_password, create_token, validate_init_data
from ..models import User
from ..schemas import AdminLoginIn, DevAuthIn, TelegramAuthIn, TokenOut
from ..services import settings_store
from .deps import Session

router = APIRouter(prefix="/auth", tags=["auth"])

USER_TOKEN_HOURS = 24 * 7
ADMIN_TOKEN_HOURS = 12


async def _upsert(session: Session, telegram_id: int, full_name: str, username: str | None,
                  photo_url: str | None) -> User:
    user = (await session.execute(select(User).where(User.telegram_id == telegram_id))).scalar_one_or_none()
    if user is None:
        user = User(telegram_id=telegram_id, full_name=full_name, username=username, photo_url=photo_url)
        session.add(user)
    else:
        # Telegram is the source of truth for name, username and photo: they change there
        user.full_name, user.username, user.photo_url = full_name, username, photo_url
    user.last_seen_at = datetime.now(UTC)
    await session.commit()
    return user


@router.post("/telegram", response_model=TokenOut)
async def telegram_login(body: TelegramAuthIn, session: Session) -> TokenOut:
    bot_token = await settings_store.get_value(session, settings_store.BOT_TOKEN)
    if not bot_token:
        raise HTTPException(503, "Bot hali sozlanmagan: admin panelda bot tokenini kiriting")
    try:
        tg = validate_init_data(body.init_data, bot_token, settings.init_data_max_age)
    except InitDataError as exc:
        raise HTTPException(401, f"Telegram tekshiruvidan o'tmadi: {exc}") from exc
    full_name = " ".join(filter(None, [tg.get("first_name"), tg.get("last_name")])) or "Talaba"
    user = await _upsert(session, int(tg["id"]), full_name[:128], tg.get("username"), tg.get("photo_url"))
    return TokenOut(token=create_token(str(user.id), "user", USER_TOKEN_HOURS))


@router.get("/mode")
async def mode() -> dict:
    """Tells the app whether the browser sign-in for development is available."""
    return {"dev": settings.app_env == "dev"}


@router.post("/dev", response_model=TokenOut, include_in_schema=False)
async def dev_login(body: DevAuthIn, session: Session) -> TokenOut:
    """Browser sign-in for local development only; disabled unless APP_ENV=dev."""
    if settings.app_env != "dev":
        raise HTTPException(404)
    user = await _upsert(session, body.telegram_id, body.full_name, body.username, None)
    return TokenOut(token=create_token(str(user.id), "user", USER_TOKEN_HOURS))


@router.post("/admin", response_model=TokenOut)
async def admin_login(body: AdminLoginIn) -> TokenOut:
    if not check_admin_password(body.password):
        await asyncio.sleep(1)              # slows down password guessing
        raise HTTPException(401, "Parol noto'g'ri")
    return TokenOut(token=create_token("admin", "admin", ADMIN_TOKEN_HOURS))
