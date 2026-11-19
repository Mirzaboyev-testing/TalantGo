"""Admin announcements: a copy in everyone's bell, and the bot at a pace Telegram accepts for those who have it.

Audiences: students (optionally one track, group or university), approved company staff, approved university staff,
or everyone. Company and university staff get a button that opens the website; students open the Mini App.
"""
import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import and_, or_, select

from ..core.db import SessionLocal
from ..models import Announcement, Company, Notification, User
from . import bots, notify, telegram_bot

log = logging.getLogger("careerflow.announce")
_running: set[asyncio.Task] = set()      # keeps background tasks from being garbage-collected
PAUSE = 0.05                             # ~20 messages per second, under Telegram's 30/s limit
KINDS = {"students": "Talabalar", "companies": "Korxonalar", "universities": "Universitetlar", "all": "Hamma"}
LINK = {"student": "/talaba", "employer": "/korxona", "university": "/universitet"}


def audience_query(kind: str = "students", track_id: int | None = None, group_name: str | None = None,
                   university_id: int | None = None):
    """(user id, telegram id, account type) of everyone the announcement is for."""
    students = [User.account_type == "student"]
    if track_id:
        students.append(User.track_id == track_id)
    if group_name:
        students.append(User.group_name == group_name)
    if university_id:
        students.append(User.university_id == university_id)
    companies = and_(User.account_type == "employer", User.company.has(Company.status == "approved"))
    universities = and_(User.account_type == "university", User.staff_status == "approved")
    who = {"students": and_(*students), "companies": companies, "universities": universities,
           "all": or_(User.account_type == "student", companies, universities)}[kind]
    return select(User.id, User.telegram_id, User.account_type).where(User.is_blocked.is_(False), who)


def store(session, row: Announcement, people: list) -> None:
    """The bell copies: website-only people (no Telegram) see the announcement too."""
    session.add_all(Notification(user_id=uid, kind="admin_announcement", text=row.text, link=LINK.get(kind, ""))
                    for uid, _, kind in people)


async def bot_recipients(session, people: list) -> list[tuple[int, str, str]]:
    """(telegram id, account type, language) of the people the bot may write to: Telegram linked, not flagged as
    unreachable, and not muted "news" in their bot settings."""
    ids = [tg for _, tg, _ in people if tg]
    readers = await notify.readers(session, ids)
    return [(tg, r.account_type, r.language) for tg in ids
            if (r := readers.get(tg)) and not r.blocked and notify.allows(r.prefs, "admin_announcement")]


def start(announcement_id: int, recipients: list[tuple[int, str, str]]) -> None:
    """`recipients`: from bot_recipients()."""
    task = asyncio.create_task(_send(announcement_id, recipients))
    _running.add(task)
    task.add_done_callback(_running.discard)


async def _send(announcement_id: int, recipients: list[tuple[int, str, str]]) -> None:
    async with SessionLocal() as session:
        row = await session.get(Announcement, announcement_id)
        tokens = await bots.tokens(session)
        note = await bots.moved_note(session)
        if row is None or not tokens:
            if row is not None:
                row.finished_at = datetime.now(UTC)
                await session.commit()
            return
        lost = []
        for chat_id, kind, lang in recipients:
            try:
                # plain text, no parse_mode: nothing typed by an admin is interpreted as markup
                await telegram_bot.send_any(tokens, "sendMessage", note, chat_id=chat_id, text=row.text,
                                            reply_markup=notify.markup_for(kind, "", LINK.get(kind, ""), lang))
                row.sent += 1
            except telegram_bot.BotError as exc:   # blocked the bot, never started it, ...
                row.failed += 1
                log.info("announcement %s to one user failed: %s", announcement_id, exc)
                if notify.unreachable(exc):
                    lost.append(chat_id)
            if (row.sent + row.failed) % 20 == 0:          # progress visible in the admin page
                await session.commit()
            await asyncio.sleep(PAUSE)
        row.finished_at = datetime.now(UTC)
        await session.commit()
        await notify.mark_unreachable(session, lost)
