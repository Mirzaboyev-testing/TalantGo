"""Company panel audit (2026-11-19): the vacancy path from the company to students and universities."""
from datetime import date, timedelta

from app.core.db import SessionLocal
from app.models import Job, Notification
from sqlalchemy import select
from tests.conftest import owner_headers as owner
from tests.test_career import JOB
from tests.test_pipeline_and_inbox import API, applied_student, live_job, move
from tests.test_university_panel import approved_staff

TOMORROW = (date.today() + timedelta(days=30)).isoformat()


async def kinds(user_id: int) -> list[str]:
    async with SessionLocal() as session:
        return list(await session.scalars(select(Notification.kind).where(Notification.user_id == user_id)
                                          .order_by(Notification.id)))


async def test_deadline_cannot_be_in_the_past(client, make_user):
    hr, job = await live_job(client, make_user)
    past = (date.today() - timedelta(days=2)).isoformat()
    r = await client.post(f"{API}/employer/jobs", json={**JOB, "deadline": past}, headers=hr["headers"])
    assert r.status_code == 422 and "muddat" in r.json()["detail"].lower()
    r = await client.put(f"{API}/employer/jobs/{job['id']}", json={**JOB, "deadline": past}, headers=hr["headers"])
    assert r.status_code == 422


async def test_a_live_job_stays_live_when_only_the_deadline_moves(client, make_user):
    hr, job = await live_job(client, make_user)
    r = (await client.put(f"{API}/employer/jobs/{job['id']}", json={**JOB, "deadline": TOMORROW}, headers=hr["headers"])).json()
    assert r["status"] == "approved"
    assert (await client.get(f"{API}/public/jobs/{job['id']}")).status_code == 200
    # a change students would read goes back to review and the job leaves the site until then
    r = (await client.put(f"{API}/employer/jobs/{job['id']}", json={**JOB, "deadline": TOMORROW, "title": "Data analitik (yangi)"},
                          headers=hr["headers"])).json()
    assert r["status"] == "pending"
    assert (await client.get(f"{API}/public/jobs/{job['id']}")).status_code == 404


async def test_closing_tells_waiting_applicants_and_editing_reopens_through_review(client, make_user):
    hr, job = await live_job(client, make_user)
    student = await applied_student(client, make_user, job)
    assert (await client.post(f"{API}/employer/jobs/{job['id']}/close", headers=hr["headers"])).json()["status"] == "closed"
    assert "job_closed" in await kinds(student["id"])
    # the company can still decide on the applicant after closing
    assert (await move(client, hr, student["application_id"], status="hired")).status_code == 200
    reopened = (await client.put(f"{API}/employer/jobs/{job['id']}", json=JOB, headers=hr["headers"])).json()
    assert reopened["status"] == "pending"


async def test_interview_time_reaches_every_language_and_the_university_hears_of_a_hire(client, make_user):
    hr, job = await live_job(client, make_user)
    staff = await approved_staff(client, make_user)
    student = await applied_student(client, make_user, job)
    r = await move(client, hr, student["application_id"], status="interview",
                   interview_at="2099-11-25T15:00", interview_place="Amir Temur 15")
    assert r.status_code == 200
    note = (await client.get(f"{API}/me/notifications", headers=student["headers"])).json()["items"][0]
    assert note["params"]["when"] == "(25.11.2099 15:00, Amir Temur 15)"
    assert "15:00" in note["text"]
    await move(client, hr, student["application_id"], status="hired")
    assert "university_hire" in await kinds(staff["id"])


async def test_approval_note_never_reaches_students(client, make_user):
    hr, job = await live_job(client, make_user)
    await client.put(f"{API}/employer/jobs/{job['id']}", json={**JOB, "title": "Boshqa nom"}, headers=hr["headers"])
    await client.post(f"{API}/admin/jobs/{job['id']}/review", json={"approve": True, "note": "ichki izoh"}, headers=await owner(client))
    async with SessionLocal() as session:
        assert (await session.get(Job, job["id"])).review_note == ""


async def test_public_jobs_filter_by_job_field_and_carry_logo_and_fields(client, make_user):
    hr, job = await live_job(client, make_user)
    admin = await owner(client)
    smm = (await client.post(f"{API}/employer/jobs", json={**JOB, "title": "SMM stajyor", "job_fields": ["marketing"]},
                             headers=hr["headers"])).json()
    await client.post(f"{API}/admin/jobs/{smm['id']}/review", json={"approve": True}, headers=admin)
    listed = (await client.get(f"{API}/public/jobs", params={"field": "marketing"})).json()
    assert [j["title"] for j in listed["items"]] == ["SMM stajyor"]
    item = listed["items"][0]
    assert item["job_fields"] == ["marketing"] and "company_logo_url" in item


async def test_company_dashboard_does_not_count_expired_jobs_as_live(client, make_user):
    hr, job = await live_job(client, make_user)
    async with SessionLocal() as session:
        (await session.get(Job, job["id"])).deadline = date.today() - timedelta(days=1)
        await session.commit()
    d = (await client.get(f"{API}/employer/dashboard", headers=hr["headers"])).json()
    assert d["jobs"]["approved"] == 0 and d["jobs"]["expired"] == 1


async def test_applicant_card_shows_the_students_job_fields(client, make_user):
    hr, job = await live_job(client, make_user)
    student = await applied_student(client, make_user, job)
    await client.patch(f"{API}/me", json={"job_fields": ["data"]}, headers=student["headers"])
    rows = (await client.get(f"{API}/employer/jobs/{job['id']}/applicants", headers=hr["headers"])).json()
    assert rows[0]["card"]["job_fields"] == ["data"]
