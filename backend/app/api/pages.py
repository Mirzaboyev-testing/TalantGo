"""Server-rendered pages that live outside the Telegram app: the shareable CV and the bot webhook."""
import hmac
import logging
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import select

from ..core.config import settings
from ..models import User
from ..services import bots, telegram_bot, web_login
from ..services.cv import build_cv
from .deps import Session

log = logging.getLogger("careerflow")
router = APIRouter(include_in_schema=False)
templates = Jinja2Templates(directory=Path(__file__).resolve().parent.parent / "templates")


@router.get("/cv/{slug}", response_class=HTMLResponse)
async def cv_page(slug: str, request: Request, session: Session) -> HTMLResponse:
    user = (await session.execute(select(User).where(User.cv_slug == slug))).scalar_one_or_none()
    if user is None or not user.cv_public:
        raise HTTPException(404, "CV topilmadi yoki egasi uni yopiq qilgan")
    return templates.TemplateResponse(request, "cv.html", {"cv": await build_cv(session, user)})


@router.post("/telegram/webhook")
async def webhook(update: dict, session: Session,
                  x_telegram_bot_api_secret_token: str | None = Header(default=None)) -> dict:
    current, previous = await bots.current_and_previous(session)
    secret = x_telegram_bot_api_secret_token
    def same(token: str | None) -> bool:
        return bool(token and secret) and hmac.compare_digest(secret, telegram_bot.webhook_secret(token))
    if same(current):
        token, old_bot = current, False
    elif same(previous):
        token, old_bot = previous, True
    else:
        raise HTTPException(403)
    try:
        return await _handle(update, session, token, old_bot)
    except Exception:                          # a 500 would make Telegram redeliver the same update forever
        log.exception("webhook update failed")
        await session.rollback()
        return {"ok": True}


async def _handle(update: dict, session: Session, token: str, old_bot: bool) -> dict:
    message = update.get("message") or {}
    contact = message.get("contact")
    sender = (message.get("from") or {}).get("id")
    if contact and sender and contact.get("user_id") == sender:
        # The user shared their own number with the bot (WebApp.requestContact): Telegram vouches for it.
        user = (await session.execute(select(User).where(User.telegram_id == sender))).scalar_one_or_none()
        if user:
            phone = "+" + contact.get("phone_number", "").lstrip("+")
            user.phone, user.phone_verified = phone[:20], True
            await session.commit()
        return {"ok": True}
    text = message.get("text", "")
    private = message.get("chat", {}).get("type") == "private"
    if old_bot:
        # the old bot only points to the new one; an invite code (/start r12, g<code>, hr) is carried over
        new_username = await bots.username(session)
        if private and sender and new_username:
            payload = text.removeprefix("/start").strip() if text.startswith("/start") else ""
            try:
                await telegram_bot.send_moved(token, message["chat"]["id"], new_username, payload)
            except telegram_bot.BotError as exc:
                log.warning("old bot could not answer: %s", exc)
        return {"ok": True}
    if private and sender and (text.startswith("/start " + web_login.PREFIX) or text in (web_login.YES, web_login.NO)):
        try:
            if text.startswith("/start"):
                await web_login.on_start(session, token, message["chat"]["id"], message["from"],
                                         text.removeprefix("/start").strip()[len(web_login.PREFIX):][:40])
            else:
                await web_login.on_answer(session, token, message["chat"]["id"], message["from"], text == web_login.YES)
        except telegram_bot.BotError as exc:
            log.warning("website sign-in message failed: %s", exc)
        return {"ok": True}
    if text.startswith("/start") and private and sender:
        payload = text.removeprefix("/start").strip()
        role = {"hr": "employer", "uni": "university"}.get(payload)
        if payload.startswith("r") and payload[1:].isdigit() and 0 < int(payload[1:]) < 2 ** 31:
            await _remember_referral(session, message["from"], int(payload[1:]))
        join = payload[1:] if payload.startswith("g") and len(payload) > 4 else None
        try:
            await telegram_bot.send_welcome(token, message["chat"]["id"], settings.public_url, role,
                                            **({"join": join} if join else {}))
        except telegram_bot.BotError as exc:     # never make Telegram retry the update
            log.warning("welcome message failed: %s", exc)
    return {"ok": True}


async def _remember_referral(session: Session, sender: dict, referrer_id: int) -> None:
    """A friend's invite link (t.me/<bot>?start=r<id>): remember who brought this person.
    Only for people who are new to CareerFlow; existing accounts are never re-attributed."""
    if await session.scalar(select(User.id).where(User.telegram_id == sender["id"])):
        return
    referrer = await session.get(User, referrer_id)
    if referrer is None:
        return
    name = " ".join(filter(None, [sender.get("first_name"), sender.get("last_name")])) or "Talaba"
    session.add(User(telegram_id=sender["id"], full_name=name[:128], username=sender.get("username"),
                     referred_by_id=referrer.id))
    await session.commit()
