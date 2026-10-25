"""Companies give students tasks: audiences, entries, scoring, points and the CV."""
from datetime import date, timedelta

from app.models import Role
from tests.test_career import make_student, uni_id
from tests.test_pipeline_and_inbox import API, live_job

TASK = {"title": "Savdo ma'lumotlari tahlili", "description": "Berilgan CSV bo'yicha Power BI hisobot tayyorlang va xulosa yozing",
        "prize": "Amaliyotga taklif", "points": 20}


def ends(days=7) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


async def test_company_task_from_creation_to_cv(client, make_user):
    hr, _ = await live_job(client, make_user)
    student = await make_student(client, make_user, "Aziza")
    r = await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": ends()}, headers=hr["headers"])
    assert r.status_code == 201, r.text
    task = r.json()
    assert task["company"] == "Data Solutions MChJ" and task["audience"] == "all" and task["mentor"] is None

    notes = (await client.get(f"{API}/me/notifications", headers=student["headers"])).json()["items"]
    assert notes[0]["kind"] == "company_task_new" and notes[0]["params"]["company"] == "Data Solutions MChJ"
    seen = (await client.get(f"{API}/challenges", headers=student["headers"])).json()
    assert [c["company"] for c in seen] == ["Data Solutions MChJ"]

    r = await client.post(f"{API}/challenges/{task['id']}/enter", json={"proof_url": "https://github.com/aziza/sales-report"},
                          headers=student["headers"])
    assert r.status_code == 201, r.text
    entries = (await client.get(f"{API}/employer/tasks/{task['id']}/entries", headers=hr["headers"])).json()
    assert entries[0]["student"] == "Aziza"
    r = await client.post(f"{API}/employer/tasks/{task['id']}/entries/{entries[0]['id']}/review",
                          json={"accept": True, "score": 92, "place": 1, "comment": "Zo'r xulosa"}, headers=hr["headers"])
    assert r.status_code == 200 and r.json()["points_awarded"] == 20 + 30
    me = (await client.get(f"{API}/me", headers=student["headers"])).json()
    assert me["points"] == 50
    result = (await client.get(f"{API}/me/notifications", headers=student["headers"])).json()["items"][0]
    assert result["kind"] == "challenge_result" and "Data Solutions MChJ" in result["text"]
    cv = (await client.get(f"{API}/me/cv", headers=student["headers"])).json()
    assert cv["challenges"][0]["company"] == "Data Solutions MChJ" and cv["challenges"][0]["place"] == 1

    listed = (await client.get(f"{API}/employer/tasks", headers=hr["headers"])).json()
    assert listed[0]["entries"] == 1 and listed[0]["to_review"] == 0
    # the company closes it; it disappears for students only after 30 days, archived at once
    await client.patch(f"{API}/employer/tasks/{task['id']}", json={"is_archived": True}, headers=hr["headers"])
    assert (await client.get(f"{API}/challenges", headers=student["headers"])).json() == []


async def test_task_audiences_and_isolation(client, make_user):
    hr, _ = await live_job(client, make_user)
    tdiu_student = await make_student(client, make_user, "TDIU talaba")          # make_student uses TDIU
    other = await make_student(client, make_user, "Boshqa talaba")
    await client.patch(f"{API}/me", json={"university_id": await uni_id("WIUT")}, headers=other["headers"])

    uni_task = (await client.post(f"{API}/employer/tasks", json={
        **TASK, "ends_on": ends(), "audience": "university", "university_id": await uni_id("TDIU")}, headers=hr["headers"])).json()
    assert [c["id"] for c in (await client.get(f"{API}/challenges", headers=tdiu_student["headers"])).json()] == [uni_task["id"]]
    assert (await client.get(f"{API}/challenges", headers=other["headers"])).json() == []
    assert (await client.get(f"{API}/challenges/{uni_task['id']}", headers=other["headers"])).status_code == 404
    assert (await client.post(f"{API}/challenges/{uni_task['id']}/enter", json={"proof_url": "https://github.com/x/y"},
                              headers=other["headers"])).status_code == 404

    picked = (await client.post(f"{API}/employer/tasks", json={
        **TASK, "title": "Shaxsiy vazifa", "ends_on": ends(), "audience": "selected", "student_ids": [other["id"]]},
        headers=hr["headers"])).json()
    assert picked["invited"] == 1
    assert [c["id"] for c in (await client.get(f"{API}/challenges", headers=other["headers"])).json()] == [picked["id"]]
    assert picked["id"] not in [c["id"] for c in (await client.get(f"{API}/challenges", headers=tdiu_student["headers"])).json()]

    # a student hidden from companies cannot be picked by name
    await client.patch(f"{API}/me", json={"visible_to_employers": False}, headers=tdiu_student["headers"])
    r = await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": ends(), "audience": "selected",
                                                        "student_ids": [tdiu_student["id"]]}, headers=hr["headers"])
    assert r.status_code == 404

    # limits and ownership
    assert (await client.post(f"{API}/employer/tasks", json={**TASK, "points": 60, "ends_on": ends()},
                              headers=hr["headers"])).status_code == 422
    assert (await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": ends(), "audience": "track"},
                              headers=hr["headers"])).status_code == 422
    rival, _ = await live_job(client, make_user, stir="309876543", name="HR Boshqa")
    assert (await client.get(f"{API}/employer/tasks/{uni_task['id']}/entries", headers=rival["headers"])).status_code == 404
    assert (await client.patch(f"{API}/employer/tasks/{uni_task['id']}", json={"is_archived": True},
                               headers=rival["headers"])).status_code == 404
    mentor = await make_user("Mentor", Role.mentor)
    assert (await client.patch(f"{API}/mentor/challenges/{uni_task['id']}", json={"is_archived": True},
                               headers=mentor["headers"])).status_code == 404
    assert (await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": ends()},
                              headers=tdiu_student["headers"])).status_code == 403
