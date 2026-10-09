from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..core.config import settings
from ..core.security import InitDataError, create_token, validate_init_data, validate_login_widget
from ..models import User
from ..schemas import DevAuthIn, TelegramAuthIn, TokenOut
from ..services import bots
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


