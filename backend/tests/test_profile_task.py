"""The Start task is done inside the app: fill the profile, the system checks it and awards points."""

PROFILE = {"headline": "Iqtisodiyot talabasi | Data Analytics",
           "bio": "TDIU 2-kurs talabasiman. Ma'lumotlar tahlili va Power BI bilan ishlashni o'rganyapman.",
           "skills": ["Excel", "SQL", "Power BI"], "languages": ["Ingliz B1"], "cv_public": True}


async def starter(client, user) -> dict:
    track = (await client.get("/api/v1/tracks")).json()[0]
    await client.patch("/api/v1/me", json={"track_id": track["id"]}, headers=user["headers"])
    tasks = (await client.get(f"/api/v1/tracks/{track['id']}/tasks", headers=user["headers"])).json()
    assert tasks[0]["kind"] == "profile"
    return tasks[0]


async def test_profile_task_checks_the_profile_and_awards_points(client, make_user):
    u = await make_user("Aziza")
    task = await starter(client, u)
    r = await client.post(f"/api/v1/tasks/{task['id']}/complete-profile", headers=u["headers"])
    assert r.status_code == 422 and "sarlavha" in r.json()["detail"]
    # it cannot be submitted as a link either
    r = await client.post(f"/api/v1/tasks/{task['id']}/submit", json={"proof_url": "https://example.com/x"},
                          headers=u["headers"])
    assert r.status_code == 409

    me = (await client.patch("/api/v1/me", json=PROFILE, headers=u["headers"])).json()
    assert me["headline"] == PROFILE["headline"]
    r = await client.post(f"/api/v1/tasks/{task['id']}/complete-profile", headers=u["headers"])
    assert r.status_code == 201 and r.json()["status"] == "peer_verified" and r.json()["points_awarded"] == 5
    assert (await client.get("/api/v1/me", headers=u["headers"])).json()["points"] == 5
    assert (await client.post(f"/api/v1/tasks/{task['id']}/complete-profile", headers=u["headers"])).status_code == 409

    cv = (await client.get("/api/v1/me/cv", headers=u["headers"])).json()
    assert cv["headline"] == PROFILE["headline"]
    assert cv["achievements"][0]["verified_by"] == [{"name": "CareerFlow (avtomatik)", "kind": "system"}]


async def test_system_checked_work_is_not_in_review_queues(client, make_user):
    from app.models import Role
    a, b = await make_user("Aziza"), await make_user("Bekzod")
    mentor = await make_user("Mentor", Role.mentor)
    task = await starter(client, a)
    await starter(client, b)
    await client.patch("/api/v1/me", json=PROFILE, headers=a["headers"])
    await client.post(f"/api/v1/tasks/{task['id']}/complete-profile", headers=a["headers"])
    assert (await client.get("/api/v1/reviews/queue", headers=b["headers"])).json() == []
    assert (await client.get("/api/v1/reviews/queue", headers=mentor["headers"])).json() == []
