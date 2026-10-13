"""Two-way sign-up (job seeker / employer), the employer's named student list with PDF CVs, and company tests."""
from tests.conftest import owner_headers as owner
from tests.test_career import COMPANY, EMPLOYER, make_employer, uni_id


async def full_student(client, make_user, name: str, track_index: int = 0, points: int = 0) -> dict:
    u = await make_user(name)
    track = (await client.get("/api/v1/tracks")).json()[track_index]
    r = await client.patch("/api/v1/me", json={
        "full_name": name, "phone": "+998901112233", "university_id": await uni_id("TDIU"), "faculty": "Iqtisodiyot",
        "course": 2, "group_name": "114-25", "track_id": track["id"], "work_industries": ["fintech", "bank"],
        "job_types": ["internship"], "consent": True}, headers=u["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["signup_missing"] == []
    if points:
        await client.post(f"/api/v1/admin/users/{u['id']}/points", json={"delta": points, "reason": "Test uchun ball qo'shildi"},
                          headers=await owner(client))
    u["track_id"] = track["id"]
    return u


async def approved_employer(client, make_user, name="HR Nigora", stir="301234567") -> dict:
    hr = await make_employer(client, make_user, name, stir)
    r = await client.post(f"/api/v1/admin/companies/{hr['company_id']}/review", json={"approve": True, "note": ""},
                          headers=await owner(client))
    assert r.status_code == 200, r.text
    return hr


# --------------------------------------------------------------------------- sign-up

async def test_new_student_sees_every_required_field_missing(client, make_user):
    u = await make_user("Ali")
    me = (await client.get("/api/v1/me", headers=u["headers"])).json()
    assert me["signup_missing"] == ["full_name", "phone", "university", "faculty", "course", "group", "track",
                                    "work_industries", "job_types", "consent"]
    r = await client.patch("/api/v1/me", json={"work_industries": ["kosmos"]}, headers=u["headers"])
    assert r.status_code == 422                                  # only fields from the list


async def test_old_consent_must_be_given_again(client, make_user):
    from app.core.db import SessionLocal
    from app.models import User
    u = await full_student(client, make_user, "Vali Karimov")
    async with SessionLocal() as s:                              # an account that agreed to the first text only
        (await s.get(User, u["id"])).consent_version = 1
        await s.commit()
    me = (await client.get("/api/v1/me", headers=u["headers"])).json()
    assert me["signup_missing"] == ["consent"] and not me["consent_current"]
    me = (await client.patch("/api/v1/me", json={"consent": True}, headers=u["headers"])).json()
    assert me["signup_missing"] == [] and me["consent_current"]


async def test_employer_sign_up_requires_every_starred_field(client, make_user):
    hr = await make_user("HR")
    r = await client.post("/api/v1/me/company", json=EMPLOYER, headers=hr["headers"])
    assert r.status_code == 422 and "Telefon" in r.json()["detail"]          # phone first
    await client.patch("/api/v1/me", json={"phone": "+998901234567"}, headers=hr["headers"])
    for missing in ("stir", "legal_form", "industry", "size", "city", "description", "job_title"):
        body = {k: v for k, v in EMPLOYER.items() if k != missing}
        assert (await client.post("/api/v1/me/company", json=body, headers=hr["headers"])).status_code == 422, missing
    assert (await client.post("/api/v1/me/company", json={**EMPLOYER, "industry": "IT"}, headers=hr["headers"])).status_code == 422
    assert (await client.post("/api/v1/me/company", json={**EMPLOYER, "consent": False}, headers=hr["headers"])).status_code == 422

    r = await client.post("/api/v1/me/company", json=EMPLOYER, headers=hr["headers"])
    me = r.json()
    assert r.status_code == 201 and me["account_type"] == "employer" and me["signup_missing"] == []
    assert me["full_name"] == "Nigora Karimova" and me["job_title"] == "HR menejer"
    assert me["company"]["status"] == "pending" and me["company"]["legal_form"] == "llc" and me["company"]["size"] == "11-50"
    catalog = (await client.get("/api/v1/catalog")).json()
    assert catalog["industries"]["fintech"] == "Fintex" and "Toshkent shahri" in catalog["regions"]


async def test_adding_a_first_stir_keeps_an_approved_company_approved(client, make_user):
    from app.core.db import SessionLocal
    from app.models import Company
    hr = await approved_employer(client, make_user)
    async with SessionLocal() as s:                              # an older company created without a STIR
        (await s.get(Company, hr["company_id"])).stir = None
        await s.commit()
    me = (await client.get("/api/v1/me", headers=hr["headers"])).json()
    assert "stir" in me["signup_missing"]
    c = (await client.patch("/api/v1/employer/company", json={**COMPANY, "stir": "309999999"}, headers=hr["headers"])).json()
    assert c["status"] == "approved"
    c = (await client.patch("/api/v1/employer/company", json={**COMPANY, "stir": "308888888"}, headers=hr["headers"])).json()
    assert c["status"] == "pending"                              # replacing a STIR is checked again


# --------------------------------------------------------------------------- named students and CVs

async def test_employer_sees_named_students_by_rating_and_downloads_cv(client, make_user):
    weak = await full_student(client, make_user, "Bobur Aliyev", points=10)
    strong = await full_student(client, make_user, "Dilnoza Rahimova", points=50)
    hidden = await make_user("Rozilik bermagan")                 # no current consent: not listed
    hr = await approved_employer(client, make_user)

    rows = (await client.get("/api/v1/employer/students", headers=hr["headers"])).json()
    assert [r["full_name"] for r in rows] == ["Dilnoza Rahimova", "Bobur Aliyev"]
    assert rows[0]["rank"] == 1 and rows[1]["rank"] == 2 and rows[0]["group_name"] == "114-25"
    assert "phone" not in rows[0]
    assert all(r["id"] != hidden["id"] for r in rows)
    found = (await client.get("/api/v1/employer/students", params={"q": "bobur"}, headers=hr["headers"])).json()
    assert [r["id"] for r in found] == [weak["id"]]
    assert (await client.get("/api/v1/employer/students", params={"industry": "it"}, headers=hr["headers"])).json() == []

    detail = (await client.get(f"/api/v1/employer/students/{strong['id']}", headers=hr["headers"])).json()
    assert detail["full_name"] == "Dilnoza Rahimova" and detail["phone"] is None and detail["cv"]["full_name"]

    link = (await client.get(f"/api/v1/employer/students/{strong['id']}/cv-link", headers=hr["headers"])).json()["url"]
    pdf = await client.get(link)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF") and "attachment" in pdf.headers["content-disposition"]
    assert (await client.get(link.replace(f"/{strong['id']}?", f"/{weak['id']}?"))).status_code == 403

    own = (await client.get("/api/v1/me/cv-link", headers=weak["headers"])).json()["url"]
    assert (await client.get(own)).content.startswith(b"%PDF")

    # only approved employers
    pending = await make_employer(client, make_user, "HR boshqa", "302222222")
    assert (await client.get("/api/v1/employer/students", headers=pending["headers"])).status_code == 403
    assert (await client.get("/api/v1/employer/students", headers=weak["headers"])).status_code == 403


# --------------------------------------------------------------------------- company tests

TEST = {
    "title": "Excel va SQL bo'yicha kirish testi", "description": "20 daqiqa", "audience": "all", "time_limit_min": 20,
    "questions": [
        {"kind": "single", "text": "SELECT nima qiladi?", "options": ["O'chiradi", "Tanlaydi", "Qo'shadi"], "correct": [1], "points": 5},
        {"kind": "multi", "text": "Qaysilari SQL agregat funksiya?", "options": ["SUM", "AVG", "JOIN"], "correct": [0, 1], "points": 5},
        {"kind": "text", "text": "Oxirgi loyihangizni qisqa yozing", "points": 10},
        {"kind": "single", "text": "Qaysi formatda ishlashni xohlaysiz?", "options": ["Ofis", "Masofaviy"], "points": 0},
    ],
}


async def test_company_test_from_creation_to_grading(client, make_user):
    hr = await approved_employer(client, make_user)
    student = await full_student(client, make_user, "Aziza Yusupova")
    admin = await owner(client)

    bad = {**TEST, "questions": [{"kind": "single", "text": "Ballsiz emas", "options": ["A", "B"], "points": 3}]}
    assert (await client.post("/api/v1/employer/tests", json=bad, headers=hr["headers"])).status_code == 422

    t = (await client.post("/api/v1/employer/tests", json=TEST, headers=hr["headers"])).json()
    assert t["status"] == "pending" and t["max_score"] == 20 and t["questions_count"] == 4
    assert (await client.get("/api/v1/tests", headers=student["headers"])).json() == []        # not approved yet
    assert (await client.get("/api/v1/admin/inbox", headers=admin)).json()["tests"] == 1

    r = await client.post(f"/api/v1/admin/tests/{t['id']}/review", json={"approve": False}, headers=admin)
    assert r.status_code == 422                                   # a rejection needs a reason
    r = await client.post(f"/api/v1/admin/tests/{t['id']}/review", json={"approve": True}, headers=admin)
    assert r.json()["status"] == "approved"

    listed = (await client.get("/api/v1/tests", headers=student["headers"])).json()
    assert [x["id"] for x in listed] == [t["id"]] and listed[0]["my_attempt"] is None
    started = (await client.post(f"/api/v1/tests/{t['id']}/start", headers=student["headers"])).json()
    assert all("correct" not in q for q in started["questions"]) and started["ends_at"]
    q = started["questions"]
    answers = [{"question_id": q[0]["id"], "choice": [1]}, {"question_id": q[1]["id"], "choice": [0]},
               {"question_id": q[2]["id"], "text": "Power BI dashboard qildim"}, {"question_id": q[3]["id"], "choice": [1]}]
    res = (await client.post(f"/api/v1/tests/{t['id']}/submit", json={"answers": answers}, headers=student["headers"])).json()
    assert res["status"] == "submitted" and res["score"] == 5 and res["max_score"] == 20      # multi was half right: 0
    assert all("correct" not in i["question"] for i in res["items"])
    assert (await client.post(f"/api/v1/tests/{t['id']}/start", headers=student["headers"])).status_code == 409

    # the questions are frozen once someone took the test
    assert (await client.put(f"/api/v1/employer/tests/{t['id']}", json=TEST, headers=hr["headers"])).status_code == 409

    results = (await client.get(f"/api/v1/employer/tests/{t['id']}/results", headers=hr["headers"])).json()
    assert results["test"]["to_grade"] == 1 and results["rows"][0]["student"]["full_name"] == "Aziza Yusupova"
    attempt_id = results["rows"][0]["attempt_id"]
    r = await client.post(f"/api/v1/employer/test-attempts/{attempt_id}/grade",
                          json={"grades": [{"question_id": q[2]["id"], "points": 11}]}, headers=hr["headers"])
    assert r.status_code == 422                                   # more than the question is worth
    graded = (await client.post(f"/api/v1/employer/test-attempts/{attempt_id}/grade",
                                json={"grades": [{"question_id": q[2]["id"], "points": 8, "comment": "Yaxshi"}],
                                      "feedback": "Suhbatga taklif qilamiz"}, headers=hr["headers"])).json()
    assert graded["status"] == "graded" and graded["score"] == 13

    mine = (await client.get(f"/api/v1/tests/{t['id']}/result", headers=student["headers"])).json()
    assert mine["score"] == 13 and mine["feedback"] == "Suhbatga taklif qilamiz"
    row = (await client.get("/api/v1/employer/students", params={"sort": "tests"}, headers=hr["headers"])).json()[0]
    assert row["tests_taken"] == 1 and row["test_percent"] == 65

    # another company cannot see these results
    other = await approved_employer(client, make_user, "HR boshqa", "302222222")
    assert (await client.get(f"/api/v1/employer/tests/{t['id']}/results", headers=other["headers"])).status_code == 404
    assert (await client.get(f"/api/v1/employer/test-attempts/{attempt_id}", headers=other["headers"])).status_code == 404


async def test_track_tests_reach_only_that_track(client, make_user):
    hr = await approved_employer(client, make_user)
    first = await full_student(client, make_user, "Birinchi Talaba", track_index=0)
    second = await full_student(client, make_user, "Ikkinchi Talaba", track_index=1)
    body = {**TEST, "audience": "tracks", "track_ids": [first["track_id"]], "submit": False}
    t = (await client.post("/api/v1/employer/tests", json=body, headers=hr["headers"])).json()
    assert t["status"] == "draft"
    admin = await owner(client)
    assert (await client.post(f"/api/v1/admin/tests/{t['id']}/review", json={"approve": True}, headers=admin)).status_code == 409
    t = (await client.put(f"/api/v1/employer/tests/{t['id']}", json={**body, "submit": True}, headers=hr["headers"])).json()
    await client.post(f"/api/v1/admin/tests/{t['id']}/review", json={"approve": True}, headers=admin)
    assert len((await client.get("/api/v1/tests", headers=first["headers"])).json()) == 1
    assert (await client.get("/api/v1/tests", headers=second["headers"])).json() == []
    assert (await client.post(f"/api/v1/tests/{t['id']}/start", headers=second["headers"])).status_code == 404

    # a survey (no points anywhere) is graded on submit
    survey = {"title": "Qisqa so'rovnoma", "audience": "all",
              "questions": [{"kind": "text", "text": "Qaysi shaharda ishlaysiz?"}]}
    s = (await client.post("/api/v1/employer/tests", json=survey, headers=hr["headers"])).json()
    assert s["is_survey"]
    await client.post(f"/api/v1/admin/tests/{s['id']}/review", json={"approve": True}, headers=admin)
    started = (await client.post(f"/api/v1/tests/{s['id']}/start", headers=second["headers"])).json()
    done = (await client.post(f"/api/v1/tests/{s['id']}/submit",
                              json={"answers": [{"question_id": started["questions"][0]["id"], "text": "Toshkent"}]},
                              headers=second["headers"])).json()
    assert done["status"] == "graded" and done["max_score"] == 0


# --------------------------------------------------------------------------- TalantGo AI for every audience

async def test_assistant_picks_the_guide_for_who_is_asking(client, make_user):
    from app.core.db import SessionLocal
    from app.models import User
    from app.services import assistant

    newcomer = await make_user("Yangi Odam")
    student = await full_student(client, make_user, "Talaba Bir")
    hr = await approved_employer(client, make_user)
    expected = {newcomer["id"]: "signup", student["id"]: "student", hr["id"]: "employer"}
    async with SessionLocal() as s:
        for uid, kind in expected.items():
            user = await s.get(User, uid)
            assert assistant.audience(user) == kind
            prompt = await assistant.system_prompt(s, user, ai_review_on=False)
            marker = {"signup": "To'ldirilmagan majburiy maydonlar", "student": "Talabaning holati",
                      "employer": "Kompaniya: Data Solutions MChJ; holati: tasdiqlangan"}[kind]
            assert marker in prompt, kind
    for u, kind in ((newcomer, "signup"), (hr, "employer")):
        assert (await client.get("/api/v1/assistant/status", headers=u["headers"])).json()["audience"] == kind
