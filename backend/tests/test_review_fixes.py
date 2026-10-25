"""Fixes from the security review of the three-panel branch."""
from datetime import date, timedelta

from app.models import Role
from tests.test_career import make_student, uni_id
from tests.test_company_tasks import TASK, ends
from tests.test_pipeline_and_inbox import API, applied_student, live_job, move
from tests.test_university_panel import approved_staff, graduates


async def test_withdrawing_takes_contact_details_back(client, make_user):
    hr, job = await live_job(client, make_user)
    student = await applied_student(client, make_user, job)
    await client.patch(f"{API}/me", json={"phone": "+998901112233"}, headers=student["headers"])
    detail = (await client.get(f"{API}/employer/students/{student['id']}", headers=hr["headers"])).json()
    assert detail["phone"] == "+998901112233"

    await client.post(f"{API}/me/applications/{student['application_id']}/withdraw", headers=student["headers"])
    detail = (await client.get(f"{API}/employer/students/{student['id']}", headers=hr["headers"])).json()
    assert detail["phone"] is None and detail["username"] is None
    row = (await client.get(f"{API}/employer/applications", headers=hr["headers"])).json()["items"][0]
    assert row["status"] == "withdrawn" and row["identity"]["phone"] is None and row["identity"]["username"] is None
    # hidden from companies and withdrawn: the company cannot open the profile any more
    await client.patch(f"{API}/me", json={"visible_to_employers": False}, headers=student["headers"])
    assert (await client.get(f"{API}/employer/students/{student['id']}", headers=hr["headers"])).status_code == 404


async def test_company_tasks_limits(client, make_user):
    hr, _ = await live_job(client, make_user)
    student = await make_student(client, make_user, "Aziza")
    tasks = []
    for i in range(2):
        r = await client.post(f"{API}/employer/tasks", json={**TASK, "title": f"Vazifa {i}", "points": 50, "ends_on": ends()},
                              headers=hr["headers"])
        assert r.status_code == 201
        tasks.append(r.json())
    # a third broad task the same day is refused; a task for picked students is still fine
    assert (await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": ends()}, headers=hr["headers"])).status_code == 429
    picked = await client.post(f"{API}/employer/tasks", json={**TASK, "title": "Shaxsiy", "points": 50, "ends_on": ends(),
                                                             "audience": "selected", "student_ids": [student["id"]]}, headers=hr["headers"])
    assert picked.status_code == 201
    tasks.append(picked.json())

    awarded = []
    for task in tasks:
        await client.post(f"{API}/challenges/{task['id']}/enter", json={"proof_url": f"https://github.com/aziza/t{task['id']}"},
                          headers=student["headers"])
        entry = (await client.get(f"{API}/employer/tasks/{task['id']}/entries", headers=hr["headers"])).json()[0]
        assert entry["username"] is None                       # entering a task does not share Telegram
        r = await client.post(f"{API}/employer/tasks/{task['id']}/entries/{entry['id']}/review",
                              json={"accept": True, "place": 1, "comment": ""}, headers=hr["headers"])
        awarded.append(r.json()["points_awarded"])
    # 80 + 20 + 0: one company gives one student at most 100 points in 30 days
    assert awarded == [80, 20, 0]
    assert (await client.get(f"{API}/me", headers=student["headers"])).json()["points"] == 100
    too_long = (date.today() + timedelta(days=400)).isoformat()
    assert (await client.patch(f"{API}/employer/tasks/{tasks[0]['id']}", json={"ends_on": too_long},
                               headers=hr["headers"])).status_code == 422


async def test_leaderboard_is_for_students_and_interviews_cannot_be_in_the_past(client, make_user):
    hr, job = await live_job(client, make_user)
    assert (await client.get(f"{API}/leaderboard", headers=hr["headers"])).status_code == 403
    student = await applied_student(client, make_user, job)
    assert (await client.get(f"{API}/leaderboard", headers=student["headers"])).status_code == 200
    r = await move(client, hr, student["application_id"], status="interview", interview_at="2020-01-01T10:00:00")
    assert r.status_code == 422


async def test_universities_see_only_current_students_and_public_pages_hide_small_counts(client, make_user):
    staff = await approved_staff(client, make_user)
    student = await make_student(client, make_user, "Aziza")
    await client.post(f"{API}/me/outcomes", json={"company_name": "Uzum", "kind": "internship"}, headers=student["headers"])
    assert len((await client.get(f"{API}/university/outcomes", headers=staff["headers"])).json()) == 1
    await client.patch(f"{API}/me", json={"university_id": await uni_id("WIUT")}, headers=student["headers"])
    assert (await client.get(f"{API}/university/outcomes", headers=staff["headers"])).json() == []

    await graduates("TATU", 3)
    profile = (await client.get(f"{API}/public/universities/{await uni_id('TATU')}")).json()
    assert profile["students"] == 3 and profile["placed"] is None and profile["employed"] is None
    rows = {r["short_name"]: r for r in (await client.get(f"{API}/public/ranking")).json()["live"]["rows"]}
    assert rows["TATU"]["employed"] is None and rows["TATU"]["score"] is None


async def test_role_check_uses_the_route_template(client, make_user):
    from tests.test_ranking_and_admin import staff_account
    analyst = await staff_account(client, "analyst", "data@talantgo.uz")
    # a trailing slash or a different spelling of the path does not open a write for a read-only role
    assert (await client.post(f"{API}/admin/ranking/publish/", json={"period": "x davr"}, headers=analyst)).status_code in (403, 404, 405, 307)
    assert (await client.post(f"{API}/admin/ranking/publish", json={"period": "x davr"}, headers=analyst)).status_code == 403
    mentor = await make_user("Mentor", Role.mentor)
    assert (await client.get(f"{API}/admin/ranking", headers=mentor["headers"])).status_code == 401
