"""Website sign-in without the Telegram widget: through the bot, or with email and password, and one account
for both (a website account can be tied to Telegram, a Telegram account can get an email and password)."""
import re

from app.services import web_login
from app.services.telegram_bot import webhook_secret
from tests.test_bot_move import NEW, _login, _switch


def msg(text: str, tg_id: int, first="Aziza", last="Karimova") -> dict:
    return {"message": {"from": {"id": tg_id, "first_name": first, "last_name": last}, "chat": {"id": tg_id, "type": "private"}, "text": text}}


def pin_from(calls) -> str:
    return re.search(r"\b(\d{6})\b", calls[-1][2]["text"]).group(1)


async def bot(client, text: str, tg_id: int):
    r = await client.post("/telegram/webhook", json=msg(text, tg_id), headers={"X-Telegram-Bot-Api-Secret-Token": webhook_secret(NEW)})
    assert r.status_code == 200


async def test_email_sign_up_and_sign_in(client):
    body = {"full_name": "Nigora Karimova", "email": " Nigora@Gmail.com ", "password": "kuchli-parol-1"}
    r = await client.post("/api/v1/auth/register", json=body)
    assert r.status_code == 201
    me = (await client.get("/api/v1/me", headers={"Authorization": f"Bearer {r.json()['token']}"})).json()
    assert me["email"] == "nigora@gmail.com" and me["has_password"] and not me["has_telegram"]
    assert (await client.post("/api/v1/auth/register", json=body)).status_code == 409
    assert (await client.post("/api/v1/auth/register", json={**body, "email": "x@y.uz", "password": "short"})).status_code == 422

    ok = await client.post("/api/v1/auth/login", json={"email": "nigora@gmail.com", "password": "kuchli-parol-1"})
    assert ok.status_code == 200
    for _ in range(8):
        assert (await client.post("/api/v1/auth/login", json={"email": "nigora@gmail.com", "password": "notogri-parol"})).status_code == 401
    assert (await client.post("/api/v1/auth/login", json={"email": "nigora@gmail.com", "password": "kuchli-parol-1"})).status_code == 429


async def test_sign_in_on_the_website_through_the_bot(client, monkeypatch):
    calls, _, _ = await _switch(client, monkeypatch)
    start = (await client.post("/api/v1/auth/bot-login")).json()
    code = start["code"]
    assert start["url"] == f"https://t.me/talantgo_bot?start={web_login.PREFIX}{code}"
    assert (await client.get(f"/api/v1/auth/bot-login/{code}")).json()["status"] == "pending"

    await bot(client, f"/start {web_login.PREFIX}{code}", 9001)
    assert "keyboard" in calls[-1][2]["reply_markup"]            # the bot asks to confirm
    assert (await client.get(f"/api/v1/auth/bot-login/{code}")).json()["status"] == "claimed"
    await bot(client, web_login.YES, 9001)
    assert (await client.get(f"/api/v1/auth/bot-login/{code}")).json()["status"] == "awaiting_pin"
    pin = pin_from(calls)                                    # the bot shows a PIN, typed on the website that asked
    wrong = "000000" if pin != "000000" else "111111"
    assert (await client.post(f"/api/v1/auth/bot-login/{code}/verify", json={"pin": wrong})).status_code == 400
    done = (await client.post(f"/api/v1/auth/bot-login/{code}/verify", json={"pin": pin})).json()
    me = (await client.get("/api/v1/me", headers={"Authorization": f"Bearer {done['token']}"})).json()
    assert me["full_name"] == "Aziza Karimova" and me["has_telegram"]
    assert (await client.get(f"/api/v1/auth/bot-login/{code}")).json()["status"] == "used"   # one session per code
    assert (await client.post(f"/api/v1/auth/bot-login/{code}/verify", json={"pin": pin})).status_code == 410

    # a link someone else made gives them nothing: without the PIN from the victim's chat there is no session
    code3 = (await client.post("/api/v1/auth/bot-login")).json()["code"]
    await bot(client, f"/start {web_login.PREFIX}{code3}", 9001)
    await bot(client, web_login.YES, 9001)
    for _ in range(web_login.MAX_PIN_TRIES):
        await client.post(f"/api/v1/auth/bot-login/{code3}/verify", json={"pin": wrong if wrong != pin_from(calls) else "222222"})
    assert (await client.get(f"/api/v1/auth/bot-login/{code3}")).json()["status"] == "rejected"

    # "No" signs nobody in
    code2 = (await client.post("/api/v1/auth/bot-login")).json()["code"]
    await bot(client, f"/start {web_login.PREFIX}{code2}", 9001)
    await bot(client, web_login.NO, 9001)
    assert (await client.get(f"/api/v1/auth/bot-login/{code2}")).json()["status"] == "rejected"


async def test_email_account_tied_to_telegram_is_one_account(client, monkeypatch):
    calls, _, _ = await _switch(client, monkeypatch)
    token = (await client.post("/api/v1/auth/register", json={"full_name": "Jasur Toshmatov", "email": "jasur@mail.uz",
                                                              "password": "parol-12345"})).json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    web_id = (await client.get("/api/v1/me", headers=h)).json()["id"]

    # this person had opened the bot before linking: that empty account steps aside
    assert (await _login(client, NEW, 9100)).status_code == 200
    code = (await client.post("/api/v1/me/telegram-link", headers=h)).json()["code"]
    await bot(client, f"/start {web_login.PREFIX}{code}", 9100)
    await bot(client, web_login.YES, 9100)
    other = (await client.post("/api/v1/auth/register", json={"full_name": "Boshqa Odam", "email": "boshqa@mail.uz",
                                                              "password": "parol-12345"})).json()["token"]
    assert (await client.post(f"/api/v1/me/telegram-link/{code}/verify", json={"pin": pin_from(calls)},
                              headers={"Authorization": f"Bearer {other}"})).status_code == 410   # only the account that asked
    me = (await client.post(f"/api/v1/me/telegram-link/{code}/verify", json={"pin": pin_from(calls)}, headers=h)).json()
    assert me["has_telegram"] and me["full_name"] == "Jasur Toshmatov"          # the typed name is kept

    # the Telegram app now opens the very same account
    tg_token = (await _login(client, NEW, 9100)).json()["token"]
    assert (await client.get("/api/v1/me", headers={"Authorization": f"Bearer {tg_token}"})).json()["id"] == web_id
    assert (await client.post("/api/v1/me/telegram-link", headers=h)).status_code == 409


async def test_linking_never_swallows_an_account_with_data(client, monkeypatch):
    calls, _, _ = await _switch(client, monkeypatch)
    tg = (await _login(client, NEW, 9300)).json()["token"]
    await client.patch("/api/v1/me", json={"consent": True}, headers={"Authorization": f"Bearer {tg}"})
    token = (await client.post("/api/v1/auth/register", json={"full_name": "Madina Yusupova", "email": "madina@mail.uz",
                                                              "password": "parol-12345"})).json()["token"]
    code = (await client.post("/api/v1/me/telegram-link", headers={"Authorization": f"Bearer {token}"})).json()["code"]
    await bot(client, f"/start {web_login.PREFIX}{code}", 9300)
    await bot(client, web_login.YES, 9300)
    r = await client.post(f"/api/v1/me/telegram-link/{code}/verify", json={"pin": pin_from(calls)},
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 409 and "boshqa" in r.json()["detail"]
    assert (await client.get(f"/api/v1/auth/bot-login/{code}")).json()["status"] == "conflict"


async def test_telegram_account_gets_email_and_password(client, monkeypatch):
    await _switch(client, monkeypatch)
    tg = (await _login(client, NEW, 9400)).json()["token"]
    h = {"Authorization": f"Bearer {tg}"}
    me = (await client.put("/api/v1/me/password", json={"email": "Aziza@Mail.uz", "password": "yangi-parol-1"}, headers=h)).json()
    assert me["email"] == "aziza@mail.uz" and me["has_password"] and me["has_telegram"]
    web = (await client.post("/api/v1/auth/login", json={"email": "aziza@mail.uz", "password": "yangi-parol-1"})).json()
    assert (await client.get("/api/v1/me", headers={"Authorization": f"Bearer {web['token']}"})).json()["id"] == me["id"]
    # changing it later needs the current password
    r = await client.put("/api/v1/me/password", json={"email": "aziza@mail.uz", "password": "boshqa-parol-2"}, headers=h)
    assert r.status_code == 403


async def test_bad_start_payload_never_breaks_the_webhook(client, monkeypatch):
    await _switch(client, monkeypatch)
    await bot(client, "/start r99999999999", 9500)            # out of range id: ignored, Telegram gets 200
    await bot(client, "/start login_nonexistent", 9500)


async def test_admin_can_reset_a_website_password(client):
    from tests.conftest import owner_headers
    token = (await client.post("/api/v1/auth/register", json={"full_name": "Kamola Ismoilova", "email": "kamola@mail.uz",
                                                              "password": "parol-12345"})).json()["token"]
    me = (await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})).json()
    admin = await owner_headers(client)
    users = (await client.get("/api/v1/admin/users", params={"q": "kamola@"}, headers=admin)).json()
    assert users[0]["email"] == "kamola@mail.uz" and users[0]["has_telegram"] is False
    temp = (await client.post(f"/api/v1/admin/users/{me['id']}/reset-password", headers=admin)).json()["temporary_password"]
    assert (await client.post("/api/v1/auth/login", json={"email": "kamola@mail.uz", "password": temp})).status_code == 200
