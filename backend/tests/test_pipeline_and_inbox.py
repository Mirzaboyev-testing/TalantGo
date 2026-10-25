"""Three-panel foundations: the application pipeline, the in-app inbox and the privacy/abuse fixes."""
from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import ApplicationEvent, Role, University
from tests.conftest import owner_headers as owner
from tests.test_admin import login, register
from tests.test_career import JOB, make_employer, make_student

API = "/api/v1"


async def live_job(client, make_user, stir="301234567", name="HR Nigora") -> tuple[dict, dict]:
    """An approved company with one approved job."""
    admin = await owner(client)
    hr = await make_employer(client, make_user, name=name, stir=stir)
    await client.post(f"{API}/admin/companies/{hr['company_id']}/review", json={"approve": True}, headers=admin)
    job = (await client.post(f"{API}/employer/jobs", json=JOB, headers=hr["headers"])).json()
    await client.post(f"{API}/admin/jobs/{job['id']}/review", json={"approve": True}, headers=admin)
    return hr, job


async def applied_student(client, make_user, job: dict, name="Dilnoza") -> dict:
    student = await make_student(client, make_user, name)
    await client.post(f"{API}/me/verification", headers=student["headers"])
    r = await client.post(f"{API}/jobs/{job['id']}/apply", json={"note": "Qiziqaman"}, headers=student["headers"])
    assert r.status_code == 201, r.text
    student["application_id"] = r.json()["id"]
    return student


async def move(client, hr, app_id, **body):
    return await client.patch(f"{API}/employer/applications/{app_id}", json=body, headers=hr["headers"])


async def test_pipeline_moves_history_and_student_notices(client, make_user):
    hr, job = await live_job(client, make_user)
    student = await applied_student(client, make_user, job)
    app_id = student["application_id"]

    # the company was told about its approval, the job going live and then the new application
    hr_inbox = (await client.get(f"{API}/me/notifications", headers=hr["headers"])).json()
    assert [n["kind"] for n in hr_inbox["items"]] == ["application_new", "job_review", "company_review"]
    assert hr_inbox["unread"] == 3 and hr_inbox["items"][0]["link"] == "/korxona/nomzodlar"

    listed = (await client.get(f"{API}/employer/jobs/{job['id']}/applicants", headers=hr["headers"])).json()
    assert listed[0]["status"] == "viewed"

    r = await move(client, hr, app_id, status="interview", interview_at="2026-11-02T10:30:00",
                   interview_place="Amir Temur 1, 3-qavat")
    assert r.status_code == 200 and r.json()["status"] == "interview"
    assert r.json()["interview_place"] == "Amir Temur 1, 3-qavat"
    assert r.json()["interview_at"].startswith("2026-11-02T05:30")          # 10:30 Tashkent = 05:30 UTC

    mine = (await client.get(f"{API}/me/applications", headers=student["headers"])).json()[0]
    assert mine["status"] == "interview" and mine["interview_place"] == "Amir Temur 1, 3-qavat"
    assert [h["status"] for h in mine["history"]] == ["new", "viewed", "interview"]

    notes = (await client.get(f"{API}/me/notifications", headers=student["headers"])).json()
    assert notes["items"][0]["kind"] == "application_status" and notes["items"][0]["params"]["status"] == "interview"
    assert "Amir Temur 1" in notes["items"][0]["text"]

    # a new time is a change worth telling; the same values are not
    assert (await move(client, hr, app_id, status="interview", interview_place="Online: meet.google.com/abc")).status_code == 200
    assert (await move(client, hr, app_id, status="interview", interview_place="Online: meet.google.com/abc")).status_code == 200
    statuses = [n["params"].get("status") for n in
                (await client.get(f"{API}/me/notifications", headers=student["headers"])).json()["items"]]
    assert statuses.count("interview") == 2

    assert (await move(client, hr, app_id, status="offer")).status_code == 200
    assert (await move(client, hr, app_id, status="hired")).status_code == 200
    # a hire is final for the company
    r = await move(client, hr, app_id, status="rejected")
    assert r.status_code == 409 and "Ishga olindi" in r.json()["detail"]
    assert (await client.post(f"{API}/me/applications/{app_id}/withdraw", headers=student["headers"])).status_code == 409

    async with SessionLocal() as s:
        events = (await s.execute(select(ApplicationEvent.from_status, ApplicationEvent.to_status, ApplicationEvent.actor)
                                  .where(ApplicationEvent.application_id == app_id)
                                  .order_by(ApplicationEvent.id))).all()
    assert [(f, t) for f, t, _ in events] == [("", "new"), ("new", "viewed"), ("viewed", "interview"),
                                               ("interview", "interview"), ("interview", "offer"), ("offer", "hired")]
    assert events[0][2] == "student" and events[-1][2] == "employer"


async def test_rejected_cannot_jump_to_hired_but_can_be_reconsidered(client, make_user):
    hr, job = await live_job(client, make_user)
    app_id = (await applied_student(client, make_user, job))["application_id"]
    assert (await move(client, hr, app_id, status="rejected")).status_code == 200
    assert (await move(client, hr, app_id, status="hired")).status_code == 409
    assert (await move(client, hr, app_id, status="offer")).status_code == 409
    assert (await move(client, hr, app_id, status="shortlisted")).status_code == 200
    # another company cannot touch it
    other, _ = await live_job(client, make_user, stir="309876543", name="HR Boshqa")
    assert (await move(client, other, app_id, status="rejected")).status_code == 404


async def test_withdraw_keeps_the_row_and_allows_applying_again(client, make_user):
    hr, job = await live_job(client, make_user)
    student = await applied_student(client, make_user, job)
    app_id = student["application_id"]
    assert (await client.post(f"{API}/me/applications/{app_id}/withdraw", headers=student["headers"])).status_code == 204
    mine = (await client.get(f"{API}/me/applications", headers=student["headers"])).json()
    assert mine[0]["status"] == "withdrawn"
    kinds = [n["kind"] for n in (await client.get(f"{API}/me/notifications", headers=hr["headers"])).json()["items"]]
    assert "application_withdrawn" in kinds
    # the company cannot move a withdrawn application
    assert (await move(client, hr, app_id, status="shortlisted")).status_code == 409

    r = await client.post(f"{API}/jobs/{job['id']}/apply", json={"note": "Qayta"}, headers=student["headers"])
    assert r.status_code == 201 and r.json()["id"] == app_id and r.json()["status"] == "new"
    assert [h["status"] for h in r.json()["history"]] == ["new", "withdrawn", "new"]
    # a rejected application cannot be withdrawn (and so cannot be re-sent)
    await move(client, hr, app_id, status="rejected")
    assert (await client.post(f"{API}/me/applications/{app_id}/withdraw", headers=student["headers"])).status_code == 409
    assert (await client.post(f"{API}/jobs/{job['id']}/apply", json={}, headers=student["headers"])).status_code == 409


async def test_inbox_is_private_and_can_be_marked_read(client, make_user):
    hr, job = await live_job(client, make_user)
    student = await applied_student(client, make_user, job)
    await move(client, hr, student["application_id"], status="shortlisted")
    await move(client, hr, student["application_id"], status="offer")
    page = (await client.get(f"{API}/me/notifications", headers=student["headers"])).json()
    assert page["unread"] == 2 and len(page["items"]) == 2

    first = page["items"][-1]["id"]
    r = await client.post(f"{API}/me/notifications/read", json={"ids": [first]}, headers=student["headers"])
    assert r.json()["unread"] == 1
    # someone else's notice ids are ignored
    hr_ids = [n["id"] for n in (await client.get(f"{API}/me/notifications", headers=hr["headers"])).json()["items"]]
    await client.post(f"{API}/me/notifications/read", json={"ids": hr_ids}, headers=student["headers"])
    assert (await client.get(f"{API}/me/notifications/unread", headers=hr["headers"])).json()["unread"] == len(hr_ids)

    assert (await client.post(f"{API}/me/notifications/read", json={}, headers=student["headers"])).json()["unread"] == 0
    older = (await client.get(f"{API}/me/notifications", params={"before_id": page["items"][0]["id"]},
                              headers=student["headers"])).json()
    assert [n["id"] for n in older["items"]] == [first] and older["items"][0]["read"] is True


async def test_students_can_hide_from_companies_and_username_waits_for_contact(client, make_user):
    hr, job = await live_job(client, make_user)
    hidden = await make_student(client, make_user, "Yashirin")
    shown = await make_student(client, make_user, "Ochiq")
    me = (await client.patch(f"{API}/me", json={"visible_to_employers": False, "language": "ru"},
                             headers=hidden["headers"])).json()
    assert me["visible_to_employers"] is False and me["language"] == "ru"

    rows = (await client.get(f"{API}/employer/students", headers=hr["headers"])).json()
    assert [r["full_name"] for r in rows] == ["Ochiq"] and "username" not in rows[0]
    assert (await client.get(f"{API}/employer/students/{hidden['id']}", headers=hr["headers"])).status_code == 404
    talent = (await client.get(f"{API}/employer/talent", headers=hr["headers"])).json()
    assert hidden["id"] not in [t["id"] for t in talent]
    detail = (await client.get(f"{API}/employer/students/{shown['id']}", headers=hr["headers"])).json()
    assert detail["username"] is None and detail["phone"] is None

    # applying shares the profile with that company even while hidden from the list
    await client.post(f"{API}/me/verification", headers=hidden["headers"])
    await client.post(f"{API}/jobs/{job['id']}/apply", json={}, headers=hidden["headers"])
    assert (await client.get(f"{API}/employer/students/{hidden['id']}", headers=hr["headers"])).status_code == 200
    assert (await client.patch(f"{API}/me", json={"language": "de"}, headers=hidden["headers"])).status_code == 422


async def test_switched_off_university_is_not_revived_and_new_ones_are_limited(client, make_user):
    student = await make_user("Sardor")
    async with SessionLocal() as s:
        uni = (await s.execute(select(University).where(University.short_name == "TDIU"))).scalar_one()
        uni.is_active = False
        await s.commit()
        name = uni.name
    assert (await client.post(f"{API}/universities", json={"name": name.upper()}, headers=student["headers"])).status_code == 409
    async with SessionLocal() as s:
        assert (await s.execute(select(University.is_active).where(University.name == name))).scalar_one() is False
    for i in range(3):
        r = await client.post(f"{API}/universities", json={"name": f"Yangi institut {i}"}, headers=student["headers"])
        assert r.status_code == 200
    assert (await client.post(f"{API}/universities", json={"name": "Yana bir"}, headers=student["headers"])).status_code == 429


async def test_leaderboard_hides_students_without_consent(client, make_user):
    agreed, silent = await make_user("Rozi"), await make_user("Rozi emas")
    await client.patch(f"{API}/me", json={"consent": True}, headers=agreed["headers"])
    names = [r["full_name"] for r in (await client.get(f"{API}/leaderboard", headers=silent["headers"])).json()["rows"]]
    assert names == ["Rozi"]


async def test_one_mentor_cannot_overwrite_another_mentors_answer(client, make_user):
    student = await make_student(client, make_user, "Aziza")
    track = (await client.get(f"{API}/me", headers=student["headers"])).json()["track"]
    task_id = (await client.get(f"{API}/tracks/{track['id']}/tasks", headers=student["headers"])).json()[1]["id"]
    await client.post(f"{API}/tasks/{task_id}/questions", json={"text": "Qaysi ma'lumotni olamiz?"},
                      headers=student["headers"])
    first, second = await make_user("Mentor A", Role.mentor), await make_user("Mentor B", Role.mentor)
    q_id = (await client.get(f"{API}/mentor/questions", headers=first["headers"])).json()[0]["id"]
    assert (await client.post(f"{API}/questions/{q_id}/answer", json={"answer": "Kaggle"},
                              headers=first["headers"])).status_code == 200
    assert (await client.post(f"{API}/questions/{q_id}/answer", json={"answer": "Boshqa javob"},
                              headers=second["headers"])).status_code == 409
    assert (await client.post(f"{API}/questions/{q_id}/answer", json={"answer": "Kaggle, 2024"},
                              headers=first["headers"])).status_code == 200
    kinds = [n["kind"] for n in (await client.get(f"{API}/me/notifications", headers=student["headers"])).json()["items"]]
    assert "question_answered" in kinds


async def test_admin_cannot_approve_a_closed_job_and_only_the_owner_resets_passwords(client, make_user):
    hr, job = await live_job(client, make_user)
    await client.post(f"{API}/employer/jobs/{job['id']}/close", headers=hr["headers"])
    admin = await owner(client)
    assert (await client.post(f"{API}/admin/jobs/{job['id']}/review", json={"approve": True},
                              headers=admin)).status_code == 409

    web = await client.post(f"{API}/auth/register", json={"full_name": "Veb Foydalanuvchi", "email": "veb@mail.uz",
                                                         "password": "parol-1234567"})
    web_id = (await client.get(f"{API}/me", headers={"Authorization": f"Bearer {web.json()['token']}"})).json()["id"]
    await register(client, "Nodira", "nodira@gmail.com")
    nodira = next(a for a in (await client.get(f"{API}/admin/accounts", headers=admin)).json()
                  if a["email"] == "nodira@gmail.com")
    await client.patch(f"{API}/admin/accounts/{nodira['id']}", json={"status": "active"}, headers=admin)
    h = {"Authorization": f"Bearer {(await login(client, 'nodira@gmail.com')).json()['token']}"}
    assert (await client.post(f"{API}/admin/users/{web_id}/reset-password", headers=h)).status_code == 403
    assert (await client.post(f"{API}/admin/users/{web_id}/reset-password", headers=admin)).status_code == 200


async def test_company_accounts_cannot_review_work_or_turn_back_into_students(client, make_user):
    hr, _ = await live_job(client, make_user)
    author = await make_student(client, make_user, "Muallif")
    track = (await client.get(f"{API}/me", headers=author["headers"])).json()["track"]
    task_id = (await client.get(f"{API}/tracks/{track['id']}/tasks", headers=author["headers"])).json()[1]["id"]
    sub = await client.post(f"{API}/tasks/{task_id}/submit", json={"proof_url": "https://github.com/a/b"},
                            headers=author["headers"])
    assert sub.status_code in (200, 201), sub.text
    await client.patch(f"{API}/me", json={"track_id": track["id"]}, headers=hr["headers"])
    r = await client.post(f"{API}/submissions/{sub.json()['id']}/reviews",
                          json={"approved": True, "comment": "Juda yaxshi ish qilingan"}, headers=hr["headers"])
    assert r.status_code == 403
    assert (await client.post(f"{API}/me/account-type/student", headers=hr["headers"])).status_code == 409


async def test_unknown_api_path_is_a_json_404(client):
    r = await client.get(f"{API}/no-such-endpoint")
    assert r.status_code in (404, 405) and r.headers["content-type"].startswith("application/json")


async def test_a_secret_saved_under_another_instance_key_does_not_break_pages(client, make_user):
    from app.models import AppSetting
    from app.services import settings_store
    async with SessionLocal() as s:
        s.add(AppSetting(key=settings_store.GEMINI_KEY, ciphertext="bm90LWEtcmVhbC1jaXBoZXJ0ZXh0LWF0LWFsbA==", hint="…"))
        await s.commit()
    user = await make_user("Sardor")
    r = await client.get(f"{API}/assistant/status", headers=user["headers"])
    assert r.status_code == 200 and r.json()["available"] is False
