"""People who open the app but leave sign-up unfinished get one bot reminder an hour later."""
from datetime import UTC, datetime, timedelta

from sqlalchemy import update

from app.core.db import SessionLocal
from app.models import AppConfig, User
from app.services import reminders, settings_store, telegram_bot


async def test_one_reminder_for_an_unfinished_sign_up(make_user, monkeypatch):
    sent = []

    async def fake_call(token, method, **params):
        sent.append(params["chat_id"])
        return {"ok": True}
    monkeypatch.setattr(telegram_bot, "call", fake_call)
    now = datetime.now(UTC)
    async with SessionLocal() as s:
        await settings_store.set_value(s, settings_store.BOT_TOKEN, "123456:" + "t" * 35)

    assert await reminders.nudge_unfinished(now) == 0          # the first run only records where to start
    left = await make_user("Chiqib ketgan", telegram_id=7001)
    done = await make_user("Tugatgan", telegram_id=7002)
    fresh = await make_user("Hozirgina", telegram_id=7003)
    async with SessionLocal() as s:
        await s.execute(update(User).where(User.id.in_([left["id"], done["id"]])).values(created_at=now - timedelta(hours=2)))
        await s.execute(update(User).where(User.id == done["id"]).values(
            track_id=1, university_id=1, course=2, faculty="Iqtisodiyot", group_name="114-25", phone="+998901112233",
            consent_at=now))
        row = await s.get(AppConfig, reminders.NUDGE_KEY)
        row.value = {"since": (now - timedelta(days=1)).isoformat()}
        await s.commit()

    assert await reminders.nudge_unfinished(now) == 1
    assert sent == [7001]                                       # not the finished one, not the one who just arrived
    assert await reminders.nudge_unfinished(now + timedelta(hours=2)) == 1   # the newcomer, an hour later
    assert sent == [7001, 7003]
    assert await reminders.nudge_unfinished(now + timedelta(hours=5)) == 0   # nobody twice
