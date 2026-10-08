"""Admin password change, phone numbers and what the community list shows."""

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import University
from app.services import settings_store, telegram_bot

BOT_TOKEN = "123456:TEST-token-for-unit-tests-only-abcdefghij"


async def test_phone_typed_by_hand_is_unverified_and_hidden_by_default(client, make_user):
    a, b = await make_user("Aziza"), await make_user("Bekzod")
    track = (await client.get("/api/v1/tracks")).json()[0]
    async with SessionLocal() as s:
        tdiu = (await s.execute(select(University.id).where(University.short_name == "TDIU"))).scalar_one()
    for u in (a, b):
        await client.patch("/api/v1/me", json={"track_id": track["id"], "university_id": tdiu, "course": 2,
                                               "faculty": "Iqtisodiyot"}, headers=u["headers"])
    assert (await client.patch("/api/v1/me", json={"phone": "901234567"}, headers=a["headers"])).status_code == 422
    me = (await client.patch("/api/v1/me", json={"phone": "+998901234567"}, headers=a["headers"])).json()
    assert me["phone"] == "+998901234567" and me["phone_verified"] is False and me["show_phone"] is False

    peers = (await client.get("/api/v1/peers", headers=b["headers"])).json()
    assert peers[0]["phone"] is None
    assert peers[0]["university"] == "TDIU" and peers[0]["course"] == 2 and peers[0]["faculty"] == "Iqtisodiyot"

    await client.patch("/api/v1/me", json={"show_phone": True}, headers=a["headers"])
    assert (await client.get("/api/v1/peers", headers=b["headers"])).json()[0]["phone"] == "+998901234567"

    board = (await client.get("/api/v1/leaderboard", params={"scope": "university"}, headers=b["headers"])).json()
    assert {r["university"] for r in board["rows"]} == {"TDIU"}


async def test_phone_shared_through_telegram_is_verified(client, make_user):
    u = await make_user("Sardor", telegram_id=555001)
    async with SessionLocal() as s:
        await settings_store.set_value(s, settings_store.BOT_TOKEN, BOT_TOKEN)
    update = {"message": {"from": {"id": 555001}, "chat": {"id": 555001, "type": "private"},
                          "contact": {"user_id": 555001, "phone_number": "998935550011"}}}
    headers = {"X-Telegram-Bot-Api-Secret-Token": telegram_bot.webhook_secret(BOT_TOKEN)}
    assert (await client.post("/telegram/webhook", json=update, headers=headers)).status_code == 200
    me = (await client.get("/api/v1/me", headers=u["headers"])).json()
    assert me["phone"] == "+998935550011" and me["phone_verified"] is True

    # someone else's contact card is ignored
    forged = {"message": {"from": {"id": 555001}, "chat": {"id": 555001, "type": "private"},
                          "contact": {"user_id": 999, "phone_number": "998900000000"}}}
    await client.post("/telegram/webhook", json=forged, headers=headers)
    assert (await client.get("/api/v1/me", headers=u["headers"])).json()["phone"] == "+998935550011"



async def test_links_are_optional_and_accepted_without_https(client, make_user):
    u = await make_user("Aziza")
    me = (await client.patch("/api/v1/me", json={"github_url": "github.com/aziza", "linkedin_url": ""},
                              headers=u["headers"])).json()
    assert me["github_url"] == "https://github.com/aziza" and me["linkedin_url"] == ""
    assert (await client.patch("/api/v1/me", json={"github_url": "aziza"}, headers=u["headers"])).status_code == 422


async def test_verification_request_does_not_need_a_student_number(client, make_user):
    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.models import University
    from tests.conftest import owner_headers

    u = await make_user("Aziza")
    async with SessionLocal() as s:
        uni = (await s.execute(select(University.id).where(University.short_name == "TDIU"))).scalar_one()
    await client.patch("/api/v1/me", json={"consent": True, "university_id": uni, "faculty": "Iqtisodiyot", "course": 2},
                       headers=u["headers"])
    r = await client.post("/api/v1/me/verification", headers=u["headers"])
    assert r.status_code == 200 and r.json()["verification"] == "pending"
    queue = (await client.get("/api/v1/admin/verifications", headers=await owner_headers(client))).json()
    assert [q["full_name"] for q in queue] == ["Aziza"]
