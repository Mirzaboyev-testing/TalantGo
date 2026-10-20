"""Signing in on the website through the bot, and tying an email account to a Telegram account.

The website asks for a code and shows a t.me link (?start=login_<code>). In the bot the person sees what is
being asked and confirms with a reply-keyboard button (a plain message, so the webhook needs no extra update
types). The website polls the code and receives a session once the request is confirmed.

purpose="login": the Telegram account signs in on the website (created if new).
purpose="link":  a website account (email and password) gets this Telegram account, so the bot and the
                 website open the same profile.
"""
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import LoginRequest, Submission, User
from . import telegram_bot

TTL = timedelta(minutes=5)
PREFIX = "login_"
YES = "✅ Ha, tasdiqlayman"
NO = "❌ Yo'q"


def _expired(req: LoginRequest) -> bool:
    return datetime.now(UTC) - req.created_at > TTL


async def create(session: AsyncSession, purpose: str = "login", link_user_id: int | None = None) -> str:
    await session.execute(delete(LoginRequest).where(LoginRequest.created_at < datetime.now(UTC) - timedelta(days=1)))
    code = secrets.token_urlsafe(16)                 # 22 characters of [A-Za-z0-9_-]: valid in a start payload
    session.add(LoginRequest(code=code, purpose=purpose, link_user_id=link_user_id))
    await session.commit()
    return code


async def _reply(token: str, chat_id: int, text: str, keyboard: bool = False) -> None:
    markup = ({"keyboard": [[{"text": YES}, {"text": NO}]], "resize_keyboard": True, "one_time_keyboard": True}
              if keyboard else {"remove_keyboard": True})
    await telegram_bot.call(token, "sendMessage", chat_id=chat_id, text=text, reply_markup=markup)


async def on_start(session: AsyncSession, token: str, chat_id: int, sender: dict, code: str) -> None:
    req = await session.get(LoginRequest, code)
    if req is None or req.status != "pending" or _expired(req):
        await _reply(token, chat_id, "Bu havola eskirgan. Saytda tugmani qaytadan bosing.")
        return
    req.telegram_id, req.status = int(sender["id"]), "claimed"
    await session.commit()
    if req.purpose == "link":
        target = await session.get(User, req.link_user_id)
        text = (f"TalantGo profilingizni ({target.email if target else 'sayt akkaunti'}) shu Telegram akkauntga ulash so'rovi.\n\n"
                "Ulangach bot va sayt bitta akkaunt bilan ishlaydi. Agar bu so'rovni siz yubormagan bo'lsangiz, «Yo'q» ni bosing.")
    else:
        text = ("Kompyuterdagi TalantGo saytiga shu Telegram akkaunt bilan kirish so'rovi.\n\n"
                "Agar hozir saytda «Telegram orqali davom etish» ni siz bosgan bo'lsangiz, tasdiqlang. "
                "Aks holda «Yo'q» ni bosing.")
    await _reply(token, chat_id, text, keyboard=True)


async def _bare(session: AsyncSession, user: User) -> bool:
    """An account someone opened in the bot but never used: safe to retire when linking."""
    if user.track_id or user.consent_at or user.company_id or user.staff_university_id or user.email:
        return False
    return not await session.scalar(select(func.count()).select_from(Submission).where(Submission.user_id == user.id))


async def on_answer(session: AsyncSession, token: str, chat_id: int, sender: dict, yes: bool, upsert) -> None:
    """`upsert(session, telegram_id, full_name, username, photo_url)` creates or refreshes a Telegram account."""
    req = (await session.execute(select(LoginRequest).where(
        LoginRequest.telegram_id == int(sender["id"]), LoginRequest.status == "claimed")
        .order_by(LoginRequest.created_at.desc()).limit(1))).scalar_one_or_none()
    if req is None or _expired(req):
        await _reply(token, chat_id, "Faol so'rov topilmadi. Saytda tugmani qaytadan bosing.")
        return
    if not yes:
        req.status = "rejected"
        await session.commit()
        await _reply(token, chat_id, "Bekor qilindi. Hech kim akkauntingizga kirmadi.")
        return
    tg_id = int(sender["id"])
    full_name = " ".join(filter(None, [sender.get("first_name"), sender.get("last_name")])) or "Talaba"
    if req.purpose == "login":
        user = await upsert(session, tg_id, full_name[:128], sender.get("username"), None)
        req.user_id, req.status = user.id, "confirmed"
        await session.commit()
        await _reply(token, chat_id, "Tayyor! Kompyuterdagi brauzerga qayting: sayt o'zi ochiladi.")
        return
    target = await session.get(User, req.link_user_id)
    other = (await session.execute(select(User).where(User.telegram_id == tg_id))).scalar_one_or_none()
    if target is None:
        req.status = "rejected"
    elif other is not None and other.id != target.id:
        if await _bare(session, other):
            other.telegram_id, other.is_blocked = None, True          # the empty bot-only account steps aside
        else:
            req.status, req.note = "conflict", "Bu Telegram akkaunt boshqa TalantGo profiliga ulangan va unda ma'lumotlar bor."
    if req.status == "claimed" and target is not None:
        await session.flush()
        target.telegram_id, target.username = tg_id, sender.get("username")
        req.user_id, req.status = target.id, "confirmed"
    await session.commit()
    if req.status == "confirmed":
        await _reply(token, chat_id, "Tayyor! Telegram profilingizga ulandi: endi bot va sayt bitta akkaunt bilan ishlaydi.")
    elif req.status == "conflict":
        await _reply(token, chat_id, "Ulab bo'lmadi: bu Telegram akkaunt boshqa TalantGo profiliga ulangan va unda "
                                     "ma'lumotlar bor. O'sha profilga kirib, «Profil» bo'limida email va parol qo'shing.")
    else:
        await _reply(token, chat_id, "So'rov bekor qilindi.")


async def poll(session: AsyncSession, code: str) -> tuple[str, int | None, str]:
    """(status, user_id when a login session should be issued now, note). A confirmed request is used once."""
    req = await session.get(LoginRequest, code)
    if req is None:
        return "expired", None, ""
    if req.status in ("pending", "claimed") and _expired(req):
        return "expired", None, ""
    if req.status == "confirmed":
        req.status = "used"
        await session.commit()
        return "confirmed", req.user_id, ""
    return req.status, None, req.note
