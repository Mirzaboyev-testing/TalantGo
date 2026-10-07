"""Pilot features: invite links, partner role links, starter task, weekly streak, Monday reminder."""
from datetime import date, datetime

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import Task, User
from app.services import progress, reminders, settings_store, telegram_bot
from app.services.progress import TASHKENT
from tests.conftest import owner_headers

BOT_TOKEN = "123456:TEST-token-for-unit-tests-only-abcdefghij"
HEADERS = {"X-Telegram-Bot-Api-Secret-Token": telegram_bot.webhook_secret(BOT_TOKEN)}


def start(sender_id: int, payload: str = "", name: str = "Nodira") -> dict:
    return {"message": {"from": {"id": sender_id, "first_name": name, "username": f"u{sender_id}"},
                        "chat": {"id": sender_id, "type": "private"}, "text": f"/start {payload}".strip()}}


async def with_bot(monkeypatch) -> list:
    sent = []

    async def fake_welcome(token, chat_id, public_url, role=None):
        sent.append((chat_id, role))
    monkeypatch.setattr(telegram_bot, "send_welcome", fake_welcome)
    async with SessionLocal() as s:
        await settings_store.set_value(s, settings_store.BOT_TOKEN, BOT_TOKEN)
    return sent


async def test_invite_link_attributes_new_people_only(client, make_user, monkeypatch):
    sent = await with_bot(monkeypatch)
    inviter = await make_user("Muhammadqodir", telegram_id=700001)
    me = (await client.get("/api/v1/me", headers=inviter["headers"])).json()
    assert me["invite_code"] == f"r{inviter['id']}" and me["invited_count"] == 0

    await client.post("/telegram/webhook", json=start(700002, me["invite_code"]), headers=HEADERS)
    await client.post("/telegram/webhook", json=start(700002, me["invite_code"]), headers=HEADERS)   # twice
    await client.post("/telegram/webhook", json=start(700001, me["invite_code"]), headers=HEADERS)   # self
    me = (await client.get("/api/v1/me", headers=inviter["headers"])).json()
    assert me["invited_count"] == 1 and sent[0] == (700002, None)

    stats = (await client.get("/api/v1/admin/stats", headers=await owner_headers(client))).json()
    assert stats["top_inviters"] == [{"name": "Muhammadqodir", "count": 1}]


async def test_partner_links_open_the_matching_signup(client, monkeypatch):
    sent = await with_bot(monkeypatch)
    await client.post("/telegram/webhook", json=start(800001, "hr"), headers=HEADERS)
    await client.post("/telegram/webhook", json=start(800002, "uni"), headers=HEADERS)
    await client.post("/telegram/webhook", json=start(800003), headers=HEADERS)
    assert sent == [(800001, "employer"), (800002, "university"), (800003, None)]


async def test_every_track_starts_with_a_quick_task(client, make_user):
    u = await make_user("Aziza")
    for track in (await client.get("/api/v1/tracks")).json():
        tasks = (await client.get(f"/api/v1/tracks/{track['id']}/tasks", headers=u["headers"])).json()
        assert tasks[0]["title"].startswith("Start") and tasks[0]["points"] == 5


async def test_pilot_rules_are_public(client):
    rules = (await client.get("/api/v1/rules")).json()
    assert rules["peer_approvals_required"] == 2 and rules["review_points"] == 2   # test env keeps 2


def test_weekly_streak(monkeypatch):
    u = User(telegram_id=1, full_name="X", streak_count=0, last_active_on=None)
    days = iter([date(2026, 10, 5), date(2026, 10, 7), date(2026, 10, 12), date(2026, 10, 26)])
    monkeypatch.setattr(progress, "today", lambda: next(days))
    progress.touch_streak(u)                 # Monday, week 1
    assert u.streak_count == 1
    progress.touch_streak(u)                 # Wednesday, same week: unchanged
    assert u.streak_count == 1
    progress.touch_streak(u)                 # next Monday: 2 weeks in a row
    assert u.streak_count == 2
    progress.touch_streak(u)                 # a week skipped: starts again
    assert u.streak_count == 1


async def test_monday_reminder_names_next_task_and_runs_once(client, make_user):
    u = await make_user("Aziza")
    track = (await client.get("/api/v1/tracks")).json()[0]
    await client.patch("/api/v1/me", json={"track_id": track["id"]}, headers=u["headers"])
    async with SessionLocal() as s:
        messages = await reminders.build_messages(s)
        starter = (await s.execute(select(Task).where(Task.track_id == track["id"], Task.sort_order == 0))).scalar_one()
    assert len(messages) == 1 and starter.title in messages[0][1]
    # not Monday, or before 10:00: nothing happens
    assert await reminders.run_once(datetime(2026, 10, 7, 12, tzinfo=TASHKENT)) == 0
    assert await reminders.run_once(datetime(2026, 10, 12, 8, tzinfo=TASHKENT)) == 0
