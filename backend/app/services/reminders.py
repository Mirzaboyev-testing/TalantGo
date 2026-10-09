"""Monday-morning reminder: each student gets their next task and how much work waits for review.

Runs inside the API process (one worker). The week is claimed in app_config before sending, so a
restart on Monday never sends twice.
"""
import asyncio
import logging
from datetime import datetime

from sqlalchemy import func, select

from ..core.config import settings
from ..core.db import SessionLocal
from ..models import AppConfig, Status, Submission, Task, User
from . import bots, telegram_bot
from .progress import TASHKENT

log = logging.getLogger("careerflow.reminders")
KEY = "weekly_reminder"
SEND_HOUR = 10                     # Monday 10:00 Tashkent


async def _claim_week(session, week: str) -> bool:
    row = await session.get(AppConfig, KEY)
    if row and row.value.get("week") == week:
        return False
    if row:
        row.value = {"week": week}
    else:
        session.add(AppConfig(key=KEY, value={"week": week}))
    await session.commit()
    return True


async def build_messages(session) -> list[tuple[int, str]]:
    students = (await session.execute(select(User).where(
        User.account_type == "student", User.track_id.isnot(None), User.is_blocked.is_(False)))).scalars().all()
    out = []
    for u in students:
        done = set((await session.execute(select(Submission.task_id).where(
            Submission.user_id == u.id, Submission.status != Status.rejected))).scalars())
        query = select(Task).where(Task.track_id == u.track_id, Task.is_active)
        if done:
            query = query.where(Task.id.notin_(done))
        next_task = (await session.execute(query.order_by(Task.sort_order).limit(1))).scalar_one_or_none()
        waiting = await session.scalar(select(func.count()).select_from(Submission).join(Task).where(
            Task.track_id == u.track_id, Submission.status == Status.pending, Submission.user_id != u.id))
        lines = ["🗓 Yangi hafta boshlandi!"]
        lines.append(f"Navbatdagi topshiriq: «{next_task.title}» ({next_task.points} ball)." if next_task
                     else "Yo'lingizdagi barcha topshiriqlarni topshirgansiz. Zo'r! 🎉")
        if waiting:
            lines.append(f"Tengdoshlaringizning {waiting} ta ishi bahoingizni kutmoqda.")
        out.append((u.telegram_id, "\n".join(lines)))
    return out


async def run_once(now: datetime) -> int:
    """Sends this week's reminders if it is Monday after SEND_HOUR and they were not sent yet."""
    if now.weekday() != 0 or now.hour < SEND_HOUR:
        return 0
    year, week, _ = now.isocalendar()
    async with SessionLocal() as session:
        tokens = await bots.tokens(session)
        note = await bots.moved_note(session)
        if not tokens or not await _claim_week(session, f"{year}-W{week:02d}"):
            return 0
        messages = await build_messages(session)
    markup = {"inline_keyboard": [[{"text": "Ilovani ochish", "web_app": {"url": settings.public_url}}]]}
    sent = 0
    for chat_id, text in messages:
        try:
            await telegram_bot.send_any(tokens, "sendMessage", note, chat_id=chat_id, text=text, reply_markup=markup)
            sent += 1
        except telegram_bot.BotError as exc:
            log.info("reminder not delivered: %s", exc)
        await asyncio.sleep(0.05)
    log.info("weekly reminder sent to %s of %s students", sent, len(messages))
    return sent


async def loop() -> None:
    while True:
        try:
            await run_once(datetime.now(TASHKENT))
        except Exception:                        # a reminder must never take the API down
            log.exception("weekly reminder failed")
        await asyncio.sleep(1800)
