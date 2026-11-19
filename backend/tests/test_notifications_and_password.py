"""Admin bell routed by permissions, password recovery through the bot or the owner, sessions that end on a new
password, and the bot answering in the chat itself (companies and universities may never open the Mini App)."""
import re

from sqlalchemy import update

from app.core.config import settings
from app.core.db import SessionLocal
from app.models import User
from app.services import admin_access, notify
from app.services.telegram_bot import webhook_secret
from tests.conftest import owner_headers as owner
from tests.test_bot_move import NEW, fake_telegram
from tests.test_career import make_employer
from tests.test_ranking_and_admin import staff_account
from tests.test_signup_and_tests import full_student
from tests.test_university_panel2 import staff_form

API = "/api/v1"


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def admin_bell(client, headers) -> list[dict]:
    r = await client.get(f"{API}/admin/notifications", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["items"]


async def with_bot(client, monkeypatch) -> list:
    calls = fake_telegram(monkeypatch)
    assert (await client.put(f"{API}/admin/bot", json={"token": NEW}, headers=await owner(client))).status_code == 200
    return calls


async def bot(client, text: str, tg_id: int) -> None:
    update_ = {"message": {"from": {"id": tg_id, "first_name": "Aziza"}, "chat": {"id": tg_id, "type": "private"}, "text": text}}
    r = await client.post("/telegram/webhook", json=update_, headers={"X-Telegram-Bot-Api-Secret-Token": webhook_secret(NEW)})
    assert r.status_code == 200


def sent_to(calls, chat_id: int) -> list[dict]:
    return [p for _, method, p in calls if method == "sendMessage" and p.get("chat_id") == chat_id]


# --------------------------------------------------------------------------- the admin bell

async def test_admin_notices_reach_the_accounts_allowed_to_decide(client, make_user):
    owner_h = await owner(client)
    admin_h = await staff_account(client, "admin", "admin@careerup.test")
    mod_h = await staff_account(client, "moderator", "mod@careerup.test")
    analyst_h = await staff_account(client, "analyst", "analyst@careerup.test")
    for h in (owner_h, admin_h, mod_h, analyst_h):                  # sign-up notices of the staff accounts aside
        await client.post(f"{API}/admin/notifications/read", json={}, headers=h)

    hr = await make_employer(client, make_user)                     # a company signs up: "companies"
    await staff_form(client, make_user)                             # a university member asks: "universities"
    kinds = {name: [n["kind"] for n in await admin_bell(client, h) if not n["read"]]
             for name, h in (("owner", owner_h), ("admin", admin_h), ("mod", mod_h), ("analyst", analyst_h))}
    assert kinds["owner"] == ["staff_new", "company_new"] and kinds["admin"] == ["staff_new", "company_new"]
    assert kinds["mod"] == ["company_new"]                          # university approvals are off for moderators
    assert kinds["analyst"] == []
    notice = (await admin_bell(client, mod_h))[0]
    assert notice["link"] == "queue" and "Data Solutions" in notice["text"] and notice["read"] is False

    # the bell is the account's own: reading is open to every account, whatever is switched on
    r = await client.post(f"{API}/admin/notifications/read", json={"ids": [notice["id"]]}, headers=mod_h)
    assert r.status_code == 200 and r.json()["unread"] == 0
    assert (await client.get(f"{API}/admin/notifications/unread", headers=admin_h)).json()["unread"] == 2

    # the owner switches company approvals off for the moderator: the next company no longer reaches them
    aid = next(a for a in (await client.get(f"{API}/admin/accounts", headers=owner_h)).json() if a["email"] == "mod@careerup.test")["id"]
    await client.patch(f"{API}/admin/accounts/{aid}", json={"permissions": ["complaints"]}, headers=owner_h)
    await make_employer(client, make_user, name="HR Botir", stir="309876543")
    assert [n["kind"] for n in await admin_bell(client, mod_h) if not n["read"]] == []

    # a complaint reaches "complaints"; a job waiting for review reaches "jobs"
    await client.post(f"{API}/admin/companies/{hr['company_id']}/review", json={"approve": True}, headers=owner_h)
    student = await full_student(client, make_user, "Dilnoza Karimova")
    r = await client.post(f"{API}/complaints", json={"target_kind": "company", "target_id": hr["company_id"],
                                                     "reason": "spam", "text": "Soxta e'lon"}, headers=student["headers"])
    assert r.status_code == 201, r.text
    assert (await admin_bell(client, mod_h))[0]["kind"] == "complaint_new"
    counts = (await client.get(f"{API}/admin/inbox", headers=owner_h)).json()
    assert counts["complaints"] == 1 and counts["password_requests"] == 0


async def test_new_admin_accounts_and_lonely_verifications(client, make_user):
    owner_h = await owner(client)
    admin_h = await staff_account(client, "admin", "admin@careerup.test")
    assert [n["kind"] for n in await admin_bell(client, owner_h)] == ["admin_account_new"]
    assert await admin_bell(client, admin_h) == []                  # only the owner approves admin accounts

    # nobody at the student's university can check them yet: the platform's "students" admins hear about it
    student = await full_student(client, make_user, "Lola Rahimova")
    assert (await client.post(f"{API}/me/verification", headers=student["headers"])).status_code == 200
    assert (await admin_bell(client, admin_h))[0]["kind"] == "verification_new"


def test_every_admin_bell_route_is_open_to_its_owner():
    assert admin_access.required("POST", "/admin/notifications/read") == admin_access.SELF


def test_companies_and_universities_get_a_website_button():
    assert notify.markup_for("employer", "Ilovani ochish", "/korxona/nomzodlar")["inline_keyboard"][0][0]["url"].endswith("/korxona/nomzodlar")
    assert "url" in notify.markup_for("university", "x", "/universitet")["inline_keyboard"][0][0]
    assert "web_app" in notify.markup_for("student", "Ilovani ochish", "/talaba")["inline_keyboard"][0][0]


# --------------------------------------------------------------------------- password recovery

async def test_forgotten_password_through_the_bot_code(client, make_user, monkeypatch):
    calls = await with_bot(client, monkeypatch)
    hr = await make_employer(client, make_user)
    async with SessionLocal() as s:
        tg_id = (await s.get(User, hr["id"])).telegram_id
    r = await client.put(f"{API}/me/password", json={"email": "hr@data.uz", "password": "eski-parol-1"}, headers=hr["headers"])
    assert r.status_code == 200 and r.json()["token"] is None       # a first password: nothing to sign out
    browser = auth((await client.post(f"{API}/auth/login", json={"email": "hr@data.uz", "password": "eski-parol-1"})).json()["token"])

    # unknown e-mails get the same answer and no message
    assert (await client.post(f"{API}/auth/password/forgot", json={"email": "nobody@data.uz"})).json() == {"ok": True}
    assert (await client.post(f"{API}/auth/password/forgot", json={"email": "HR@data.uz"})).json() == {"ok": True}
    message = sent_to(calls, tg_id)[-1]
    code = re.search(r"Kod: (\d{6})", message["text"]).group(1)
    assert message["reply_markup"]["inline_keyboard"][0][0]["url"].startswith("http")

    wrong = await client.post(f"{API}/auth/password/reset", json={"email": "hr@data.uz", "code": f"{(int(code) + 1) % 10**6:06d}",
                                                                 "password": "yangi-parol-2"})
    assert wrong.status_code == 400
    r = await client.post(f"{API}/auth/password/reset", json={"email": "hr@data.uz", "code": code, "password": "yangi-parol-2"})
    assert r.status_code == 200, r.text
    # every older session ends; the new one works; the code cannot be used twice
    assert (await client.get(f"{API}/me", headers=browser)).status_code == 401
    assert (await client.get(f"{API}/me", headers=hr["headers"])).status_code == 401
    fresh = auth(r.json()["token"])
    bell = (await client.get(f"{API}/me/notifications", headers=fresh)).json()["items"]
    assert bell[0]["kind"] == "password_changed"
    again = await client.post(f"{API}/auth/password/reset", json={"email": "hr@data.uz", "code": code, "password": "uchinchi-3"})
    assert again.status_code == 400
    assert (await client.post(f"{API}/auth/login", json={"email": "hr@data.uz", "password": "yangi-parol-2"})).status_code == 200


async def test_five_wrong_codes_close_the_reset(client, make_user, monkeypatch):
    calls = await with_bot(client, monkeypatch)
    u = await make_user("Sardor Aliyev", telegram_id=8801)
    await client.put(f"{API}/me/password", json={"email": "sardor@mail.uz", "password": "eski-parol-1"}, headers=u["headers"])
    await client.post(f"{API}/auth/password/forgot", json={"email": "sardor@mail.uz"})
    code = re.search(r"Kod: (\d{6})", sent_to(calls, 8801)[-1]["text"]).group(1)
    other = f"{(int(code) + 7) % 10**6:06d}"
    for _ in range(5):
        await client.post(f"{API}/auth/password/reset", json={"email": "sardor@mail.uz", "code": other, "password": "yangi-parol-2"})
    r = await client.post(f"{API}/auth/password/reset", json={"email": "sardor@mail.uz", "code": code, "password": "yangi-parol-2"})
    assert r.status_code == 400


async def test_bot_parol_link_gives_a_telegram_only_account_an_email(client, make_user, monkeypatch):
    calls = await with_bot(client, monkeypatch)
    uni = await staff_form(client, make_user, name="Aziza Karimova")      # a Telegram account without e-mail
    async with SessionLocal() as s:
        tg_id = (await s.get(User, uni["id"])).telegram_id
    await bot(client, "/parol", tg_id)
    url = sent_to(calls, tg_id)[-1]["reply_markup"]["inline_keyboard"][0][0]["url"]
    token = url.split("t=")[1]
    info = (await client.get(f"{API}/auth/password/reset/{token}")).json()
    assert info["email"] is None and info["account_type"] == "university"
    assert (await client.post(f"{API}/auth/password/reset", json={"token": token, "password": "yangi-parol-2"})).status_code == 422
    r = await client.post(f"{API}/auth/password/reset", json={"token": token, "email": "aziza@tdiu.uz", "password": "yangi-parol-2"})
    assert r.status_code == 200, r.text
    assert (await client.post(f"{API}/auth/login", json={"email": "aziza@tdiu.uz", "password": "yangi-parol-2"})).status_code == 200
    assert (await client.get(f"{API}/auth/password/reset/{token}")).status_code == 404     # used


async def test_without_telegram_the_owner_resets_and_a_new_password_is_required(client):
    owner_h = await owner(client)
    reg = await client.post(f"{API}/auth/register", json={"full_name": "Kamola Ismoilova", "email": "kamola@mail.uz",
                                                          "password": "eski-parol-1"})
    old = auth(reg.json()["token"])
    body = {"email": "kamola@mail.uz", "full_name": "Kamola Ismoilova", "phone": "+998901112233", "note": "Telegramim yo'q"}
    assert (await client.post(f"{API}/auth/password/help", json=body)).json() == {"ok": True}
    await client.post(f"{API}/auth/password/help", json=body)                 # a second click opens no second request
    notice = (await admin_bell(client, owner_h))[0]
    assert notice["kind"] == "password_request" and "+998901112233" in notice["text"] and notice["link"] == "users"
    requests = (await client.get(f"{API}/admin/password-requests", headers=owner_h)).json()
    assert len(requests) == 1 and requests[0]["account"]["name"] == "Kamola Ismoilova"
    assert (await client.get(f"{API}/admin/inbox", headers=owner_h)).json()["password_requests"] == 1

    # only the owner hands out passwords
    admin_h = await staff_account(client, "admin", "admin@careerup.test")
    assert (await client.post(f"{API}/admin/password-requests/{requests[0]['id']}/reset", headers=admin_h)).status_code == 403
    temp = (await client.post(f"{API}/admin/password-requests/{requests[0]['id']}/reset", headers=owner_h)).json()["temporary_password"]
    assert (await client.get(f"{API}/me", headers=old)).status_code == 401
    assert (await client.get(f"{API}/admin/password-requests", headers=owner_h)).json() == []

    signed = auth((await client.post(f"{API}/auth/login", json={"email": "kamola@mail.uz", "password": temp})).json()["token"])
    me = (await client.get(f"{API}/me", headers=signed)).json()
    assert me["must_change_password"] is True
    assert (await client.get(f"{API}/me/notifications", headers=signed)).json()["items"][0]["kind"] == "password_reset"
    r = await client.put(f"{API}/me/password", json={"email": "kamola@mail.uz", "password": "yangi-parol-2"}, headers=signed)
    assert r.status_code == 200 and r.json()["must_change_password"] is False and r.json()["token"]
    assert (await client.get(f"{API}/me", headers=signed)).status_code == 401           # the temporary session ended
    assert (await client.get(f"{API}/me", headers=auth(r.json()["token"]))).status_code == 200
    # from now on a change needs the current password again
    again = await client.put(f"{API}/me/password", json={"email": "kamola@mail.uz", "password": "boshqa-parol-3"},
                             headers=auth(r.json()["token"]))
    assert again.status_code == 403


async def test_an_admin_who_forgot_asks_the_owner(client):
    owner_h = await owner(client)
    await staff_account(client, "moderator", "mod@careerup.test")
    for email in ("mod@careerup.test", "nobody@careerup.test", "MOD@careerup.test"):
        assert (await client.post(f"{API}/admin-auth/password-request", json={"email": email})).json() == {"ok": True}
    requests = (await client.get(f"{API}/admin/password-requests", headers=owner_h)).json()
    assert [(r["kind"], r["email"]) for r in requests] == [("admin", "mod@careerup.test")]
    assert (await admin_bell(client, owner_h))[0]["link"] == "accounts"
    temp = (await client.post(f"{API}/admin/password-requests/{requests[0]['id']}/reset", headers=owner_h)).json()["temporary_password"]
    assert (await client.post(f"{API}/admin-auth/login", json={"email": "mod@careerup.test", "password": temp})).status_code == 200


async def test_changing_a_password_signs_other_devices_out(client):
    reg = await client.post(f"{API}/auth/register", json={"full_name": "Jasur Toshmatov", "email": "jasur@mail.uz",
                                                          "password": "eski-parol-1"})
    phone = auth(reg.json()["token"])
    laptop = auth((await client.post(f"{API}/auth/login", json={"email": "jasur@mail.uz", "password": "eski-parol-1"})).json()["token"])
    r = await client.put(f"{API}/me/password", json={"email": "jasur@mail.uz", "password": "yangi-parol-2",
                                                     "current_password": "eski-parol-1"}, headers=laptop)
    assert r.status_code == 200 and r.json()["token"]
    assert (await client.get(f"{API}/me", headers=phone)).status_code == 401
    assert (await client.get(f"{API}/me", headers=auth(r.json()["token"]))).status_code == 200


# --------------------------------------------------------------------------- the bot answers in the chat

async def test_bot_shows_account_and_notifications_without_the_mini_app(client, make_user, monkeypatch):
    calls = await with_bot(client, monkeypatch)
    owner_h = await owner(client)
    hr = await make_employer(client, make_user)
    await client.put(f"{API}/me/password", json={"email": "hr@data.uz", "password": "eski-parol-1"}, headers=hr["headers"])
    await client.post(f"{API}/admin/companies/{hr['company_id']}/review", json={"approve": True}, headers=owner_h)
    async with SessionLocal() as s:
        tg_id = (await s.get(User, hr["id"])).telegram_id

    await bot(client, "/akkaunt", tg_id)
    answer = sent_to(calls, tg_id)[-1]
    assert "hr@data.uz" in answer["text"] and "Data Solutions MChJ (tasdiqlangan)" in answer["text"]
    assert answer["reply_markup"]["inline_keyboard"][0][0]["url"].endswith("/kirish/korxona")

    await bot(client, "/bildirishnomalar", tg_id)
    answer = sent_to(calls, tg_id)[-1]
    assert "1 ta yangi" in answer["text"] and "tasdiqlandi" in answer["text"]
    assert "url" in answer["reply_markup"]["inline_keyboard"][0][0]            # the website, not the Mini App
    assert (await client.get(f"{API}/me/notifications/unread", headers=hr["headers"])).json()["unread"] == 0

    await bot(client, "salom", tg_id)
    assert "/bildirishnomalar" in sent_to(calls, tg_id)[-1]["text"]
    await bot(client, "/akkaunt", 99990001)                                    # nobody has this Telegram
    assert "bog'lanmagan" in sent_to(calls, 99990001)[-1]["text"]

    # a blocked account gets nothing about itself
    async with SessionLocal() as s:
        await s.execute(update(User).where(User.id == hr["id"]).values(is_blocked=True))
        await s.commit()
    await bot(client, "/akkaunt", tg_id)
    assert "bloklangan" in sent_to(calls, tg_id)[-1]["text"]


async def test_bot_menu_lists_the_commands(client, monkeypatch):
    calls = await with_bot(client, monkeypatch)
    monkeypatch.setattr(settings, "public_url", "https://careerup.test")
    r = await client.post(f"{API}/admin/bot/connect", headers=await owner(client))       # the owner's "Botni ulash"
    assert r.status_code == 200, r.text
    commands = [p["commands"] for _, method, p in calls if method == "setMyCommands"][-1]
    assert [c["command"] for c in commands] == ["bildirishnomalar", "akkaunt", "parol", "yordam"]
