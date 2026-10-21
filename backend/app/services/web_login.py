"""Signing in on the website through the bot, and tying an email account to a Telegram account.

1. The website asks for a code and shows a t.me link (?start=login_<code>).
2. In the bot the person sees what is asked and confirms with a reply-keyboard button (a plain message, so the
   webhook needs no extra update types).
3. The bot then shows a 6-digit PIN that has to be typed on that same website. Only the browser that asked can
   finish, so a link sent by someone else gives them nothing (the PIN stays in the victim's chat).

purpose="login": the Telegram account signs in on the website (a new account is created if there is none).
purpose="link":  a website account (email and password) gets this Telegram account, so the bot and the
                 website open the same profile.
"""
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import LoginRequest, Submission, User
from . import telegram_bot

TTL = timedelta(minutes=10)
PREFIX = "login_"
YES = "✅ Ha, tasdiqlayman"
NO = "❌ Yo'q"
MAX_PIN_TRIES = 5


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
    req.telegram_id, req.tg_username, req.status = int(sender["id"]), sender.get("username"), "claimed"
    await session.commit()
    warning = "Agar bu havolani sizga boshqa odam yuborgan bo'lsa, «Yo'q» ni bosing."
    if req.purpose == "link":
        target = await session.get(User, req.link_user_id)
        text = (f"TalantGo profilini ({target.email if target else 'sayt akkaunti'}) shu Telegram akkauntga ulash so'rovi. "
                f"Ulangach bot va sayt bitta akkaunt bilan ishlaydi.\n\n{warning}")
    else:
        exists = await session.scalar(select(User.id).where(User.telegram_id == int(sender["id"])))
        text = "Kompyuterdagi TalantGo saytiga shu Telegram akkaunt bilan kirish so'rovi."
        if not exists:
            text += ("\n\nBu Telegram'ga bog'langan profil yo'q: tasdiqlasangiz, yangi akkaunt ochiladi. Agar saytda "
                     "email bilan ro'yxatdan o'tgan bo'lsangiz, «Yo'q» ni bosing, email bilan kiring va «Profil» "
                     "bo'limida Telegram'ni ulang.")
        text += f"\n\n{warning}"
    await _reply(token, chat_id, text, keyboard=True)


async def on_answer(session: AsyncSession, token: str, chat_id: int, sender: dict, yes: bool) -> None:
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
    req.status, req.pin, req.attempts = "confirmed", f"{secrets.randbelow(10 ** 6):06d}", 0
    req.note = " ".join(filter(None, [sender.get("first_name"), sender.get("last_name")]))[:128]
    await session.commit()
    await _reply(token, chat_id, f"Saytga shu kodni kiriting: {req.pin}\n\n"
                                 "Kodni hech kimga bermang: TalantGo xodimlari ham uni hech qachon so'ramaydi.")


async def poll(session: AsyncSession, code: str) -> tuple[str, str]:
    """The request's state as the website sees it: pending, claimed, awaiting_pin, rejected, conflict, used, expired."""
    req = await session.get(LoginRequest, code)
    if req is None or (req.status in ("pending", "claimed", "confirmed") and _expired(req)):
        return "expired", ""
    if req.status == "confirmed":
        return "awaiting_pin", ""
    return req.status, req.note if req.status == "conflict" else ""


async def _bare(session: AsyncSession, user: User) -> bool:
    """An account someone opened in the bot but never used: safe to retire when linking."""
    if user.track_id or user.consent_at or user.company_id or user.staff_university_id or user.email:
        return False
    return not await session.scalar(select(func.count()).select_from(Submission).where(Submission.user_id == user.id))


async def _check_pin(session: AsyncSession, req: LoginRequest | None, pin: str, purpose: str) -> LoginRequest:
    from fastapi import HTTPException
    if req is None or req.purpose != purpose or req.status != "confirmed" or _expired(req):
        raise HTTPException(410, "So'rov eskirgan. Tugmani qaytadan bosing.")
    if not secrets.compare_digest(pin.strip(), req.pin):
        req.attempts += 1
        if req.attempts >= MAX_PIN_TRIES:
            req.status = "rejected"
        await session.commit()
        raise HTTPException(400, "Kod noto'g'ri" + ("" if req.status == "confirmed" else ". Urinishlar tugadi, qaytadan boshlang."))
    return req


async def verify_login(session: AsyncSession, code: str, pin: str, upsert) -> int:
    """The PIN from the bot, typed on the website that asked: returns the account to sign in."""
    req = await _check_pin(session, await session.get(LoginRequest, code), pin, "login")
    user = await upsert(session, req.telegram_id, req.note or "Talaba", req.tg_username, None)
    req.user_id, req.status = user.id, "used"
    await session.commit()
    return user.id


async def verify_link(session: AsyncSession, code: str, pin: str, user: User) -> None:
    """Ties the Telegram account that confirmed in the bot to `user` (the signed-in website account)."""
    from fastapi import HTTPException
    req = await session.get(LoginRequest, code)
    if req is not None and req.link_user_id != user.id:
        req = None
    req = await _check_pin(session, req, pin, "link")
    tg_id = req.telegram_id
    if user.telegram_id not in (None, tg_id):
        req.status = "conflict"
        await session.commit()
        raise HTTPException(409, "Bu profilga boshqa Telegram akkaunt ulangan")
    other = (await session.execute(select(User).where(User.telegram_id == tg_id))).scalar_one_or_none()
    if other is not None and other.id != user.id:
        if not await _bare(session, other):
            req.status, req.note = "conflict", "Bu Telegram akkaunt boshqa TalantGo profiliga ulangan va unda ma'lumotlar bor."
            await session.commit()
            raise HTTPException(409, req.note + " O'sha profilga Telegram orqali kirib, «Profil» bo'limida email va parol qo'shing.")
        other.telegram_id, other.is_blocked = None, True          # the empty bot-only account steps aside
        await session.flush()
    user.telegram_id, user.username = tg_id, req.tg_username
    req.user_id, req.status = user.id, "used"
    await session.commit()
