"""Password recovery without e-mail or SMS: the bot sends a one-time code and link to the person's own chat.

- From the website: "Parolni unutdim" + e-mail; when that account has Telegram, the bot gets a 6-digit code (typed on
  the site) and a link (opens the site's reset page). The website always gets the same answer, so it never reveals
  whether an e-mail is registered.
- From the bot: /parol sends the same message. An account without an e-mail adds one there, so a company or a
  university can start signing in on a computer from the bot alone, without the Mini App.
- Without Telegram: a request to the owner (PasswordRequest), who checks who it is by phone.

A new password ends every older session (users.token_version) and the person is told in the bell and the bot.
"""
import asyncio
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..models import PasswordReset, User
from . import bots, inbox, telegram_bot
from .admin_accounts import hash_password

TTL = timedelta(minutes=15)
MAX_TRIES = 5
PAGE = "/parol-tiklash"


def _hash(value: str) -> str:
    return hashlib.sha256(f"careerup-reset:{value}".encode()).hexdigest()


def link(token: str) -> str:
    return f"{settings.public_url}{PAGE}?t={token}"


async def create(session: AsyncSession, user: User) -> tuple[str, str]:
    """A fresh code and link for this person; older ones stop working."""
    await session.execute(delete(PasswordReset).where(
        (PasswordReset.user_id == user.id) | (PasswordReset.created_at < datetime.now(UTC) - timedelta(days=1))))
    code, token = f"{secrets.randbelow(10 ** 6):06d}", secrets.token_urlsafe(24)
    session.add(PasswordReset(user_id=user.id, code_hash=_hash(code), token_hash=_hash(token)))
    await session.commit()
    return code, token


def bot_text(user: User, code: str) -> str:
    action = "yangi parol qo'yish" if user.password_hash else "saytga kirish uchun email va parol qo'yish"
    return (f"🔑 Parolni tiklash\n\nKod: {code}\nKod {int(TTL.total_seconds() // 60)} daqiqa amal qiladi.\n\n"
            "Saytdagi «Parolni unutdim» oynasiga shu kodni kiriting yoki pastdagi tugma orqali "
            f"{action}.\n\nKodni hech kimga bermang. Siz so'ramagan bo'lsangiz, hech narsa qilmang: parolingiz o'zgarmaydi.")


async def send_by_bot(session: AsyncSession, user: User) -> bool:
    """Creates a code and sends it to the person's Telegram. False when the bot could not reach them."""
    tokens = await bots.tokens(session)
    if not tokens or not user.telegram_id:
        return False
    code, token = await create(session, user)
    markup = {"inline_keyboard": [[{"text": "🔑 Yangi parol qo'yish", "url": link(token)}]]}
    try:
        await telegram_bot.send_any(tokens, "sendMessage", chat_id=user.telegram_id, text=bot_text(user, code),
                                    reply_markup=markup)
    except telegram_bot.BotError:
        return False
    return True


def _expired(reset: PasswordReset) -> bool:
    return reset.used_at is not None or datetime.now(UTC) - reset.created_at > TTL or reset.attempts >= MAX_TRIES


async def by_token(session: AsyncSession, token: str) -> PasswordReset | None:
    reset = (await session.execute(select(PasswordReset).where(PasswordReset.token_hash == _hash(token)))).scalar_one_or_none()
    return None if reset is None or _expired(reset) else reset


async def by_code(session: AsyncSession, email: str, code: str) -> PasswordReset | None:
    """The newest open reset of the account with this e-mail, if the code matches. A wrong code counts a try."""
    user_id = await session.scalar(select(User.id).where(User.email == email))
    reset = (await session.execute(select(PasswordReset).where(PasswordReset.user_id == user_id)
                                   .order_by(PasswordReset.id.desc()).limit(1))).scalar_one_or_none() if user_id else None
    if reset is None or _expired(reset):
        return None
    if not hmac.compare_digest(reset.code_hash, _hash(code)):
        reset.attempts += 1
        await session.commit()
        return None
    return reset


async def set_password(session: AsyncSession, user: User, password: str, *, email: str | None = None,
                       note: str = "Parolingiz o'zgartirildi.") -> None:
    """Sets the password, ends every other session and tells the person (bell + bot)."""
    if email and email != user.email:
        if await session.scalar(select(User.id).where(User.email == email, User.id != user.id)):
            raise HTTPException(409, "Bu email boshqa akkauntga bog'langan")
        user.email = email
    user.password_hash = await asyncio.to_thread(hash_password, password)
    user.token_version = (user.token_version or 0) + 1
    user.must_change_password = False
    await session.commit()
    await inbox.push(session, [user.id], "password_changed",
                     f"{note} Boshqa qurilmalardagi kirishlar yopildi. Bu siz bo'lmasangiz, darhol Careerup adminiga yozing.")


async def complete(session: AsyncSession, reset: PasswordReset, password: str, email: str | None = None) -> User:
    user = await session.get(User, reset.user_id)
    if user is None or user.is_blocked:
        raise HTTPException(400, "Havola yoki kod eskirgan. Qaytadan so'rang.")
    if not user.email and not email:
        raise HTTPException(422, "Saytga kirish uchun emailingizni yozing")
    reset.used_at = datetime.now(UTC)
    await set_password(session, user, password, email=email)
    await session.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    await session.commit()
    return user
