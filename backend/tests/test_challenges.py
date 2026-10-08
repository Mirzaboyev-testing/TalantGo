"""Mentors add tasks and run challenges; students take part; results reach points and the CV."""
from datetime import date, timedelta

from app.models import Role
from tests.conftest import owner_headers

PROOF = {"proof_url": "https://github.com/someone/dashboard", "note": "Power BI hisobot"}


async def setup(client, make_user):
    track = (await client.get("/api/v1/tracks")).json()[0]
    mentor = await make_user("Mentor Malika", Role.mentor)
    students = [await make_user(n) for n in ("Aziza", "Bekzod", "Dilnoza")]
    for u in students:
        await client.patch("/api/v1/me", json={"track_id": track["id"]}, headers=u["headers"])
    return track, mentor, students


async def test_mentor_adds_a_task_students_see_who_set_it(client, make_user):
    track, mentor, (a, *_) = await setup(client, make_user)
    body = {"track_id": track["id"], "week": 2, "title": "Pivot jadval chellenj", "proof_hint": "Excel fayl",
            "description": "Savdo ma'lumotlaridan 3 ta pivot jadval tuzing", "points": 15}
    assert (await client.post("/api/v1/mentor/tasks", json=body, headers=a["headers"])).status_code == 403
    assert (await client.post("/api/v1/mentor/tasks", json={**body, "points": 500}, headers=mentor["headers"])).status_code == 422
    task = (await client.post("/api/v1/mentor/tasks", json=body, headers=mentor["headers"])).json()
    tasks = (await client.get(f"/api/v1/tracks/{track['id']}/tasks", headers=a["headers"])).json()
    mine = next(t for t in tasks if t["id"] == task["id"])
    assert mine["mentor"] == "Mentor Malika" and mine["kind"] == "submission"
    # a student can do it like any other task
    r = await client.post(f"/api/v1/tasks/{task['id']}/submit", json=PROOF, headers=a["headers"])
    assert r.status_code == 201
    # only its author edits it
    other = await make_user("Boshqa mentor", Role.mentor)
    assert (await client.patch(f"/api/v1/mentor/tasks/{task['id']}", json={"points": 20}, headers=other["headers"])).status_code == 404
    r = await client.patch(f"/api/v1/mentor/tasks/{task['id']}", json={"is_active": False}, headers=mentor["headers"])
    assert r.json()["is_active"] is False
    assert [t["title"] for t in (await client.get("/api/v1/mentor/tasks", headers=mentor["headers"])).json()] == ["Pivot jadval chellenj"]


async def test_challenge_from_announcement_to_winners(client, make_user):
    track, mentor, (a, b, c) = await setup(client, make_user)
    ends = (date.today() + timedelta(days=7)).isoformat()
    body = {"title": "Power BI haftaligi", "description": "Ochiq ma'lumotdan eng tushunarli dashboardni yarating",
            "track_id": track["id"], "prize": "ishGO'da amaliyot suhbati", "points": 20, "ends_on": ends}
    assert (await client.post("/api/v1/mentor/challenges", json=body, headers=a["headers"])).status_code == 403
    bad = {**body, "ends_on": (date.today() - timedelta(days=1)).isoformat()}
    assert (await client.post("/api/v1/mentor/challenges", json=bad, headers=mentor["headers"])).status_code == 422
    ch = (await client.post("/api/v1/mentor/challenges", json=body, headers=mentor["headers"])).json()
    assert ch["state"] == "active"

    listed = (await client.get("/api/v1/challenges", headers=a["headers"])).json()
    assert [x["id"] for x in listed] == [ch["id"]] and listed[0]["my_entry"] is None
    e = {}
    for u in (a, b, c):
        r = await client.post(f"/api/v1/challenges/{ch['id']}/enter", json=PROOF, headers=u["headers"])
        assert r.status_code == 201
        e[u["id"]] = r.json()["id"]
    # an entry can be improved until it is reviewed
    r = await client.post(f"/api/v1/challenges/{ch['id']}/enter", json={**PROOF, "note": "yangilandi"}, headers=a["headers"])
    assert r.json()["id"] == e[a["id"]] and r.json()["note"] == "yangilandi"

    entries = (await client.get(f"/api/v1/mentor/challenges/{ch['id']}/entries", headers=mentor["headers"])).json()
    assert len(entries) == 3
    url = f"/api/v1/mentor/challenges/{ch['id']}/entries"
    await client.post(f"{url}/{e[a['id']]}/review", json={"accept": True, "score": 95, "place": 1}, headers=mentor["headers"])
    await client.post(f"{url}/{e[b['id']]}/review", json={"accept": True, "score": 80}, headers=mentor["headers"])
    await client.post(f"{url}/{e[c['id']]}/review", json={"accept": False, "comment": "Havola ochilmaydi"}, headers=mentor["headers"])
    points = {u["id"]: (await client.get("/api/v1/me", headers=u["headers"])).json()["points"] for u in (a, b, c)}
    assert points == {a["id"]: 50, b["id"]: 20, c["id"]: 0}

    # first place moves to Bekzod: Aziza keeps the entry points, loses the bonus
    await client.post(f"{url}/{e[b['id']]}/review", json={"accept": True, "score": 97, "place": 1}, headers=mentor["headers"])
    assert (await client.get("/api/v1/me", headers=a["headers"])).json()["points"] == 20
    assert (await client.get("/api/v1/me", headers=b["headers"])).json()["points"] == 50
    assert (await client.post(f"/api/v1/challenges/{ch['id']}/enter", json=PROOF, headers=b["headers"])).status_code == 409

    detail = (await client.get(f"/api/v1/challenges/{ch['id']}", headers=c["headers"])).json()
    assert detail["results"][0] == {"student": "Bekzod", "place": 1, "score": 97}
    cv = (await client.get("/api/v1/me/cv", headers=b["headers"])).json()
    assert cv["challenges"][0]["title"] == "Power BI haftaligi" and cv["challenges"][0]["place"] == 1

    # the admin site sees and can archive it
    admin = await owner_headers(client)
    assert (await client.get("/api/v1/admin/challenges", headers=admin)).json()[0]["entries"] == 3
    await client.post(f"/api/v1/admin/challenges/{ch['id']}/archive", headers=admin)
    assert (await client.get("/api/v1/challenges", headers=a["headers"])).json() == []


async def test_other_tracks_do_not_see_a_track_challenge(client, make_user):
    track, mentor, (a, *_) = await setup(client, make_user)
    other_track = (await client.get("/api/v1/tracks")).json()[1]
    outsider = await make_user("Sardor")
    await client.patch("/api/v1/me", json={"track_id": other_track["id"]}, headers=outsider["headers"])
    ends = (date.today() + timedelta(days=3)).isoformat()
    await client.post("/api/v1/mentor/challenges", json={"title": "Faqat DA", "description": "Faqat shu yo'nalish uchun vazifa matni",
                                                         "track_id": track["id"], "ends_on": ends}, headers=mentor["headers"])
    await client.post("/api/v1/mentor/challenges", json={"title": "Hamma uchun", "description": "Barcha yo'nalishlar uchun vazifa matni",
                                                         "ends_on": ends}, headers=mentor["headers"])
    assert [x["title"] for x in (await client.get("/api/v1/challenges", headers=outsider["headers"])).json()] == ["Hamma uchun"]
    assert len((await client.get("/api/v1/challenges", headers=a["headers"])).json()) == 2
