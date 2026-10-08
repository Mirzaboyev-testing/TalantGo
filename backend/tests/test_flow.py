from app.models import Role

PROOF = {"proof_url": "https://github.com/someone/sql-practice", "note": "10 ta so'rov"}
GOOD = {"approved": True, "comment": "So'rovlar to'g'ri, JOIN yaxshi ishlatilgan"}
BAD = {"approved": False, "comment": "Natijalar ko'rsatilmagan, qayta yuboring"}


async def _setup(client, make_user):
    tracks = (await client.get("/api/v1/tracks")).json()
    track = next(t for t in tracks if t["slug"] == "data-analytics")
    users = {name: await make_user(name) for name in ("Aziza", "Bekzod", "Dilnoza")}
    users["Mentor"] = await make_user("Mentor", Role.mentor)
    for name in ("Aziza", "Bekzod", "Dilnoza"):
        r = await client.patch("/api/v1/me", json={"track_id": track["id"], "group_name": "MM-21",
                                                   "goals": ["Power BI", "SQL", "SQL"]}, headers=users[name]["headers"])
        assert r.status_code == 200, r.text
    tasks = (await client.get(f"/api/v1/tracks/{track['id']}/tasks", headers=users["Aziza"]["headers"])).json()
    return track, [t for t in tasks if t["kind"] == "submission"], users


async def _me(client, user):
    return (await client.get("/api/v1/me", headers=user["headers"])).json()


async def test_peer_then_mentor_verification_awards_points(client, make_user):
    track, tasks, u = await _setup(client, make_user)
    assert (await _me(client, u["Aziza"]))["goals"] == ["Power BI", "SQL"]

    sub = (await client.post(f"/api/v1/tasks/{tasks[0]['id']}/submit", json=PROOF, headers=u["Aziza"]["headers"])).json()
    assert sub["status"] == "pending"
    assert (await client.post(f"/api/v1/tasks/{tasks[0]['id']}/submit", json=PROOF,
                              headers=u["Aziza"]["headers"])).status_code == 409

    # nobody can review their own work, and a peer reviews once
    assert (await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json=GOOD,
                              headers=u["Aziza"]["headers"])).status_code == 403
    queue = (await client.get("/api/v1/reviews/queue", headers=u["Bekzod"]["headers"])).json()
    assert [q["submission_id"] for q in queue] == [sub["id"]]
    r = await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json=GOOD, headers=u["Bekzod"]["headers"])
    assert r.json()["status"] == "pending"
    assert (await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json=GOOD,
                              headers=u["Bekzod"]["headers"])).status_code == 409
    assert (await client.get("/api/v1/reviews/queue", headers=u["Bekzod"]["headers"])).json() == []

    r = await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json=GOOD, headers=u["Dilnoza"]["headers"])
    assert r.json()["status"] == "peer_verified"
    task_points = tasks[0]["points"]
    assert (await _me(client, u["Aziza"]))["points"] == task_points
    assert (await _me(client, u["Bekzod"]))["points"] == 2

    r = await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json=GOOD, headers=u["Mentor"]["headers"])
    assert r.json()["status"] == "mentor_verified"
    assert (await _me(client, u["Aziza"]))["points"] == task_points + task_points // 2

    cv = (await client.get("/api/v1/me/cv", headers=u["Aziza"]["headers"])).json()
    assert cv["stats"]["verified_tasks"] == 1 and cv["stats"]["mentor_verified"] == 1
    assert {v["name"] for v in cv["achievements"][0]["verified_by"]} == {"Bekzod", "Dilnoza", "Mentor"}


async def test_mentor_rejection_revokes_points_and_allows_resubmission(client, make_user):
    track, tasks, u = await _setup(client, make_user)
    sub = (await client.post(f"/api/v1/tasks/{tasks[1]['id']}/submit", json=PROOF, headers=u["Aziza"]["headers"])).json()
    for name in ("Bekzod", "Dilnoza"):
        await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json=GOOD, headers=u[name]["headers"])
    assert (await _me(client, u["Aziza"]))["points"] == tasks[1]["points"]

    r = await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json=BAD, headers=u["Mentor"]["headers"])
    assert r.json()["status"] == "rejected"
    assert (await _me(client, u["Aziza"]))["points"] == 0

    again = (await client.post(f"/api/v1/tasks/{tasks[1]['id']}/submit", json=PROOF, headers=u["Aziza"]["headers"])).json()
    assert again["status"] == "pending" and again["round"] == 2 and again["reviews"] == []
    # the same peers can review the new round
    queue = (await client.get("/api/v1/reviews/queue", headers=u["Bekzod"]["headers"])).json()
    assert [q["submission_id"] for q in queue] == [sub["id"]]


async def test_two_peer_rejections_reject(client, make_user):
    track, tasks, u = await _setup(client, make_user)
    sub = (await client.post(f"/api/v1/tasks/{tasks[0]['id']}/submit", json=PROOF, headers=u["Aziza"]["headers"])).json()
    for name in ("Bekzod", "Dilnoza"):
        r = await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json=BAD, headers=u[name]["headers"])
    assert r.json()["status"] == "rejected"
    assert (await _me(client, u["Aziza"]))["points"] == 0


async def test_validation_and_access_rules(client, make_user):
    track, tasks, u = await _setup(client, make_user)
    h = u["Aziza"]["headers"]
    assert (await client.post(f"/api/v1/tasks/{tasks[0]['id']}/submit", json={"proof_url": "not a link at all"},
                              headers=h)).status_code == 422
    other_track = next(t for t in (await client.get("/api/v1/tracks")).json() if t["id"] != track["id"])
    other_tasks = [t for t in (await client.get(f"/api/v1/tracks/{other_track['id']}/tasks", headers=h)).json()
                   if t["kind"] == "submission"]
    assert (await client.post(f"/api/v1/tasks/{other_tasks[0]['id']}/submit", json=PROOF, headers=h)).status_code == 403
    sub = (await client.post(f"/api/v1/tasks/{tasks[0]['id']}/submit", json=PROOF, headers=h)).json()
    assert (await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json={"approved": True, "comment": "ok"},
                              headers=u["Bekzod"]["headers"])).status_code == 422
    assert (await client.get("/api/v1/me")).status_code == 401


async def test_cv_is_private_until_published(client, make_user):
    track, tasks, u = await _setup(client, make_user)
    me = await _me(client, u["Aziza"])
    assert (await client.get(f"/api/v1/cv/{me['cv_slug']}")).status_code == 404
    assert (await client.get(f"/cv/{me['cv_slug']}")).status_code == 404
    await client.patch("/api/v1/me", json={"cv_public": True, "bio": "Iqtisodchi, data analitikaga qiziqaman"},
                       headers=u["Aziza"]["headers"])
    page = await client.get(f"/cv/{me['cv_slug']}")
    assert page.status_code == 200 and "Aziza" in page.text and "Iqtisodchi" in page.text


async def test_peers_and_leaderboard(client, make_user):
    track, tasks, u = await _setup(client, make_user)
    sub = (await client.post(f"/api/v1/tasks/{tasks[0]['id']}/submit", json=PROOF, headers=u["Aziza"]["headers"])).json()
    for name in ("Bekzod", "Dilnoza"):
        await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json=GOOD, headers=u[name]["headers"])

    peers = (await client.get("/api/v1/peers", headers=u["Bekzod"]["headers"])).json()
    assert [p["full_name"] for p in peers] == ["Aziza", "Dilnoza"]
    assert peers[0]["verified_tasks"] == 1
    by_goal = (await client.get("/api/v1/peers", params={"goal": "Power BI"}, headers=u["Mentor"]["headers"])).json()
    assert len(by_goal) == 3

    board = (await client.get("/api/v1/leaderboard", params={"scope": "group"}, headers=u["Bekzod"]["headers"])).json()
    assert [(r["full_name"], r["rank"]) for r in board["rows"]] == [("Aziza", 1), ("Bekzod", 2), ("Dilnoza", 2)]
    assert board["my_rank"] == 2
