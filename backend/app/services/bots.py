"""Which Telegram bots the app runs.

Normally one. When the owner saves a new bot token in the admin site, the old token is kept as the
"previous" bot so nobody is lost while people move over:
- people who open the app from the old bot still sign in (to the same account: it is tied to their
  Telegram ID, not to a bot) and are shown where the new bot is;
- the old bot answers every message with a link to the new one, keeping invite codes;
- notifications try the new bot first and fall back to the old one for people who have not pressed
  Start in the new bot yet (a bot cannot write to someone who never started it).
"""
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AppConfig
from . import settings_store, telegram_bot

INFO_KEY = "bot_info"          # public facts about the bots: {"username": ..., "previous_username": ...}


async def current_and_previous(session: AsyncSession) -> tuple[str | None, str | None]:
    return (await settings_store.get_value(session, settings_store.BOT_TOKEN),
            await settings_store.get_value(session, settings_store.PREVIOUS_BOT_TOKEN))


async def tokens(session: AsyncSession) -> list[str]:
    """Bots to try when writing to someone, the current one first."""
    return [t for t in await current_and_previous(session) if t]


async def get_info(session: AsyncSession) -> dict:
    row = await session.get(AppConfig, INFO_KEY)
    return dict(row.value) if row else {}


async def set_info(session: AsyncSession, **values) -> dict:
    row = await session.get(AppConfig, INFO_KEY)
    info = {**(row.value if row else {}), **values}
    if row:
        row.value = info
    else:
        session.add(AppConfig(key=INFO_KEY, value=info))
    await session.commit()
    return info


async def username(session: AsyncSession) -> str | None:
    """The current bot's @username, asked from Telegram once and remembered."""
    info = await get_info(session)
    if info.get("username"):
        return info["username"]
    token = await settings_store.get_value(session, settings_store.BOT_TOKEN)
    if not token:
        return None
    try:
        name = (await telegram_bot.call(token, "getMe")).get("username")
    except telegram_bot.BotError:
        return None
    await set_info(session, username=name)
    return name


async def moved_note(session: AsyncSession) -> str:
    """Added to messages that had to go through the old bot, so people find the new one."""
    _, previous = await current_and_previous(session)
    name = await username(session) if previous else None
    return f"\n\nBotimiz yangilandi: @{name}. Xabarlarni u yerdan olish uchun o'sha botda «Start» ni bosing." if name else ""
