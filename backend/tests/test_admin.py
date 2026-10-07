from app.models import Role

PROOF = {"proof_url": "https://github.com/someone/sql-practice"}
GOOD = {"approved": True, "comment": "So'rovlar to'g'ri, JOIN yaxshi ishlatilgan"}


from tests.conftest import OWNER, owner_headers


async def register(client, name, email, password="parol-1234567", code=None):
    return await client.post("/api/v1/admin-auth/register",
                             json={"name": name, "email": email, "password": password, "setup_code": code})


async def login(client, email, password="parol-1234567"):
    return await client.post("/api/v1/admin-auth/login", json={"email": email, "password": password})


async def test_first_account_needs_the_setup_code_and_becomes_owner(client, make_user):
    assert (await client.get("/api/v1/admin-auth/status")).json() == {"needs_owner": True}
    assert (await register(client, "Xurshid", "x@mail.uz")).status_code == 403
    assert (await register(client, "Xurshid", "x@mail.uz", code="wrong")).status_code == 403
    assert (await register(client, "Xurshid", "not-an-email", code="test-admin-password")).status_code == 422
    r = await register(client, "Ega", "Ega@Gmail.com", code="test-admin-password")
    assert r.status_code == 200 and r.json()["status"] == "active"
    me = (await client.get("/api/v1/admin-auth/me", headers={"Authorization": f"Bearer {r.json()['token']}"})).json()
    assert me["email"] == "ega@gmail.com" and me["is_owner"] is True
    assert (await client.get("/api/v1/admin-auth/status")).json() == {"needs_owner": False}
    assert (await register(client, "Ega2", "ega@gmail.com")).status_code == 409

    # Telegram users never reach the admin API, whatever their role
    student = await make_user("Sardor")
    assert (await client.get("/api/v1/admin/users", headers=student["headers"])).status_code == 401
    assert (await client.get("/api/v1/admin/users")).status_code == 401


async def test_new_admins_wait_for_the_owner_and_cannot_manage_owners_things(client, make_user):
    owner = await owner_headers(client)
    assert (await register(client, "Nodira", "nodira@gmail.com")).json() == {"status": "pending"}
    assert (await login(client, "nodira@gmail.com")).status_code == 403
    assert (await login(client, "nodira@gmail.com", "wrong-password")).status_code == 401

    accounts = (await client.get("/api/v1/admin/accounts", headers=owner)).json()
    nodira = next(a for a in accounts if a["email"] == "nodira@gmail.com")
    assert nodira["status"] == "pending"
    await client.patch(f"/api/v1/admin/accounts/{nodira['id']}", json={"status": "active"}, headers=owner)
    h = {"Authorization": f"Bearer {(await login(client, 'nodira@gmail.com')).json()['token']}"}

    # an admin runs the app: mentors, tracks, moderation...
    student = await make_user("Sardor")
    r = await client.patch(f"/api/v1/admin/users/{student['id']}", json={"role": "mentor"}, headers=h)
    assert r.status_code == 200 and r.json()["role"] == "mentor"
    assert (await client.patch(f"/api/v1/admin/users/{student['id']}", json={"role": "admin"}, headers=h)).status_code == 422
    # ...but owners' things stay with owners
    assert (await client.get("/api/v1/admin/accounts", headers=h)).status_code == 403
    assert (await client.put("/api/v1/admin/rules", json={"peer_approvals_required": 1}, headers=h)).status_code == 403
    assert (await client.post("/api/v1/admin/bot/connect", headers=h)).status_code == 403

    # the last owner cannot step down
    me = (await client.get("/api/v1/admin-auth/me", headers=owner)).json()
    r = await client.patch(f"/api/v1/admin/accounts/{me['id']}", json={"status": "disabled"}, headers=owner)
    assert r.status_code == 400

    # disabling an admin ends their session at once
    await client.patch(f"/api/v1/admin/accounts/{nodira['id']}", json={"status": "disabled"}, headers=owner)
    assert (await client.get("/api/v1/admin/stats", headers=h)).status_code == 401

    log = (await client.get("/api/v1/admin/audit", headers=owner)).json()
    assert any(e["action"] == "user.update" and "nodira@gmail.com" in e["actor"] for e in log)


async def test_password_change_and_reset_end_old_sessions(client):
    owner = await owner_headers(client)
    other_tab = await owner_headers(client)
    r = await client.put("/api/v1/admin-auth/password", json={"current_password": "wrong", "new_password": "yangi-parol-123"},
                         headers=owner)
    assert r.status_code == 400
    r = await client.put("/api/v1/admin-auth/password",
                         json={"current_password": OWNER["password"], "new_password": "yangi-parol-123"}, headers=owner)
    fresh = {"Authorization": f"Bearer {r.json()['token']}"}
    assert (await client.get("/api/v1/admin-auth/me", headers=other_tab)).status_code == 401
    assert (await client.get("/api/v1/admin-auth/me", headers=fresh)).status_code == 200
    assert (await login(client, OWNER["email"], "yangi-parol-123")).status_code == 200

    await register(client, "Bekzod", "bekzod@gmail.com")
    bekzod = next(a for a in (await client.get("/api/v1/admin/accounts", headers=fresh)).json() if a["email"] == "bekzod@gmail.com")
    await client.patch(f"/api/v1/admin/accounts/{bekzod['id']}", json={"status": "active"}, headers=fresh)
    temporary = (await client.post(f"/api/v1/admin/accounts/{bekzod['id']}/reset-password", headers=fresh)).json()["temporary_password"]
    assert (await login(client, "bekzod@gmail.com")).status_code == 401
    assert (await login(client, "bekzod@gmail.com", temporary)).status_code == 200


async def test_dashboard_and_applications(client, make_user):
    owner = await owner_headers(client)
    await make_user("Aziza")
    d = (await client.get("/api/v1/admin/dashboard", headers=owner)).json()
    assert d["kpis"]["students"] == 1 and d["kpis"]["new_students"] == 1
    assert len(d["series"]["dates"]) == 30 and sum(d["series"]["registrations"]) == 1
    assert set(d["applications"]) == {"new", "viewed", "shortlisted", "hired", "rejected"}
    assert (await client.get("/api/v1/admin/dashboard", params={"from": "2026-10-10", "to": "2026-10-01"},
                             headers=owner)).status_code == 422
    assert (await client.get("/api/v1/admin/applications", headers=owner)).json() == []


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
    task = next(t for t in (await client.get(f"/api/v1/tracks/{track['id']}/tasks", headers=a["headers"])).json()
                if t["kind"] == "submission")
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
