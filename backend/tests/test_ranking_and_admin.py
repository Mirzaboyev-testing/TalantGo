"""Phase 5: the placement-only university ranking, complaints, admin roles and company activity facts."""
from app.core.db import SessionLocal
from app.models import EmploymentOutcome
from tests.conftest import owner_headers as owner
from tests.test_admin import login, register
from tests.test_career import make_student, uni_id
from tests.test_pipeline_and_inbox import API, applied_student, live_job, move
from tests.test_university_panel import graduates


async def place(short: str, ids: list[int], kind: str) -> None:
    uni = await uni_id(short)
    async with SessionLocal() as s:
        s.add_all([EmploymentOutcome(student_id=i, university_id=uni, company_name="Firma", kind=kind,
                                     source="self", confirmed=True, confirmed_by="company") for i in ids])
        await s.commit()


async def staff_account(client, role: str, email: str) -> dict:
    admin = await owner(client)
    await register(client, role.title(), email)
    account = next(a for a in (await client.get(f"{API}/admin/accounts", headers=admin)).json() if a["email"] == email)
    r = await client.patch(f"{API}/admin/accounts/{account['id']}", json={"status": "active", "role": role}, headers=admin)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {(await login(client, email)).json()['token']}"}


async def test_ranking_counts_jobs_and_internships_and_skips_small_samples(client, make_user):
    tdiu = await graduates("TDIU", 10)
    wiut = await graduates("WIUT", 10)
    await graduates("TATU", 3)                                 # too few students for a score
    await place("TDIU", tdiu[:3], "full_time")
    await place("TDIU", tdiu[3:5], "internship")              # TDIU: 3 jobs + 2 internships of 10
    await place("WIUT", wiut[:4], "part_time")                # WIUT: 4 jobs of 10

    r = (await client.get(f"{API}/public/ranking")).json()
    assert r["published"] is None
    rows = {x["short_name"]: x for x in r["live"]["rows"]}
    assert rows["TDIU"]["score"] == 50.0 and rows["TDIU"]["rank"] == 1
    assert rows["WIUT"]["score"] == 40.0 and rows["WIUT"]["rank"] == 2
    assert rows["TATU"]["score"] is None and rows["TATU"]["rank"] is None
    assert [x["short_name"] for x in r["live"]["rows"]][-1] == "TATU"
    assert r["live"]["method"]["internship_weight"] == 1.0

    admin = await owner(client)
    # an internship can be weighted lower; the ranking follows
    await client.put(f"{API}/admin/ranking/config", json={"internship_weight": 0.5, "min_sample": 10}, headers=admin)
    rows = {x["short_name"]: x for x in (await client.get(f"{API}/admin/ranking", headers=admin)).json()["rows"]}
    assert rows["TDIU"]["score"] == 40.0 and rows["WIUT"]["score"] == 40.0 and rows["TDIU"]["rank"] == rows["WIUT"]["rank"] == 1

    snap = (await client.post(f"{API}/admin/ranking/publish", json={"period": "2026-yil kuz"}, headers=admin)).json()
    assert snap["period"] == "2026-yil kuz" and snap["config"]["internship_weight"] == 0.5
    published = (await client.get(f"{API}/public/ranking")).json()["published"]
    assert published["id"] == snap["id"] and len(published["rows"]) == 3
    # later changes do not rewrite what was published
    await place("WIUT", wiut[4:8], "full_time")
    assert (await client.get(f"{API}/public/ranking")).json()["published"]["rows"] == published["rows"]
    audit = [a["action"] for a in (await client.get(f"{API}/admin/audit", headers=admin)).json()]
    assert "ranking.publish" in audit and "ranking.config" in audit


async def test_complaints_reach_the_admins(client, make_user):
    hr, job = await live_job(client, make_user)
    student = await make_student(client, make_user, "Aziza")
    body = {"target_kind": "job", "target_id": job["id"], "reason": "unpaid", "text": "Maosh e'londa yo'q"}
    assert (await client.post(f"{API}/complaints", json=body, headers=student["headers"])).status_code == 201
    assert (await client.post(f"{API}/complaints", json={**body, "target_id": 999999}, headers=student["headers"])).status_code == 404
    assert (await client.post(f"{API}/complaints", json={"target_kind": "user", "target_id": student["id"], "reason": "spam"},
                              headers=student["headers"])).status_code == 422

    moderator = await staff_account(client, "moderator", "mod@talantgo.uz")
    listed = (await client.get(f"{API}/admin/complaints", headers=moderator)).json()
    assert listed[0]["target"].startswith("Data analitik stajyor") and listed[0]["reporter"] == "Aziza"
    r = await client.post(f"{API}/admin/complaints/{listed[0]['id']}", json={"status": "resolved", "note": "HR bilan gaplashildi"},
                          headers=moderator)
    assert r.status_code == 200
    assert (await client.get(f"{API}/admin/complaints", headers=moderator)).json() == []


async def test_moderator_and_analyst_have_limited_rights(client, make_user):
    hr = (await live_job(client, make_user))[0]
    moderator = await staff_account(client, "moderator", "mod@talantgo.uz")
    analyst = await staff_account(client, "analyst", "data@talantgo.uz")

    # moderators moderate
    assert (await client.post(f"{API}/admin/companies/{hr['company_id']}/review", json={"approve": True},
                              headers=moderator)).status_code == 200
    assert (await client.get(f"{API}/admin/dashboard", headers=moderator)).status_code == 200
    # but do not change settings, export personal data or publish rankings
    assert (await client.put(f"{API}/admin/rules", json={"peer_approvals_required": 1, "review_points": 1,
                                                        "mentor_bonus_percent": 0}, headers=moderator)).status_code == 403
    assert (await client.get(f"{API}/admin/export/users.csv", headers=moderator)).status_code == 403
    assert (await client.post(f"{API}/admin/ranking/publish", json={"period": "test davr"}, headers=moderator)).status_code == 403
    assert (await client.post(f"{API}/admin/tracks", json={"slug": "x-track", "title": "X yo'nalish", "description": "Tavsif matni"},
                              headers=moderator)).status_code == 403

    # analysts only read the numbers
    assert (await client.get(f"{API}/admin/dashboard", headers=analyst)).status_code == 200
    assert (await client.get(f"{API}/admin/ranking", headers=analyst)).status_code == 200
    assert (await client.post(f"{API}/admin/companies/{hr['company_id']}/review", json={"approve": False, "note": "x"},
                              headers=analyst)).status_code == 403
    assert (await client.get(f"{API}/admin/assistant/users", headers=analyst)).status_code == 403
    # everyone can still change their own password
    assert (await client.put(f"{API}/admin-auth/password", json={"current_password": "parol-1234567", "new_password": "yangi-parol-123"},
                             headers=analyst)).status_code == 200


async def test_company_page_shows_activity_facts(client, make_user):
    hr, job = await live_job(client, make_user)
    student = await applied_student(client, make_user, job)
    await move(client, hr, student["application_id"], status="hired")
    activity = (await client.get(f"{API}/public/companies/{hr['company_id']}")).json()["activity"]
    assert activity["applications"] == 1 and activity["hires"] == 1 and activity["answer_rate"] is None
