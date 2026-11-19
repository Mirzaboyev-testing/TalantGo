"""Reminders that run inside the API process (one worker), every 15 minutes:

- Monday 10:00: a weekly digest for every signed-up student (in the bell, and the bot when linked): their next track
  task and works waiting for review if they follow a track, new vacancies for their job functions, open company
  tasks for them. Nothing new, no message. The week is claimed in app_config first, so a restart never sends twice.
- an interview reminder about a day before (again if the company moves the time);
- deadline reminders a day before: a company test the student started but did not finish, a company task they were
  personally invited to and have not sent.
- one bot nudge for a sign-up left unfinished.
"""
import asyncio
import logging
from datetime import UTC, datetime, timedelta

from typing import NamedTuple

from sqlalchemy import func, or_, select

from ..core.config import settings
from ..core.db import SessionLocal
from ..models import (AppConfig, Application, Challenge, ChallengeEntry, CompanyTest, Job, Notification, Status,
                      Submission, Task, TestAttempt, User)
from . import bots, inbox, telegram_bot
from .career import signup_missing
from .progress import TASHKENT

log = logging.getLogger("careerflow.reminders")
KEY = "weekly_reminder"
NUDGE_KEY = "signup_nudge"         # {"since": ...}: only people who start signing up after this are reminded
NUDGE_AFTER = timedelta(hours=1)   # give people an hour before reminding them
NUDGE_WINDOW = timedelta(days=3)   # and stop trying after a few days
NUDGE_TEXT = ("Ro'yxatdan o'tishingiz yakunlanmadi.\n\n"
              "Ilovani ochib ro'yxatdan o'tishni yakunlang va kasb yo'nalishlaringizni tanlang: bu 1 daqiqa. "
              "Shundan keyin sizga mos vakansiyalar, kompaniya vazifalari va reyting ochiladi.")
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


class Digest(NamedTuple):
    user_id: int
    telegram_id: int | None
    text: str


async def build_messages(session, now: datetime | None = None) -> list[Digest]:
    """This week's digest for every signed-up student who has something new (the track is optional)."""
    from ..api.challenges import _for_user              # what a student sees (company tasks for them)
    now = now or datetime.now(UTC)
    students = (await session.execute(select(User).where(
        User.account_type == "student", User.is_blocked.is_(False)))).scalars().all()
    out = []
    for u in students:
        if signup_missing(u):                     # still signing up: the nudge speaks to them, not the digest
            continue
        lines = ["🗓 Yangi hafta boshlandi!"]
        if u.track_id:
            done = set((await session.execute(select(Submission.task_id).where(
                Submission.user_id == u.id, Submission.status != Status.rejected))).scalars())
            query = select(Task).where(Task.track_id == u.track_id, Task.is_active)
            if done:
                query = query.where(Task.id.notin_(done))
            next_task = (await session.execute(query.order_by(Task.sort_order).limit(1))).scalar_one_or_none()
            waiting = await session.scalar(select(func.count()).select_from(Submission).join(Task).where(
                Task.track_id == u.track_id, Submission.status == Status.pending, Submission.user_id != u.id))
            lines.append(f"Navbatdagi topshiriq: «{next_task.title}» ({next_task.points} ball)." if next_task
                         else "Yo'lingizdagi barcha topshiriqlarni topshirgansiz. Zo'r! 🎉")
            if waiting:
                lines.append(f"Tengdoshlaringizning {waiting} ta ishi bahoingizni kutmoqda.")
        jobs = await session.scalar(select(func.count()).select_from(Job).where(
            Job.status == "approved", Job.created_at >= now - timedelta(days=7),
            Job.job_fields.overlap(u.job_fields or []))) if u.job_fields else 0
        if jobs:
            lines.append(f"Kasb yo'nalishlaringiz bo'yicha {jobs} ta yangi vakansiya chiqdi.")
        visible = _for_user(u).where(Challenge.company_id.isnot(None), Challenge.ends_at > now,
                                     Challenge.starts_at <= now).subquery()
        open_tasks = await session.scalar(select(func.count()).select_from(visible).where(
            visible.c.id.notin_(select(ChallengeEntry.challenge_id).where(ChallengeEntry.user_id == u.id))))
        if open_tasks:
            lines.append(f"{open_tasks} ta korxona vazifasi sizni kutmoqda.")
        if len(lines) > 1:
            out.append(Digest(u.id, u.telegram_id, "\n".join(lines)))
    return out


async def run_once(now: datetime) -> int:
    """Sends this week's reminders if it is Monday after SEND_HOUR and they were not sent yet."""
    if now.weekday() != 0 or now.hour < SEND_HOUR:
        return 0
    year, week, _ = now.isocalendar()
    async with SessionLocal() as session:
        tokens = await bots.tokens(session)
        note = await bots.moved_note(session)
        if not await _claim_week(session, f"{year}-W{week:02d}"):
            return 0
        messages = await build_messages(session, now)
        # the bell first: people without Telegram get the digest too
        session.add_all(Notification(user_id=m.user_id, kind="weekly_digest", text=m.text, link="/talaba") for m in messages)
        await session.commit()
    if not tokens:
        return 0
    markup = {"inline_keyboard": [[{"text": "Ilovani ochish", "web_app": {"url": settings.public_url}}]]}
    sent = 0
    for _, chat_id, text in messages:
        if not chat_id:
            continue
        try:
            await telegram_bot.send_any(tokens, "sendMessage", note, chat_id=chat_id, text=text, reply_markup=markup)
            sent += 1
        except telegram_bot.BotError as exc:
            log.info("reminder not delivered: %s", exc)
        await asyncio.sleep(0.05)
    log.info("weekly reminder sent to %s of %s students", sent, len(messages))
    return sent


def unfinished_signup(people: list[User]) -> list[User]:
    """The people the app still keeps on the sign-up form: the same check (career.signup_missing), so a student
    who finished the sign-up of 2026-11-17 (job functions, no track) is not told it is unfinished."""
    return [u for u in people if signup_missing(u)]


async def nudge_unfinished(now: datetime) -> int:
    """One bot reminder for people who opened the app but left sign-up unfinished an hour ago."""
    async with SessionLocal() as session:
        tokens = await bots.tokens(session)
        if not tokens:
            return 0
        row = await session.get(AppConfig, NUDGE_KEY)
        if row is None:                          # first run: start from now, earlier visitors are not messaged
            session.add(AppConfig(key=NUDGE_KEY, value={"since": now.isoformat()}))
            await session.commit()
            return 0
        since = max(datetime.fromisoformat(row.value["since"]), now - NUDGE_WINDOW)
        people = unfinished_signup((await session.execute(select(User).where(
            User.account_type == "student", User.is_blocked.is_(False), User.onboarding_nudged_at.is_(None), User.telegram_id.isnot(None),
            User.created_at >= since, User.created_at <= now - NUDGE_AFTER))).scalars().all())
        for user in people:
            user.onboarding_nudged_at = now      # marked before sending: a crash never sends twice
        await session.commit()
        chat_ids = [u.telegram_id for u in people]
        note = await bots.moved_note(session)
    markup = {"inline_keyboard": [[{"text": "Ro'yxatdan o'tishni yakunlash", "web_app": {"url": settings.public_url}}]]}
    sent = 0
    for chat_id in chat_ids:
        try:
            await telegram_bot.send_any(tokens, "sendMessage", note, chat_id=chat_id, text=NUDGE_TEXT, reply_markup=markup)
            sent += 1
        except telegram_bot.BotError as exc:
            log.info("sign-up reminder not delivered: %s", exc)
        await asyncio.sleep(0.05)
    if chat_ids:
        log.info("sign-up reminders sent to %s of %s people", sent, len(chat_ids))
    return sent


def _day(when: datetime, now: datetime) -> str:
    """"bugun 14:30" / "ertaga 10:00" / "21.11 10:00", in Tashkent time."""
    local, today = when.astimezone(TASHKENT), now.astimezone(TASHKENT).date()
    day = "bugun" if local.date() == today else "ertaga" if local.date() == today + timedelta(days=1) else local.strftime("%d.%m")
    return f"{day} {local.strftime('%H:%M')}"


async def remind_interviews(now: datetime) -> int:
    """About a day before an interview the student is reminded; a new time from the company means a new reminder."""
    async with SessionLocal() as session:
        apps = (await session.execute(select(Application).where(
            Application.status == "interview", Application.interview_at > now,
            Application.interview_at <= now + timedelta(hours=24),
            or_(Application.interview_reminded_for.is_(None),
                Application.interview_reminded_for != Application.interview_at)))).scalars().all()
        for a in apps:
            a.interview_reminded_for = a.interview_at          # marked first: a crash never reminds twice
        await session.commit()
        for a in apps:
            company = a.job.company.name if a.job and a.job.company else ""
            place = f" Joy: {a.interview_place}." if a.interview_place else ""
            await inbox.push(session, [a.user_id], "interview_reminder",
                             f"Eslatma: {_day(a.interview_at, now)} «{a.job.title}» ({company}) bo'yicha suhbatingiz bor.{place}",
                             link="/talaba/arizalar", params={"job": a.job.title, "company": company,
                                                               "when": _day(a.interview_at, now)})
    return len(apps)


async def remind_deadlines(now: datetime) -> int:
    """A day before: a company test a student started but did not finish, a company task they were invited to by
    name and have not sent. Broad audiences get no deadline pings (that would be noise)."""
    sent = 0
    async with SessionLocal() as session:
        tomorrow = now.astimezone(TASHKENT).date() + timedelta(days=1)
        tests = (await session.execute(select(CompanyTest).where(
            CompanyTest.status == "approved", CompanyTest.deadline == tomorrow,
            CompanyTest.deadline_reminded_at.is_(None)))).scalars().all()
        tasks = (await session.execute(select(Challenge).where(
            Challenge.company_id.isnot(None), Challenge.is_archived.is_(False), Challenge.ends_at > now,
            Challenge.ends_at <= now + timedelta(hours=24), Challenge.deadline_reminded_at.is_(None)))).scalars().all()
        for item in (*tests, *tasks):
            item.deadline_reminded_at = now
        await session.commit()
        for t in tests:
            started = (await session.execute(select(TestAttempt.user_id).where(
                TestAttempt.test_id == t.id, TestAttempt.status == "in_progress"))).scalars().all()
            await inbox.push(session, started, "test_deadline",
                             f"«{t.title}» testi ({t.company.name}) muddati ertaga tugaydi. Boshlagan testingizni yakunlang.",
                             link="/talaba/topshiriqlar/testlar", params={"test": t.title, "company": t.company.name})
            sent += len(started)
        for c in tasks:
            if c.audience != "selected":
                continue
            entered = set((await session.execute(select(ChallengeEntry.user_id).where(
                ChallengeEntry.challenge_id == c.id))).scalars())
            waiting = [i for i in (c.invited_ids or []) if i not in entered]
            await inbox.push(session, waiting, "task_deadline",
                             f"«{c.title}» vazifasi ({c.company.name if c.company else ''}) muddati {_day(c.ends_at, now)} da tugaydi. "
                             "Ishingizni yuboring.", link="/talaba/topshiriqlar",
                             params={"task": c.title, "company": c.company.name if c.company else "",
                                     "when": _day(c.ends_at, now)})
            sent += len(waiting)
    return sent


async def loop() -> None:
    while True:
        try:
            await run_once(datetime.now(TASHKENT))
        except Exception:                        # a reminder must never take the API down
            log.exception("weekly reminder failed")
        for job, name in ((remind_interviews, "interview"), (remind_deadlines, "deadline")):
            try:
                await job(datetime.now(UTC))
            except Exception:
                log.exception("%s reminder failed", name)
        try:
            await nudge_unfinished(datetime.now(UTC))
        except Exception:
            log.exception("sign-up reminder failed")
        await asyncio.sleep(900)
