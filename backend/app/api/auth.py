from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..core.config import settings
from ..core.security import InitDataError, create_token, validate_init_data, validate_login_widget
from ..models import User
from ..schemas import DevAuthIn, TelegramAuthIn, TokenOut
from ..services import settings_store
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
    bot_token = await settings_store.get_value(session, settings_store.BOT_TOKEN)
    if not bot_token:
        raise HTTPException(503, "Bot hali sozlanmagan")
    try:
        tg = validate_login_widget(body.model_dump(exclude_none=True), bot_token, settings.init_data_max_age)
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


