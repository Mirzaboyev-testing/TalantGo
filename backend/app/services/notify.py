"""Best-effort bot notifications (new application, contact request, verification result...).

Sent in the background so a slow or failing Telegram call never delays or breaks the request.
Messages are plain text: nothing typed by a user is interpreted as markup.

Per reader (phase 3, 2026-11-19):
- the text is in their language (services/notif_i18n.py) when `kind` + `params` are given;
- their bot settings decide (users.notify_prefs): Telegram copies off, or a muted category;
- people the bot could not reach (blocked it, deleted the chat) are flagged in users.tg_blocked_at and skipped until
  they write to the bot again (api/pages.py clears the flag).
"""
import asyncio
import logging
from datetime import UTC, datetime
from typing import NamedTuple

from sqlalchemy import select, update

from ..core.config import settings
from ..core.db import SessionLocal
from ..models import User
from . import bots, notif_i18n, telegram_bot

log = logging.getLogger("careerflow.notify")
_running: set[asyncio.Task] = set()
BROWSER_PANELS = ("employer", "university")
CHUNK = 5000                                   # the driver limits the size of one IN (...) list

# what a person may switch off for the bot (the bell keeps everything); kinds not listed always go
CATEGORIES = ("chat", "opportunities", "news", "reminders")
CATEGORY = {
    "chat_message": "chat", "group_message": "chat",
    "company_task_new": "opportunities", "challenge_new": "opportunities", "test_new": "opportunities",
    "task_new": "opportunities", "job_recommended": "opportunities", "company_event": "opportunities",
    "university_event": "opportunities", "university_announcement": "opportunities",
    "admin_announcement": "news", "weekly_digest": "news",
    "interview_reminder": "reminders", "test_deadline": "reminders", "task_deadline": "reminders",
}
# Telegram's answers that mean the person cannot get messages from this bot
_UNREACHABLE = ("forbidden", "chat not found", "user is deactivated", "bot was blocked", "have no rights")


class Reader(NamedTuple):
    account_type: str
    language: str
    prefs: dict
    blocked: bool


def allows(prefs: dict | None, kind: str) -> bool:
    """Whether a person's bot settings let this kind of notice through."""
    prefs = prefs or {}
    if prefs.get("telegram") is False:
        return False
    return CATEGORY.get(kind) not in set(prefs.get("muted") or [])


def unreachable(exc: Exception) -> bool:
    return any(s in str(exc).lower() for s in _UNREACHABLE)


async def readers(session, telegram_ids: list[int]) -> dict[int, Reader]:
    out: dict[int, Reader] = {}
    for start in range(0, len(telegram_ids), CHUNK):
        for tg, kind, lang, prefs, blocked in (await session.execute(select(
                User.telegram_id, User.account_type, User.language, User.notify_prefs, User.tg_blocked_at).where(
                User.telegram_id.in_(telegram_ids[start:start + CHUNK])))).all():
            out[tg] = Reader(kind, lang if lang in notif_i18n.LANGS else "uz", prefs or {}, blocked is not None)
    return out


async def mark_unreachable(session, chat_ids: list[int]) -> None:
    if chat_ids:
        await session.execute(update(User).where(User.telegram_id.in_(chat_ids), User.tg_blocked_at.is_(None))
                              .values(tg_blocked_at=datetime.now(UTC)))
        await session.commit()


def send(telegram_ids: list[int], text: str, button: str = "", path: str = "", kind: str = "",
         params: dict | None = None, browser: bool = False) -> None:
    """`path` (an in-app page such as /talaba/arizalar) is where the button leads. `browser`: always the website
    (admin notices). `kind` + `params` give the text in each reader's language and their category."""
    ids = [i for i in dict.fromkeys(telegram_ids) if i]
    if not ids or settings.app_env == "test":
        return
    task = asyncio.create_task(_send(ids, text, button, path if path.startswith("/") else "", kind, params, browser))
    _running.add(task)
    task.add_done_callback(_running.discard)


def markup_for(account_type: str, button: str, path: str, lang: str = "uz", browser: bool = False) -> dict:
    """Students open the Mini App; companies, universities and admins work on a computer, so their button opens the
    website in the browser (their panels are not made for the Mini App). The full text is in the message itself."""
    url = settings.public_url + path
    if browser or account_type in BROWSER_PANELS:
        return {"inline_keyboard": [[{"text": notif_i18n.SITE.get(lang, notif_i18n.SITE["uz"]), "url": url}]]}
    return {"inline_keyboard": [[{"text": button or notif_i18n.BUTTON.get(lang, notif_i18n.BUTTON["uz"]),
                                  "web_app": {"url": url}}]]}


async def plan(session, telegram_ids: list[int], text: str, button: str = "", path: str = "", kind: str = "",
               params: dict | None = None, browser: bool = False) -> list[tuple[int, str, dict]]:
    """(chat id, text, buttons) for everyone this notice should reach by bot, in their language."""
    people = await readers(session, telegram_ids)
    out = []
    for chat_id in telegram_ids:
        r = people.get(chat_id)                # None: not a user (an admin account's Telegram)
        if r is not None and (r.blocked or not allows(r.prefs, kind)):
            continue
        lang = r.language if r else "uz"
        body = notif_i18n.render(kind, params, lang, text)
        if browser or (r and r.account_type in BROWSER_PANELS):
            body += "\n\n" + notif_i18n.FOOTER[lang]
        out.append((chat_id, body, markup_for(r.account_type if r else "", button, path, lang, browser)))
    return out


async def _send(telegram_ids: list[int], text: str, button: str, path: str = "", kind: str = "",
                params: dict | None = None, browser: bool = False) -> None:
    async with SessionLocal() as session:
        tokens = await bots.tokens(session)
        note = await bots.moved_note(session)
        messages = await plan(session, telegram_ids, text, button, path, kind, params, browser)
        if not tokens:
            return
        lost = []
        for chat_id, body, markup in messages:
            try:
                await telegram_bot.send_any(tokens, "sendMessage", note, chat_id=chat_id, text=body, reply_markup=markup)
            except telegram_bot.BotError as exc:
                log.info("notification not delivered: %s", exc)
                if unreachable(exc):
                    lost.append(chat_id)
            await asyncio.sleep(0.05)
        await mark_unreachable(session, lost)
