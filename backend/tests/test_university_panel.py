"""Phase 4: employment outcomes and statistics, partnerships, recommendations, university profiles."""
from datetime import date

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import EmploymentOutcome, User
from tests.conftest import owner_headers as owner
from tests.test_career import make_student, uni_id
from tests.test_pipeline_and_inbox import API, applied_student, live_job, move

THIS_YEAR = date.today().year


async def approved_staff(client, make_user, short="TDIU", name="Karyera markazi") -> dict:
    staff = await make_user(name)
    await client.post(f"{API}/me/staff-request", json={"university_id": await uni_id(short), "position": "Karyera markazi"},
                      headers=staff["headers"])
    await client.post(f"{API}/admin/staff/{staff['id']}/review", json={"approve": True}, headers=await owner(client))
    return staff


async def graduates(short: str, n: int, year: int = THIS_YEAR - 1, verified=True) -> list[int]:
    """Students straight in the database: a sample big enough for the shares to show."""
    uni = await uni_id(short)
    async with SessionLocal() as s:
        users = [User(telegram_id=None, full_name=f"Bitiruvchi {short} {i} {year}", account_type="student",
                      university_id=uni, graduation_year=year, verification="verified" if verified else "pending",
                      consent_at=None) for i in range(n)]
        s.add_all(users)
        await s.commit()
        return [u.id for u in users]


async def test_hire_becomes_a_confirmed_outcome_and_counts_for_the_university(client, make_user):
    hr, job = await live_job(client, make_user)
    staff = await approved_staff(client, make_user)
    student = await applied_student(client, make_user, job, name="Dilnoza")
    await client.post(f"{API}/university/verifications/{student['id']}", json={"approve": True}, headers=staff["headers"])
    await client.patch(f"{API}/me", json={"graduation_year": THIS_YEAR - 1}, headers=student["headers"])
    await move(client, hr, student["application_id"], status="hired")
    await move(client, hr, student["application_id"], status="hired")      # no double counting

    async with SessionLocal() as s:
        rows = (await s.execute(select(EmploymentOutcome).where(EmploymentOutcome.student_id == student["id"]))).scalars().all()
    assert len(rows) == 1 and rows[0].confirmed and rows[0].source == "application"
    assert rows[0].university_id == await uni_id("TDIU") and rows[0].kind == "internship"

    st = (await client.get(f"{API}/university/stats", headers=staff["headers"])).json()
    # an internship counts as a placement (the user's rule: jobs and internships, not quality, for now)
    assert st["students"] == 1 and st["placed"] == 1 and st["interned"] == 1 and st["employed"] == 0
    assert st["placement_rate"] is None           # 1 student is below the minimum sample
    assert st["hires_on_platform"] == 1 and st["top_employers"] == [{"name": "Data Solutions MChJ", "count": 1}]


async def test_shares_need_a_minimum_sample_and_only_confirmed_outcomes_count(client, make_user):
    staff = await approved_staff(client, make_user)
    ids = await graduates("TDIU", 10)
    await graduates("TDIU", 5, verified=False)                # unverified students are never counted
    tdiu = await uni_id("TDIU")
    async with SessionLocal() as s:
        s.add_all([EmploymentOutcome(student_id=i, university_id=tdiu, company_name="Bank A",
                                     kind="full_time", source="self", confirmed=True, confirmed_by="university")
                   for i in ids[:3]])
        # a student with both an internship and a job is counted once, as employed
        s.add_all([EmploymentOutcome(student_id=ids[3], university_id=tdiu, company_name="Bank A", kind="internship",
                                     source="self", confirmed=True, confirmed_by="university"),
                   EmploymentOutcome(student_id=ids[3], university_id=tdiu, company_name="Bank A", kind="full_time",
                                     source="self", confirmed=True, confirmed_by="university"),
                   EmploymentOutcome(student_id=ids[5], university_id=tdiu, company_name="IT Park", kind="internship",
                                     source="self", confirmed=True, confirmed_by="university")])
        s.add(EmploymentOutcome(student_id=ids[4], university_id=tdiu, company_name="Startap",
                                kind="part_time", source="self", confirmed=False))
        await s.commit()
    st = (await client.get(f"{API}/university/stats", headers=staff["headers"])).json()
    assert st["students"] == 10 and st["employed"] == 4 and st["interned"] == 1 and st["placed"] == 5
    assert st["placement_rate"] == 50 and st["employed_rate"] == 40 and st["intern_rate"] == 10
    assert st["self_reported"] == 1 and st["where"]["full_time"] == 4 and st["where"]["unknown"] == 5
    assert (await client.get(f"{API}/university/stats", params={"cohort": THIS_YEAR - 5},
                             headers=staff["headers"])).json()["students"] == 0

    # confirming the student's own report moves it into the confirmed numbers
    pending = (await client.get(f"{API}/university/outcomes", params={"confirmed": False}, headers=staff["headers"])).json()
    assert [o["company"] for o in pending] == ["Startap"]
    r = await client.post(f"{API}/university/outcomes/{pending[0]['id']}", json={"confirm": True}, headers=staff["headers"])
    assert r.status_code == 200
    assert (await client.get(f"{API}/university/stats", headers=staff["headers"])).json()["placement_rate"] == 60

    # another university's staff sees none of it
    other = await approved_staff(client, make_user, short="WIUT", name="WIUT xodimi")
    assert (await client.post(f"{API}/university/outcomes/{pending[0]['id']}", json={"confirm": False},
                              headers=other["headers"])).status_code == 404
    assert (await client.get(f"{API}/university/stats", headers=other["headers"])).json()["students"] == 0


async def test_students_report_work_themselves(client, make_user):
    student = await make_student(client, make_user, "Aziza")
    r = await client.post(f"{API}/me/outcomes", json={"company_name": "Uzum", "position": "Analitik", "kind": "part_time"},
                          headers=student["headers"])
    assert r.status_code == 201 and r.json()["confirmed"] is False
    page = (await client.get(f"{API}/me/university", headers=student["headers"])).json()
    assert page["university"]["short_name"] == "TDIU" and page["outcomes"][0]["company"] == "Uzum"
    assert "phone" not in str(page["university"])
    assert (await client.delete(f"{API}/me/outcomes/{r.json()['id']}", headers=student["headers"])).status_code == 204
    hr, _ = await live_job(client, make_user)
    assert (await client.post(f"{API}/me/outcomes", json={"company_name": "Boshqa firma", "kind": "full_time"},
                              headers=hr["headers"])).status_code == 403


async def test_partnership_between_company_and_university(client, make_user):
    hr, _ = await live_job(client, make_user)
    staff = await approved_staff(client, make_user)
    tdiu = await uni_id("TDIU")
    r = await client.post(f"{API}/employer/universities/{tdiu}/partnership", json={"message": "Amaliyot dasturi"},
                          headers=hr["headers"])
    assert r.status_code == 201 and r.json()["status"] == "pending"
    assert (await client.post(f"{API}/employer/universities/{tdiu}/partnership", json={},
                              headers=hr["headers"])).status_code == 409
    kinds = [n["kind"] for n in (await client.get(f"{API}/me/notifications", headers=staff["headers"])).json()["items"]]
    assert "partnership_request" in kinds
    # the asking side cannot answer its own request
    assert (await client.post(f"{API}/employer/partnerships/{r.json()['id']}/decide", json={"accept": True},
                              headers=hr["headers"])).status_code == 403
    listed = (await client.get(f"{API}/university/partners", headers=staff["headers"])).json()
    assert listed[0]["company"] == "Data Solutions MChJ"
    assert (await client.post(f"{API}/university/partners/{listed[0]['id']}/decide", json={"accept": True},
                              headers=staff["headers"])).json()["status"] == "accepted"

    profile = (await client.get(f"{API}/public/universities/{tdiu}")).json()
    assert profile["partners"] == [{"id": hr["company_id"], "name": "Data Solutions MChJ"}]
    seen = {u["id"]: u for u in (await client.get(f"{API}/employer/universities", headers=hr["headers"])).json()}
    assert seen[tdiu]["partnership"]["status"] == "accepted"
    assert (await client.get(f"{API}/employer/universities/{tdiu}", headers=hr["headers"])).json()["partnership"]["status"] == "accepted"
    # the university side can also ask a company
    other, _ = await live_job(client, make_user, stir="309876543", name="HR Boshqa")
    r = await client.post(f"{API}/university/partners", json={"company_id": other["company_id"]}, headers=staff["headers"])
    assert r.status_code == 201 and r.json()["initiated_by"] == "university"
    assert (await client.post(f"{API}/employer/partnerships/{r.json()['id']}/decide", json={"accept": False},
                              headers=other["headers"])).json()["status"] == "rejected"


async def test_university_recommends_a_job_to_its_students(client, make_user):
    hr, job = await live_job(client, make_user)
    staff = await approved_staff(client, make_user)
    student = await make_student(client, make_user, "Aziza")
    await client.post(f"{API}/me/verification", headers=student["headers"])
    await client.post(f"{API}/university/verifications/{student['id']}", json={"approve": True}, headers=staff["headers"])

    ops = (await client.get(f"{API}/university/opportunities", headers=staff["headers"])).json()
    assert ops[0]["id"] == job["id"] and ops[0]["recommended"] is False
    r = await client.post(f"{API}/university/jobs/{job['id']}/recommend", json={"note": "Iqtisodiyot talabalari uchun"},
                          headers=staff["headers"])
    assert r.status_code == 201 and r.json()["students"] == 1
    assert (await client.post(f"{API}/university/jobs/{job['id']}/recommend", json={},
                              headers=staff["headers"])).status_code == 409
    note = (await client.get(f"{API}/me/notifications", headers=student["headers"])).json()["items"][0]
    assert note["kind"] == "job_recommended" and note["link"] == f"/vakansiyalar/{job['id']}"
    page = (await client.get(f"{API}/me/university", headers=student["headers"])).json()
    assert [j["id"] for j in page["recommended"]] == [job["id"]] and page["recommended"][0]["note"] == "Iqtisodiyot talabalari uchun"


async def test_university_profile_is_edited_by_its_staff_and_public_pages_show_aggregates(client, make_user):
    staff = await approved_staff(client, make_user)
    r = await client.patch(f"{API}/university/profile", json={"description": "Iqtisodiyot universiteti", "website": "tsue.uz"},
                           headers=staff["headers"])
    assert r.status_code == 200 and r.json()["website"].startswith("https://")
    listed = (await client.get(f"{API}/public/universities", params={"q": "TDIU"})).json()
    assert listed["total"] >= 1 and listed["items"][0]["short_name"] == "TDIU"
    profile = (await client.get(f"{API}/public/universities/{await uni_id('TDIU')}")).json()
    assert profile["description"] == "Iqtisodiyot universiteti" and profile["placement_rate"] is None
    student = await make_student(client, make_user, "Aziza")
    assert (await client.patch(f"{API}/university/profile", json={"description": "x"},
                               headers=student["headers"])).status_code == 403
