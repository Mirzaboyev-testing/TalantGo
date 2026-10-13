"""Handshake-style flow: verified students, approved companies, moderated jobs, anonymous talent search."""
from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import University

JOB = {"title": "Data analitik stajyor", "kind": "internship", "work_mode": "hybrid", "city": "Toshkent",
       "is_paid": True, "salary_from": 2_000_000, "salary_to": 3_000_000,
       "description": "Power BI hisobotlar va SQL so'rovlar bilan ishlash, 3 oy",
       "skills": ["SQL", "Power BI"], "counts_as_practice": True, "rules_accepted": True}


from tests.conftest import owner_headers as owner


async def uni_id(short: str) -> int:
    async with SessionLocal() as s:
        return (await s.execute(select(University.id).where(University.short_name == short))).scalar_one()


async def make_student(client, make_user, name: str, open_to_work=True) -> dict:
    u = await make_user(name)
    tdiu = await uni_id("TDIU")
    track = (await client.get("/api/v1/tracks")).json()[0]
    r = await client.patch("/api/v1/me", json={
        "consent": True, "track_id": track["id"], "university_id": tdiu, "faculty": "Iqtisodiyot", "course": 3,
        "student_number": f"HEMIS-{name}", "skills": ["SQL", "Excel", "Power BI"], "languages": ["Ingliz B2"],
        "job_types": ["internship"], "open_to_work": open_to_work}, headers=u["headers"])
    assert r.status_code == 200, r.text
    return u


COMPANY = {"name": "Data Solutions MChJ", "stir": "301234567", "legal_form": "llc", "industry": "it",
           "size": "11-50", "city": "Toshkent shahri",
           "description": "Ma'lumotlar tahlili bo'yicha xizmatlar, talabalar uchun amaliyot dasturi"}
EMPLOYER = {**COMPANY, "full_name": "Nigora Karimova", "job_title": "HR menejer", "consent": True}


async def make_employer(client, make_user, name: str = "HR Nigora", stir: str = "301234567") -> dict:
    hr = await make_user(name)
    await client.patch("/api/v1/me", json={"phone": "+998901234567"}, headers=hr["headers"])
    r = await client.post("/api/v1/me/company", json={**EMPLOYER, "stir": stir}, headers=hr["headers"])
    assert r.status_code == 201, r.text
    hr["company_id"] = r.json()["company"]["id"]
    return hr


async def test_universities_are_seeded(client):
    unis = (await client.get("/api/v1/universities")).json()
    assert any(u["short_name"] == "TDIU" for u in unis) and len(unis) >= 25


async def test_verification_by_university_staff(client, make_user):
    student = await make_student(client, make_user, "Aziza")
    me = (await client.post("/api/v1/me/verification", headers=student["headers"])).json()
    assert me["verification"] == "pending"

    staff = await make_user("Karyera markazi xodimi")
    await client.post("/api/v1/me/staff-request", json={"university_id": await uni_id("TDIU"), "position": "Karyera markazi"},
                      headers=staff["headers"])
    assert (await client.get("/api/v1/university/dashboard", headers=staff["headers"])).status_code == 403
    assert (await client.post(f"/api/v1/admin/staff/{staff['id']}/review", json={"approve": True},
                              headers=await owner(client))).status_code == 200

    dash = (await client.get("/api/v1/university/dashboard", headers=staff["headers"])).json()
    assert dash["students"] == 1 and dash["pending_verification"] == 1
    r = await client.post(f"/api/v1/university/verifications/{student['id']}", json={"approve": True}, headers=staff["headers"])
    me = (await client.get("/api/v1/me", headers=student["headers"])).json()
    assert r.status_code == 200 and me["verification"] == "verified" and me["verified_by"] == "TDIU karyera markazi"

    # changing the student ID afterwards cancels the verification
    me = (await client.patch("/api/v1/me", json={"student_number": "OTHER"}, headers=student["headers"])).json()
    assert me["verification"] == "none"


async def test_staff_cannot_verify_other_universities(client, make_user):
    student = await make_student(client, make_user, "Bekzod")
    await client.post("/api/v1/me/verification", headers=student["headers"])
    staff = await make_user("WIUT xodimi")
    await client.post("/api/v1/me/staff-request", json={"university_id": await uni_id("WIUT"), "position": "Career centre"},
                      headers=staff["headers"])
    await client.post(f"/api/v1/admin/staff/{staff['id']}/review", json={"approve": True}, headers=await owner(client))
    r = await client.post(f"/api/v1/university/verifications/{student['id']}", json={"approve": True}, headers=staff["headers"])
    assert r.status_code == 404


async def test_company_and_job_moderation_then_apply(client, make_user):
    admin = await owner(client)
    hr = await make_employer(client, make_user)
    student = await make_student(client, make_user, "Dilnoza")

    assert (await client.post("/api/v1/employer/jobs", json={**JOB, "rules_accepted": False},
                              headers=hr["headers"])).status_code in (403, 422)
    # nothing works before the company is approved
    assert (await client.post("/api/v1/employer/jobs", json=JOB, headers=hr["headers"])).status_code == 403
    await client.post(f"/api/v1/admin/companies/{hr['company_id']}/review", json={"approve": True}, headers=admin)
    job = (await client.post("/api/v1/employer/jobs", json=JOB, headers=hr["headers"])).json()
    assert job["status"] == "pending"
    assert (await client.get("/api/v1/jobs", headers=student["headers"])).json() == []

    await client.post(f"/api/v1/admin/jobs/{job['id']}/review", json={"approve": True}, headers=admin)
    jobs = (await client.get("/api/v1/jobs", params={"kind": "internship"}, headers=student["headers"])).json()
    assert [j["id"] for j in jobs] == [job["id"]] and jobs[0]["match"] >= 70

    # applying needs a verification request first
    assert (await client.post(f"/api/v1/jobs/{job['id']}/apply", json={}, headers=student["headers"])).status_code == 422
    await client.post("/api/v1/me/verification", headers=student["headers"])
    r = await client.post(f"/api/v1/jobs/{job['id']}/apply", json={"note": "Power BI bilan ishlaganman"},
                          headers=student["headers"])
    assert r.status_code == 201
    assert (await client.post(f"/api/v1/jobs/{job['id']}/apply", json={}, headers=student["headers"])).status_code == 409

    applicants = (await client.get(f"/api/v1/employer/jobs/{job['id']}/applicants", headers=hr["headers"])).json()
    assert applicants[0]["identity"]["full_name"] == "Dilnoza" and applicants[0]["status"] == "viewed"
    r = await client.patch(f"/api/v1/employer/applications/{applicants[0]['id']}", json={"status": "hired"},
                           headers=hr["headers"])
    assert r.json()["status"] == "hired"
    mine = (await client.get("/api/v1/me/applications", headers=student["headers"])).json()
    assert mine[0]["status"] == "hired"

    # editing a live job sends it back to moderation
    edited = (await client.put(f"/api/v1/employer/jobs/{job['id']}", json={**JOB, "title": "Yangi nom"},
                               headers=hr["headers"])).json()
    assert edited["status"] == "pending"


async def test_talent_search_is_anonymous_until_student_accepts(client, make_user):
    admin = await owner(client)
    hr = await make_employer(client, make_user)
    await client.post(f"/api/v1/admin/companies/{hr['company_id']}/review", json={"approve": True}, headers=admin)
    visible = await make_student(client, make_user, "Sardor")
    await make_student(client, make_user, "Yashirin", open_to_work=False)

    cards = (await client.get("/api/v1/employer/talent", params={"skill": "SQL"}, headers=hr["headers"])).json()
    assert len(cards) == 1
    card = cards[0]
    assert "full_name" not in card and "username" not in card and "student_number" not in card
    assert card["university"] == "TDIU" and card["code"].startswith("T-")

    # a student cannot use the employer side
    assert (await client.get("/api/v1/employer/talent", headers=visible["headers"])).status_code == 403

    r = await client.post(f"/api/v1/employer/talent/{card['id']}/contact",
                          json={"message": "Salom! Bizda data analitik amaliyot bor."}, headers=hr["headers"])
    assert r.status_code == 201
    contacts = (await client.get("/api/v1/employer/contacts", headers=hr["headers"])).json()
    assert contacts[0]["identity"] is None

    inbox = (await client.get("/api/v1/me/contacts", headers=visible["headers"])).json()
    assert inbox[0]["company"] == "Data Solutions MChJ"
    await client.post(f"/api/v1/me/contacts/{inbox[0]['id']}", json={"accept": True}, headers=visible["headers"])
    contacts = (await client.get("/api/v1/employer/contacts", headers=hr["headers"])).json()
    assert contacts[0]["identity"]["full_name"] == "Sardor"


async def test_employers_and_staff_are_not_in_student_rankings(client, make_user):
    hr = await make_employer(client, make_user)
    student = await make_student(client, make_user, "Aziza")
    board = (await client.get("/api/v1/leaderboard", headers=student["headers"])).json()
    assert [r["full_name"] for r in board["rows"]] == ["Aziza"]
    inbox = (await client.get("/api/v1/admin/inbox", headers=await owner(client))).json()
    assert inbox["companies"] == 1
    assert hr
