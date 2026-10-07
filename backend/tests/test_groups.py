"""In-app groups: official community and track groups, private invite-only groups, chat and moderation."""
from tests.conftest import owner_headers


async def on_track(client, user, index=0) -> dict:
    track = (await client.get("/api/v1/tracks")).json()[index]
    await client.patch("/api/v1/me", json={"track_id": track["id"]}, headers=user["headers"])
    return track


async def test_everyone_is_in_the_community_and_their_track_group(client, make_user):
    a = await make_user("Aziza")
    track = await on_track(client, a)
    groups = (await client.get("/api/v1/groups", headers=a["headers"])).json()
    names = [g["name"] for g in groups["mine"]]
    assert names[0] == "CareerFlow hamjamiyati"
    assert any(track["title"].split(":")[0] in n for n in names)
    # other tracks' groups are open to join, not forced
    assert len(groups["discover"]) == 4
    other = groups["discover"][0]
    r = await client.post(f"/api/v1/groups/{other['id']}/join", headers=a["headers"])
    assert r.status_code == 200 and r.json()["my_role"] == "member"


async def test_private_group_is_invisible_until_joined_with_the_code(client, make_user):
    owner, friend, stranger = await make_user("Aziza"), await make_user("Bekzod"), await make_user("Sardor")
    g = (await client.post("/api/v1/groups", json={"name": "SQL o'rganamiz", "description": "Haftalik"},
                           headers=owner["headers"])).json()
    assert g["is_private"] and g["my_role"] == "owner"

    def visible(groups):
        return [x["id"] for x in groups["mine"] + groups["discover"]]
    assert g["id"] not in visible((await client.get("/api/v1/groups", headers=stranger["headers"])).json())
    assert (await client.get(f"/api/v1/groups/{g['id']}", headers=stranger["headers"])).status_code == 404
    assert (await client.get(f"/api/v1/groups/{g['id']}/messages", headers=stranger["headers"])).status_code == 404
    assert (await client.post(f"/api/v1/groups/{g['id']}/join", headers=stranger["headers"])).status_code == 404

    code = (await client.get(f"/api/v1/groups/{g['id']}", headers=owner["headers"])).json()["invite_code"]
    assert (await client.post("/api/v1/groups/join", json={"code": "wrong-code"}, headers=friend["headers"])).status_code == 404
    assert (await client.post("/api/v1/groups/join", json={"code": code}, headers=friend["headers"])).status_code == 200

    # chat, unread counts and read marks
    m = (await client.post(f"/api/v1/groups/{g['id']}/messages", json={"text": "Salom! Bugun JOIN"}, headers=owner["headers"])).json()
    assert m["mine"] is True
    assert (await client.get("/api/v1/groups/unread", headers=friend["headers"])).json()["unread"] == 1
    msgs = (await client.get(f"/api/v1/groups/{g['id']}/messages", headers=friend["headers"])).json()
    assert [x["text"] for x in msgs] == ["Salom! Bugun JOIN"] and msgs[0]["author"] == "Aziza"
    assert (await client.get("/api/v1/groups/unread", headers=friend["headers"])).json()["unread"] == 0
    newer = (await client.get(f"/api/v1/groups/{g['id']}/messages", params={"after": m["id"]}, headers=friend["headers"])).json()
    assert newer == []

    # only the author or the group owner deletes a message; only the owner removes members
    assert (await client.delete(f"/api/v1/groups/{g['id']}/messages/{m['id']}", headers=friend["headers"])).status_code == 403
    assert (await client.delete(f"/api/v1/groups/{g['id']}/members/{owner['id']}", headers=friend["headers"])).status_code == 403
    assert (await client.delete(f"/api/v1/groups/{g['id']}/members/{friend['id']}", headers=owner["headers"])).status_code == 204
    assert (await client.get(f"/api/v1/groups/{g['id']}/messages", headers=friend["headers"])).status_code == 404

    # a new invite code locks out the old link
    old = code
    await client.post(f"/api/v1/groups/{g['id']}/invite/reset", headers=owner["headers"])
    assert (await client.post("/api/v1/groups/join", json={"code": old}, headers=stranger["headers"])).status_code == 404

    # deleting archives the group for everyone
    assert (await client.delete(f"/api/v1/groups/{g['id']}", headers=owner["headers"])).status_code == 204
    assert (await client.get(f"/api/v1/groups/{g['id']}", headers=owner["headers"])).status_code == 404


async def test_official_groups_cannot_be_left_or_deleted_and_messages_are_limited(client, make_user):
    a = await make_user("Aziza")
    community = (await client.get("/api/v1/groups", headers=a["headers"])).json()["mine"][0]
    assert (await client.post(f"/api/v1/groups/{community['id']}/leave", headers=a["headers"])).status_code == 409
    assert (await client.delete(f"/api/v1/groups/{community['id']}", headers=a["headers"])).status_code == 403
    assert (await client.post(f"/api/v1/groups/{community['id']}/messages", json={"text": "  "}, headers=a["headers"])).status_code == 422
    for i in range(20):
        await client.post(f"/api/v1/groups/{community['id']}/messages", json={"text": f"xabar {i}"}, headers=a["headers"])
    r = await client.post(f"/api/v1/groups/{community['id']}/messages", json={"text": "yana"}, headers=a["headers"])
    assert r.status_code == 429


async def test_admin_sees_groups_but_not_private_messages(client, make_user):
    admin = await owner_headers(client)
    a = await make_user("Aziza")
    await client.get("/api/v1/groups", headers=a["headers"])
    private = (await client.post("/api/v1/groups", json={"name": "Yopiq"}, headers=a["headers"])).json()
    await client.post(f"/api/v1/groups/{private['id']}/messages", json={"text": "sir"}, headers=a["headers"])
    community = (await client.get("/api/v1/groups", headers=a["headers"])).json()["mine"][0]
    msg = (await client.post(f"/api/v1/groups/{community['id']}/messages", json={"text": "spam"}, headers=a["headers"])).json()

    groups = (await client.get("/api/v1/admin/groups", headers=admin)).json()
    assert any(g["id"] == private["id"] and g["messages"] == 1 for g in groups)
    assert (await client.get(f"/api/v1/admin/groups/{private['id']}/messages", headers=admin)).status_code == 403
    assert (await client.get(f"/api/v1/admin/groups/{community['id']}/messages", headers=admin)).json()[0]["text"] == "spam"
    assert (await client.delete(f"/api/v1/admin/group-messages/{msg['id']}", headers=admin)).status_code == 204
    shown = (await client.get(f"/api/v1/groups/{community['id']}/messages", headers=a["headers"])).json()
    assert shown[-1]["deleted"] is True and shown[-1]["text"] is None

    r = await client.post(f"/api/v1/admin/groups/{private['id']}/archive", headers=admin)
    assert r.json()["is_archived"] is True
    assert (await client.get(f"/api/v1/groups/{private['id']}", headers=a["headers"])).status_code == 404


async def test_group_invite_link_opens_the_join_prompt(client, monkeypatch, make_user):
    from app.core.db import SessionLocal
    from app.services import settings_store, telegram_bot
    sent = []

    async def fake_welcome(token, chat_id, public_url, role=None, join=None):
        sent.append((chat_id, role, join))
    monkeypatch.setattr(telegram_bot, "send_welcome", fake_welcome)
    token = "123456:TEST-token-for-unit-tests-only-abcdefghij"
    async with SessionLocal() as s:
        await settings_store.set_value(s, settings_store.BOT_TOKEN, token)
    update = {"message": {"from": {"id": 900001, "first_name": "N"}, "chat": {"id": 900001, "type": "private"},
                          "text": "/start gAbCdEfGh12"}}
    await client.post("/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": telegram_bot.webhook_secret(token)})
    assert sent == [(900001, None, "AbCdEfGh12")]


async def test_people_join_the_community_when_they_sign_in(client, make_user):
    a, b = await make_user("Aziza"), await make_user("Bekzod")
    await client.get("/api/v1/me", headers=b["headers"])            # Bekzod never opens Groups
    community = (await client.get("/api/v1/groups", headers=a["headers"])).json()["mine"][0]
    assert community["members"] == 2
    track = await on_track(client, b, 1)                              # a new path joins that path's group
    mine = (await client.get("/api/v1/groups", headers=b["headers"])).json()["mine"]
    assert any(track["title"].split(":")[0] in g["name"] for g in mine)
