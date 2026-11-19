"""Best-effort bot notifications (new application, contact request, verification result...).

Sent in the background so a slow or failing Telegram call never delays or breaks the request.
Messages are plain text: nothing typed by a user is interpreted as markup.
"""
import asyncio
import logging

from sqlalchemy import select

from ..core.config import settings
from ..core.db import SessionLocal
from ..models import User
from . import bots, telegram_bot

log = logging.getLogger("careerflow.notify")
_running: set[asyncio.Task] = set()
BROWSER_PANELS = ("employer", "university")


def send(telegram_ids: list[int], text: str, button: str = "Ilovani ochish", path: str = "") -> None:
    """`path` (an in-app page such as /talaba/arizalar) is where the button opens the Mini App."""
    ids = [i for i in dict.fromkeys(telegram_ids) if i]
    if not ids or settings.app_env == "test":
        return
    task = asyncio.create_task(_send(ids, text, button, path if path.startswith("/") else ""))
    _running.add(task)
    task.add_done_callback(_running.discard)


def markup_for(account_type: str, button: str, path: str) -> dict:
    """Students open the Mini App; companies and universities work on a computer, so their button opens the
    website in the browser (their panels are not made for the Mini App). The full text is in the message itself."""
    url = settings.public_url + path
    if account_type in BROWSER_PANELS:
        return {"inline_keyboard": [[{"text": "🌐 Saytda ochish", "url": url}]]}
    return {"inline_keyboard": [[{"text": button, "web_app": {"url": url}}]]}


async def _send(telegram_ids: list[int], text: str, button: str, path: str = "") -> None:
    async with SessionLocal() as session:
        tokens = await bots.tokens(session)
        note = await bots.moved_note(session)
        kinds: dict[int, str] = {}
        for start in range(0, len(telegram_ids), 5000):     # the driver limits the size of one IN (...) list
            kinds.update((await session.execute(select(User.telegram_id, User.account_type).where(
                User.telegram_id.in_(telegram_ids[start:start + 5000])))).all())
    if not tokens:
        return
    footer = "\n\nBarcha bildirishnomalar: /bildirishnomalar"
    for chat_id in telegram_ids:
        kind = kinds.get(chat_id, "student")
        try:
            await telegram_bot.send_any(tokens, "sendMessage", note, chat_id=chat_id,
                                        text=text + (footer if kind in BROWSER_PANELS else ""),
                                        reply_markup=markup_for(kind, button, path))
        except telegram_bot.BotError as exc:
            log.info("notification not delivered: %s", exc)
        await asyncio.sleep(0.05)
