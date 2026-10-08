import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

from app.core.security import InitDataError, validate_init_data

BOT_TOKEN = "123456:TEST-token-for-unit-tests-only-abcdefghij"


def signed_init_data(user: dict, auth_date: int, token: str = BOT_TOKEN) -> str:
    fields = {"auth_date": str(auth_date), "query_id": "AAH", "user": json.dumps(user, separators=(",", ":"))}
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


USER = {"id": 777, "first_name": "Aziza", "last_name": "Karimova", "username": "aziza_k"}


def test_valid_init_data_returns_user():
    assert validate_init_data(signed_init_data(USER, int(time.time())), BOT_TOKEN, 3600)["id"] == 777


def test_tampered_init_data_is_rejected():
    data = signed_init_data(USER, int(time.time())).replace("Aziza", "Hacker")
    with pytest.raises(InitDataError):
        validate_init_data(data, BOT_TOKEN, 3600)


def test_other_bot_signature_is_rejected():
    data = signed_init_data(USER, int(time.time()), token="999:another-bot-token-xxxxxxxxxxxxxxxx")
    with pytest.raises(InitDataError):
        validate_init_data(data, BOT_TOKEN, 3600)


def test_expired_init_data_is_rejected():
    with pytest.raises(InitDataError, match="eskirgan"):
        validate_init_data(signed_init_data(USER, int(time.time()) - 7200), BOT_TOKEN, 3600)


def test_missing_hash_is_rejected():
    with pytest.raises(InitDataError):
        validate_init_data("auth_date=1&user=%7B%7D", BOT_TOKEN, 3600)


async def test_login_endpoint_creates_user(client):
    from app.core.db import SessionLocal
    from app.services import settings_store

    async with SessionLocal() as session:
        await settings_store.set_value(session, settings_store.BOT_TOKEN, BOT_TOKEN)
    resp = await client.post("/api/v1/auth/telegram", json={"init_data": signed_init_data(USER, int(time.time()))})
    assert resp.status_code == 200, resp.text
    me = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {resp.json()['token']}"})
    assert me.json()["full_name"] == "Aziza Karimova"
    assert me.json()["username"] == "aziza_k"



def widget_fields(user_id: int, auth_date: int, token: str = BOT_TOKEN) -> dict:
    fields = {"id": user_id, "first_name": "Aziza", "username": "aziza_k", "auth_date": auth_date}
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    fields["hash"] = hmac.new(hashlib.sha256(token.encode()).digest(), check.encode(), hashlib.sha256).hexdigest()
    return fields


async def test_website_login_with_the_telegram_widget(client):
    from app.core.db import SessionLocal
    from app.services import settings_store

    async with SessionLocal() as session:
        await settings_store.set_value(session, settings_store.BOT_TOKEN, BOT_TOKEN)
    good = widget_fields(777, int(time.time()))
    r = await client.post("/api/v1/auth/telegram-web", json=good)
    assert r.status_code == 200, r.text
    me = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {r.json()['token']}"})
    assert me.json()["username"] == "aziza_k"
    # tampered, foreign or stale data is refused
    assert (await client.post("/api/v1/auth/telegram-web", json={**good, "id": 778})).status_code == 401
    assert (await client.post("/api/v1/auth/telegram-web", json=widget_fields(777, int(time.time()), "9:other-token-xxxxxxxxxxxxxxxxxxxxx"))).status_code == 401
    assert (await client.post("/api/v1/auth/telegram-web", json=widget_fields(777, int(time.time()) - 200000))).status_code == 401
