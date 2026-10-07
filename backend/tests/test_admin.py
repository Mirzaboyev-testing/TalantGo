from app.models import Role

PROOF = {"proof_url": "https://github.com/someone/sql-practice"}
GOOD = {"approved": True, "comment": "So'rovlar to'g'ri, JOIN yaxshi ishlatilgan"}


async def owner_headers(client) -> dict:
    token = (await client.post("/api/v1/auth/admin", json={"password": "test-admin-password"})).json()["token"]
    return {"Authorization": f"Bearer {token}"}


async def test_password_owner_and_permissions(client, make_user):
    student = await make_user("Sardor")
    assert (await client.get("/api/v1/admin/users")).status_code == 401
    assert (await client.post("/api/v1/auth/admin", json={"password": "wrong"})).status_code == 401
    assert (await client.get("/api/v1/admin/users", headers=student["headers"])).status_code == 403
    owner = await owner_headers(client)
    assert (await client.get("/api/v1/me", headers=owner)).status_code == 401
    assert (await client.get("/api/v1/admin/me", headers=owner)).json()["is_owner"] is True
    assert (await client.put("/api/v1/admin/bot", json={"token": "not-a-token"}, headers=owner)).status_code == 422


async def test_owner_appoints_admins_who_run_the_app_but_cannot_appoint_admins(client, make_user):
    owner = await owner_headers(client)
    me, helper, student = await make_user("Muhammadqodir"), await make_user("Nodira"), await make_user("Sardor")

    # the password owner marks their own Telegram account as owner: that grants admin too
    r = await client.patch(f"/api/v1/admin/users/{me['id']}", json={"is_owner": True}, headers=owner)
    assert r.json()["role"] == "admin" and r.json()["is_owner"] is True
    assert (await client.get("/api/v1/me", headers=me["headers"])).json()["is_owner"] is True

    # from inside the app the owner appoints an admin
    r = await client.patch(f"/api/v1/admin/users/{helper['id']}", json={"role": "admin"}, headers=me["headers"])
    assert r.json()["role"] == "admin"

    # that admin runs the app: mentors, tracks, users...
    h = helper["headers"]
    assert (await client.patch(f"/api/v1/admin/users/{student['id']}", json={"role": "mentor"}, headers=h)).status_code == 200
    # ...but cannot create admins, touch other admins, the bot token or the rules
    assert (await client.patch(f"/api/v1/admin/users/{student['id']}", json={"role": "admin"}, headers=h)).status_code == 403
    assert (await client.patch(f"/api/v1/admin/users/{me['id']}", json={"is_blocked": True}, headers=h)).status_code == 403
    assert (await client.put("/api/v1/admin/rules", json={"peer_approvals_required": 1}, headers=h)).status_code == 403
    assert (await client.post("/api/v1/admin/bot/connect", headers=h)).status_code == 403
    # nobody locks themselves out
    assert (await client.patch(f"/api/v1/admin/users/{me['id']}", json={"is_blocked": True},
                               headers=me["headers"])).status_code == 400

    log = (await client.get("/api/v1/admin/audit", headers=me["headers"])).json()
    assert [e["actor"] for e in log[:3]] == ["Nodira", "Muhammadqodir", "Ega (parol orqali)"]


async def test_blocked_user_is_locked_out_and_hidden(client, make_user):
    owner = await owner_headers(client)
    a, b = await make_user("Aziza"), await make_user("Bekzod")
    tracks = (await client.get("/api/v1/tracks")).json()
    for u in (a, b):
        await client.patch("/api/v1/me", json={"track_id": tracks[0]["id"], "group_name": "MM-21"}, headers=u["headers"])
    await client.patch(f"/api/v1/admin/users/{b['id']}", json={"is_blocked": True}, headers=owner)
    assert (await client.get("/api/v1/me", headers=b["headers"])).status_code == 403
    board = (await client.get("/api/v1/leaderboard", headers=a["headers"])).json()
    assert [r["full_name"] for r in board["rows"]] == ["Aziza"]
    assert (await client.get("/api/v1/peers", headers=a["headers"])).json() == []


async def test_admin_creates_track_and_tasks_and_hides_track(client, make_user):
    owner = await owner_headers(client)
    student = await make_user("Aziza")
    track = (await client.post("/api/v1/admin/tracks", json={"title": "Marketing va SMM", "icon": "📣",
                                                              "description": "Kontent va reklama"}, headers=owner)).json()
    assert track["slug"] == "marketing-va-smm"
    task = await client.post("/api/v1/admin/tasks", json={"track_id": track["id"], "week": 1, "title": "Kontent reja",
                                                           "description": "Bir oylik kontent reja tuzing", "points": 10},
                             headers=owner)
    assert task.status_code == 201
    assert any(t["slug"] == "marketing-va-smm" for t in (await client.get("/api/v1/tracks")).json())
    r = await client.patch("/api/v1/me", json={"track_id": track["id"]}, headers=student["headers"])
    assert r.status_code == 200

    await client.patch(f"/api/v1/admin/tracks/{track['id']}", json={"is_active": False}, headers=owner)
    assert all(t["id"] != track["id"] for t in (await client.get("/api/v1/tracks")).json())
    # a hidden track accepts no new work
    assert (await client.post(f"/api/v1/tasks/{task.json()['id']}/submit", json=PROOF,
                              headers=student["headers"])).status_code == 404
    admin_tracks = (await client.get("/api/v1/admin/tracks", headers=owner)).json()
    hidden = next(t for t in admin_tracks if t["id"] == track["id"])
    assert hidden["is_active"] is False and hidden["student_count"] == 1 and hidden["task_count"] == 1


async def test_rules_change_scoring_and_delete_revokes_points(client, make_user):
    owner = await owner_headers(client)
    r = await client.put("/api/v1/admin/rules", json={"peer_approvals_required": 1, "review_points": 5,
                                                      "mentor_bonus_percent": 100}, headers=owner)
    assert r.status_code == 200
    a, b = await make_user("Aziza"), await make_user("Bekzod")
    mentor = await make_user("Mentor", Role.mentor)
    track = (await client.get("/api/v1/tracks")).json()[0]
    for u in (a, b):
        await client.patch("/api/v1/me", json={"track_id": track["id"]}, headers=u["headers"])
    task = (await client.get(f"/api/v1/tracks/{track['id']}/tasks", headers=a["headers"])).json()[0]
    sub = (await client.post(f"/api/v1/tasks/{task['id']}/submit", json=PROOF, headers=a["headers"])).json()
    r = await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json=GOOD, headers=b["headers"])
    assert r.json()["status"] == "peer_verified"                     # one approval is now enough
    assert (await client.get("/api/v1/me", headers=b["headers"])).json()["points"] == 5
    await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json=GOOD, headers=mentor["headers"])
    assert (await client.get("/api/v1/me", headers=a["headers"])).json()["points"] == task["points"] * 2

    listed = (await client.get("/api/v1/admin/submissions", params={"status": "mentor_verified"}, headers=owner)).json()
    assert [s["id"] for s in listed] == [sub["id"]]
    assert (await client.delete(f"/api/v1/admin/submissions/{sub['id']}", headers=owner)).status_code == 422
    assert (await client.delete(f"/api/v1/admin/submissions/{sub['id']}", params={"reason": "boshqadan ko'chirilgan"},
                                headers=owner)).status_code == 204
    assert (await client.get("/api/v1/me", headers=a["headers"])).json()["points"] == 0


async def test_export_and_stats(client, make_user):
    owner = await owner_headers(client)
    await make_user("Aziza")
    csv = await client.get("/api/v1/admin/export/users.csv", headers=owner)
    assert csv.status_code == 200 and "Aziza" in csv.text
    stats = (await client.get("/api/v1/admin/stats", headers=owner)).json()
    assert stats["users"] == 1 and len(stats["per_track"]) == 5
