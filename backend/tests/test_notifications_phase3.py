"""Notifications phase 3: the bot in the reader's language, bot settings, unreachable people, cleanup of old notices
and admin accounts on Telegram."""
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select, update

from app.core.db import SessionLocal
from app.models import AdminAccount, AdminNotification, Notification, User
from app.services import admin_inbox, announcements, notif_i18n, notify, reminders, telegram_bot
from tests.conftest import owner_headers as owner
from tests.test_notifications_and_password import bot, sent_to, with_bot
from tests.test_signup_and_tests import full_student

API = "/api/v1"
# shown as written in every language: the author typed them, or the text is built for the reader (digest)
AS_WRITTEN = {"university_announcement", "admin_announcement", "weekly_digest", "staff_request", "post_hidden"}


def test_every_notice_kind_has_ru_and_en_words():
    app = Path(__file__).resolve().parent.parent / "app"
    kinds = set()
    for f in app.rglob("*.py"):
        kinds |= set(re.findall(r"(?<![a-z_])(?:user_)?inbox\.push\(\s*session,[^\n]*?\"([a-z_]+)\"",
                                f.read_text(encoding="utf-8")))
    kinds |= {"task_entry_new", "company_event", "interview_reminder", "test_deadline", "task_deadline"}
    table = notif_i18n.templates()
    missing = [(lang, k) for k in sorted(kinds - AS_WRITTEN) for lang in ("ru", "en")
               if not any(key == f"notif.{k}" or key.startswith(f"notif.{k}.") for key in table.get(lang, {}))]
    assert missing == [], "run `npm run notif-templates` in frontend/ after adding notif.* keys"


def test_render_picks_the_variant_and_falls_back_to_uzbek():
    params = {"status": "interview", "job": "Data analitik", "company": "Data Solutions", "when": " 02.11 10:30"}
    ru = notif_i18n.render("application_status", params, "ru", "uz matn")
    assert "Data analitik" in ru and "Data Solutions" in ru and ru != "uz matn"
    assert notif_i18n.render("company_review", {"approved": False, "note": "STIR"}, "en", "x") != "x"
    assert notif_i18n.render("application_status", params, "uz", "uz matn") == "uz matn"
    assert notif_i18n.render("no_such_kind", {}, "ru", "uz matn") == "uz matn"


async def make(make_user, name, tg, **values) -> dict:
    u = await make_user(name, telegram_id=tg)
    if values:
        async with SessionLocal() as s:
            await s.execute(update(User).where(User.id == u["id"]).values(**values))
            await s.commit()
    return u


async def test_plan_respects_language_settings_and_unreachable_people(make_user):
    await make(make_user, "Rus Talaba", 501, language="ru")
    await make(make_user, "Jim Talaba", 502, notify_prefs={"telegram": False})
    await make(make_user, "Chat Yoq", 503, notify_prefs={"muted": ["chat"]})
    await make(make_user, "Blok Talaba", 504, tg_blocked_at=datetime.now(UTC))
    await make(make_user, "HR Rus", 505, language="ru", account_type="employer")
    params = {"company": "Data Solutions", "text": "Salom"}
    async with SessionLocal() as s:
        chat = await notify.plan(s, [501, 502, 503, 504, 505, 999], "Data Solutions: Salom", path="/talaba/xabarlar",
                                 kind="chat_message", params=params)
        status = await notify.plan(s, [501, 503], "uz", path="/talaba/arizalar", kind="application_status",
                                   params={"status": "offer", "job": "Analitik", "company": "DS"})
        admin = await notify.plan(s, [999], "Yangi korxona", path="/admin#queue", browser=True)
    by_id = {c: (t, m) for c, t, m in chat}
    assert set(by_id) == {501, 505, 999}               # off, muted chat and unreachable people get nothing
    assert "web_app" in by_id[501][1]["inline_keyboard"][0][0]
    assert by_id[501][1]["inline_keyboard"][0][0]["text"] == notif_i18n.BUTTON["ru"]
    assert "url" in by_id[505][1]["inline_keyboard"][0][0] and "/bildirishnomalar" in by_id[505][0]
    assert [c for c, _, _ in status] == [501, 503]      # a muted category does not stop important notices
    assert re.search("[а-я]", status[0][1]) and status[1][1] == "uz"     # Russian for her, Uzbek as stored for him
    assert admin[0][2]["inline_keyboard"][0][0]["url"].endswith("/admin#queue")


async def test_unreachable_people_are_flagged_and_cleared_when_they_write(client, make_user, monkeypatch):
    calls = await with_bot(client, monkeypatch)
    real_call = telegram_bot.call

    async def call(token, method, **params):
        if method == "sendMessage" and params.get("chat_id") == 601:
            raise telegram_bot.BotError("Forbidden: bot was blocked by the user")
        return await real_call(token, method, **params)
    monkeypatch.setattr(telegram_bot, "call", call)
    u = await make(make_user, "Blokladi", 601)
    await notify._send([601], "Salom", "", "/talaba", kind="application_status", params={})
    me = (await client.get(f"{API}/me", headers=u["headers"])).json()
    assert me["telegram_blocked"] is True
    await bot(client, "salom", 601)                      # writes to the bot again
    assert (await client.get(f"{API}/me", headers=u["headers"])).json()["telegram_blocked"] is False
    assert calls is not None


async def test_bot_settings_endpoint(client, make_user):
    u = await full_student(client, make_user, "Aziza Karimova")
    me = (await client.get(f"{API}/me", headers=u["headers"])).json()
    assert me["notify_prefs"] == {"telegram": True, "muted": []}
    r = await client.put(f"{API}/me/notify-prefs", json={"telegram": True, "muted": ["news", "chat", "news"]}, headers=u["headers"])
    assert r.status_code == 200 and r.json()["notify_prefs"] == {"telegram": True, "muted": ["chat", "news"]}
    assert (await client.put(f"{API}/me/notify-prefs", json={"muted": ["everything"]}, headers=u["headers"])).status_code == 422
    async with SessionLocal() as s:
        recipients = await announcements.bot_recipients(s, [(u["id"], (await s.get(User, u["id"])).telegram_id, "student")])
    assert recipients == []                              # muted "news": admin announcements stay in the bell only


async def test_old_notices_are_cleaned_once_a_day(make_user):
    u = await make_user("Eski Talaba")
    now = datetime.now(UTC)
    async with SessionLocal() as s:
        s.add_all([Notification(user_id=u["id"], kind="x", text="old read", created_at=now - timedelta(days=200), read_at=now),
                   Notification(user_id=u["id"], kind="x", text="old unread", created_at=now - timedelta(days=200)),
                   Notification(user_id=u["id"], kind="x", text="ancient", created_at=now - timedelta(days=400)),
                   Notification(user_id=u["id"], kind="x", text="new read", created_at=now - timedelta(days=5), read_at=now)])
        await s.commit()
    assert await reminders.cleanup_old(now) == 2
    assert await reminders.cleanup_old(now) == 0         # once a day
    async with SessionLocal() as s:
        left = sorted((await s.execute(select(Notification.text).where(Notification.user_id == u["id"]))).scalars())
    assert left == ["new read", "old unread"]


async def test_admin_links_telegram_and_gets_bell_copies(client, make_user, monkeypatch):
    calls = await with_bot(client, monkeypatch)
    owner_h = await owner(client)
    link = (await client.post(f"{API}/admin-auth/telegram-link", headers=owner_h)).json()
    await bot(client, f"/start login_{link['code']}", 7700)
    assert "admin hisobini" in sent_to(calls, 7700)[-1]["text"]
    from app.services import web_login
    await bot(client, web_login.YES, 7700)
    pin = re.search(r"\b(\d{6})\b", sent_to(calls, 7700)[-1]["text"]).group(1)
    assert (await client.post(f"{API}/admin-auth/telegram-link/{link['code']}/verify", json={"pin": "000000"},
                              headers=owner_h)).status_code == 400 or pin == "000000"
    r = await client.post(f"{API}/admin-auth/telegram-link/{link['code']}/verify", json={"pin": pin}, headers=owner_h)
    assert r.status_code == 200 and r.json()["telegram_linked"] is True

    sent: list = []
    monkeypatch.setattr(notify, "send", lambda ids, text, **kw: sent.append((list(ids), kw)))
    async with SessionLocal() as s:
        await admin_inbox.push(s, "companies", "company_new", "Yangi korxona: Test MChJ", "queue")
    assert 7700 in sent[-1][0] and sent[-1][1]["browser"] is True and sent[-1][1]["path"] == "/admin#queue"

    assert (await client.delete(f"{API}/admin-auth/telegram-link", headers=owner_h)).json()["telegram_linked"] is False
    async with SessionLocal() as s:
        assert (await s.execute(select(AdminAccount.telegram_id).where(AdminAccount.role == "owner"))).scalar() is None
        assert await s.scalar(select(AdminNotification.id)) is not None
