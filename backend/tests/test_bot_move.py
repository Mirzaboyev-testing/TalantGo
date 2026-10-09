"""Moving to a new Telegram bot must lose nobody: same accounts, the old bot points to the new one,
and notifications still reach people who have not pressed Start in the new bot yet."""
import time

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import User
from app.services import notify, telegram_bot
from tests.conftest import owner_headers
from tests.test_telegram_auth import signed_init_data

OLD = "111111:" + "o" * 35
NEW = "222222:" + "n" * 35
NAMES = {OLD: "create_carieer_bot", NEW: "talantgo_bot"}
NEVER_STARTED_NEW_BOT = 111


def fake_telegram(monkeypatch) -> list:
    calls = []

    async def call(token, method, **params):
        calls.append((token, method, params))
        if token not in NAMES:
            raise telegram_bot.BotError("Unauthorized")
        if method == "getMe":
            return {"username": NAMES[token], "first_name": "TalantGo"}
        if method == "sendMessage" and token == NEW and params["chat_id"] == NEVER_STARTED_NEW_BOT:
            raise telegram_bot.BotError("Forbidden: bot can't initiate conversation with a user")
        return {"ok": True}
    monkeypatch.setattr(telegram_bot, "call", call)
    return calls


async def _login(client, token: str, user_id: int = 777):
    user = {"id": user_id, "first_name": "Aziza", "last_name": "Karimova"}
    return await client.post("/api/v1/auth/telegram", json={"init_data": signed_init_data(user, int(time.time()), token)})


async def _users() -> int:
    async with SessionLocal() as s:
        return await s.scalar(select(func.count()).select_from(User))


async def _switch(client, monkeypatch):
    calls = fake_telegram(monkeypatch)
    admin = await owner_headers(client)
    assert (await client.put("/api/v1/admin/bot", json={"token": OLD}, headers=admin)).status_code == 200
    assert (await _login(client, OLD)).status_code == 200            # a student from the old days
    status = (await client.put("/api/v1/admin/bot", json={"token": NEW}, headers=admin)).json()
    return calls, admin, status


async def test_new_bot_keeps_every_account(client, monkeypatch):
    calls, admin, status = await _switch(client, monkeypatch)
    assert status["username"] == "talantgo_bot" and status["previous_username"] == "create_carieer_bot"
    before = await _users()

    old = await _login(client, OLD)                                    # opened from the old bot
    assert old.status_code == 200 and old.json()["moved_to"] == "talantgo_bot"
    new = await _login(client, NEW)
    assert new.status_code == 200 and new.json()["moved_to"] is None
    ids = set()
    for r in (old, new):
        ids.add((await client.get("/api/v1/me", headers={"Authorization": f"Bearer {r.json()['token']}"})).json()["id"])
    assert len(ids) == 1 and await _users() == before                  # the same account, nobody added or lost
    assert (await _login(client, "333333:" + "x" * 35)).status_code == 401
    assert (await client.get("/api/v1/auth/mode")).json()["bot_username"] == "talantgo_bot"

    from app.core.config import settings
    monkeypatch.setattr(settings, "public_url", "https://talantgo.test")   # Telegram needs https
    r = await client.post("/api/v1/admin/bot/connect", headers=admin)
    assert r.status_code == 200 and r.json()["previous_username"] == "create_carieer_bot"
    renamed = {(t, p.get("name")) for t, m, p in calls if m == "setMyName"}
    assert (NEW, "TalantGo") in renamed and (OLD, telegram_bot.OLD_BOT_NAME) in renamed
    hooks = {t: p["secret_token"] for t, m, p in calls if m == "setWebhook"}
    assert hooks == {NEW: telegram_bot.webhook_secret(NEW), OLD: telegram_bot.webhook_secret(OLD)}


async def test_old_bot_sends_people_to_the_new_one_with_their_invite(client, monkeypatch):
    calls, _, _ = await _switch(client, monkeypatch)
    welcomed = []

    async def fake_welcome(token, chat_id, public_url, role=None, join=None):
        welcomed.append(token)
    monkeypatch.setattr(telegram_bot, "send_welcome", fake_welcome)

    def update(text):
        return {"message": {"from": {"id": 5555, "first_name": "Bek"}, "chat": {"id": 5555, "type": "private"}, "text": text}}

    r = await client.post("/telegram/webhook", json=update("/start r12"),
                          headers={"X-Telegram-Bot-Api-Secret-Token": telegram_bot.webhook_secret(OLD)})
    assert r.status_code == 200 and welcomed == []
    token, method, params = calls[-1]
    assert (token, method) == (OLD, "sendMessage") and "@talantgo_bot" in params["text"]
    assert params["reply_markup"]["inline_keyboard"][0][0]["url"] == "https://t.me/talantgo_bot?start=r12"

    await client.post("/telegram/webhook", json=update("/start"),
                      headers={"X-Telegram-Bot-Api-Secret-Token": telegram_bot.webhook_secret(NEW)})
    assert welcomed == [NEW]
    assert (await client.post("/telegram/webhook", json=update("/start"),
                              headers={"X-Telegram-Bot-Api-Secret-Token": "forged"})).status_code == 403


async def test_notifications_reach_people_who_have_not_started_the_new_bot(client, monkeypatch):
    calls, _, _ = await _switch(client, monkeypatch)
    calls.clear()
    await notify._send([NEVER_STARTED_NEW_BOT, 222], "Ishingiz tasdiqlandi", "Ilovani ochish")
    delivered = [(t, p["chat_id"], p["text"]) for t, m, p in calls if m == "sendMessage"]
    assert (NEW, 222, "Ishingiz tasdiqlandi") in delivered
    via_old = [text for t, chat, text in delivered if t == OLD and chat == NEVER_STARTED_NEW_BOT]
    assert len(via_old) == 1 and via_old[0].startswith("Ishingiz tasdiqlandi") and "@talantgo_bot" in via_old[0]


async def test_the_old_bot_can_be_retired_later(client, monkeypatch):
    calls, admin, _ = await _switch(client, monkeypatch)
    status = (await client.post("/api/v1/admin/bot/previous/forget", headers=admin)).json()
    assert status["previous_username"] is None and status["username"] == "talantgo_bot"
    assert (OLD, "deleteWebhook") in [(t, m) for t, m, _ in calls]
    assert (await _login(client, OLD)).status_code == 401
    assert (await _login(client, NEW)).status_code == 200


async def test_an_old_bot_replaced_without_being_kept_can_be_brought_back(client, monkeypatch):
    calls = fake_telegram(monkeypatch)
    from app.core.config import settings
    monkeypatch.setattr(settings, "public_url", "https://talantgo.test")
    admin = await owner_headers(client)
    await client.put("/api/v1/admin/bot", json={"token": NEW}, headers=admin)      # the old token was simply overwritten
    assert (await _login(client, OLD)).status_code == 401
    assert (await client.put("/api/v1/admin/bot/previous", json={"token": NEW}, headers=admin)).status_code == 400

    status = (await client.put("/api/v1/admin/bot/previous", json={"token": OLD}, headers=admin)).json()
    assert status["username"] == "talantgo_bot" and status["previous_username"] == "create_carieer_bot"
    old = await _login(client, OLD)
    assert old.status_code == 200 and old.json()["moved_to"] == "talantgo_bot"
    assert (OLD, telegram_bot.OLD_BOT_NAME) in {(t, p.get("name")) for t, m, p in calls if m == "setMyName"}
    update = {"message": {"from": {"id": 5555}, "chat": {"id": 5555, "type": "private"}, "text": "/start"}}
    r = await client.post("/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": telegram_bot.webhook_secret(OLD)})
    assert r.status_code == 200 and calls[-1][:2] == (OLD, "sendMessage")
