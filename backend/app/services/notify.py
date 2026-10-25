"""Best-effort bot notifications (new application, contact request, verification result...).

Sent in the background so a slow or failing Telegram call never delays or breaks the request.
Messages are plain text: nothing typed by a user is interpreted as markup.
"""
import asyncio
import logging

from ..core.config import settings
from ..core.db import SessionLocal
from . import bots, telegram_bot

log = logging.getLogger("careerflow.notify")
_running: set[asyncio.Task] = set()


def send(telegram_ids: list[int], text: str, button: str = "Ilovani ochish", path: str = "") -> None:
    """`path` (an in-app page such as /talaba/arizalar) is where the button opens the Mini App."""
    ids = [i for i in dict.fromkeys(telegram_ids) if i]
    if not ids or settings.app_env == "test":
        return
    task = asyncio.create_task(_send(ids, text, button, path if path.startswith("/") else ""))
    _running.add(task)
    task.add_done_callback(_running.discard)


async def _send(telegram_ids: list[int], text: str, button: str, path: str = "") -> None:
    async with SessionLocal() as session:
        tokens = await bots.tokens(session)
        note = await bots.moved_note(session)
    if not tokens:
        return
    markup = {"inline_keyboard": [[{"text": button, "web_app": {"url": settings.public_url + path}}]]}
    for chat_id in telegram_ids:
        try:
            await telegram_bot.send_any(tokens, "sendMessage", note, chat_id=chat_id, text=text, reply_markup=markup)
        except telegram_bot.BotError as exc:
            log.info("notification not delivered: %s", exc)
        await asyncio.sleep(0.05)
