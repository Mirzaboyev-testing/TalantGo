"""Bot announcements to students, sent in the background at a pace Telegram accepts."""
import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select

from ..core.config import settings
from ..core.db import SessionLocal
from ..models import Announcement, User
from . import bots, telegram_bot

log = logging.getLogger("careerflow.announce")
_running: set[asyncio.Task] = set()      # keeps background tasks from being garbage-collected
PAUSE = 0.05                             # ~20 messages per second, under Telegram's 30/s limit


def audience_query(track_id: int | None, group_name: str | None):
    query = select(User.telegram_id).where(User.is_blocked.is_(False), User.telegram_id.isnot(None))
    if track_id:
        query = query.where(User.track_id == track_id)
    if group_name:
        query = query.where(User.group_name == group_name)
    return query


def start(announcement_id: int, chat_ids: list[int]) -> None:
    task = asyncio.create_task(_send(announcement_id, chat_ids))
    _running.add(task)
    task.add_done_callback(_running.discard)


async def _send(announcement_id: int, chat_ids: list[int]) -> None:
    async with SessionLocal() as session:
        row = await session.get(Announcement, announcement_id)
        tokens = await bots.tokens(session)
        note = await bots.moved_note(session)
        if row is None or not tokens:
            return
        markup = {"inline_keyboard": [[{"text": "Ilovani ochish", "web_app": {"url": settings.public_url}}]]}
        for chat_id in chat_ids:
            try:
                # plain text, no parse_mode: nothing typed by an admin is interpreted as markup
                await telegram_bot.send_any(tokens, "sendMessage", note, chat_id=chat_id, text=row.text,
                                            reply_markup=markup)
                row.sent += 1
            except telegram_bot.BotError as exc:   # blocked the bot, never started it, ...
                row.failed += 1
                log.info("announcement %s to one user failed: %s", announcement_id, exc)
            if (row.sent + row.failed) % 20 == 0:          # progress visible in the admin page
                await session.commit()
            await asyncio.sleep(PAUSE)
        row.finished_at = datetime.now(UTC)
        await session.commit()
