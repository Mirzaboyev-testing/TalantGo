"""Student panel v2 (2026-11-17): the full university list with faculties, faculty editing by staff and admins,
job functions on students and vacancies, the open match formula and the optional track."""
from types import SimpleNamespace

from app.api.jobs import match_score
from tests.conftest import owner_headers as owner
from tests.test_career import uni_id
from tests.test_pipeline_and_inbox import API
from tests.test_signup_and_tests import full_student
from tests.test_university_panel import approved_staff


async def test_all_universities_and_faculties_are_seeded(client):
    unis = (await client.get(f"{API}/universities")).json()
    assert len(unis) >= 200
    by_short = {u["short_name"]: u for u in unis}
    assert "Dasturiy injiniring" in by_short["TATU"]["faculties"]
    assert len([u for u in unis if u["faculties"]]) >= 30
    assert len({u["name"].lower() for u in unis}) == len(unis)            # no university twice
    assert "O'zMPU" not in by_short                                      # the renamed TDPU is not added again


async def test_staff_and_admin_edit_the_faculty_list(client, make_user):
    staff = await approved_staff(client, make_user, "TDIU")
    r = await client.patch(f"{API}/university/profile", json={"faculties": ["  Raqamli   iqtisodiyot ", "raqamli iqtisodiyot",
                                                                         "Moliya", "x"]}, headers=staff["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["faculties"] == ["Raqamli iqtisodiyot", "Moliya"]   # trimmed, no repeats, too short dropped
    tdiu = next(u for u in (await client.get(f"{API}/universities")).json() if u["short_name"] == "TDIU")
    assert tdiu["faculties"] == ["Raqamli iqtisodiyot", "Moliya"]

    r = await client.patch(f"{API}/admin/universities/{await uni_id('TDIU')}", json={"faculties": ["Bank ishi", "Bank ishi"]},
                           headers=await owner(client))
    assert r.status_code == 200 and r.json()["faculties"] == ["Bank ishi"]


async def test_track_is_optional_and_can_be_picked_later(client, make_user):
    u = await full_student(client, make_user, "Lola Rahimova")
    r = await client.patch(f"{API}/me", json={"track_id": None}, headers=u["headers"])
    assert r.json()["track"] is None and r.json()["signup_missing"] == []
    assert "job_fields" not in r.json()["completeness"]["missing"]
    catalog = (await client.get(f"{API}/catalog")).json()
    assert "software" in catalog["job_fields"] and len(catalog["job_fields"]) >= 20


def test_match_formula_uses_job_function_type_and_field():
    student = SimpleNamespace(skills=["SQL", "Excel"], job_fields=["data"], job_types=["internship"],
                              work_industries=["bank"], track_id=None)
    job = SimpleNamespace(skills=["SQL", "Excel"], job_fields=["data"], track_ids=[], kind="internship",
                          company=SimpleNamespace(industry="bank"))
    assert match_score(job, student) == 100
    other = SimpleNamespace(skills=["Figma"], job_fields=["design"], track_ids=[], kind="junior",
                            company=SimpleNamespace(industry="it"))
    assert match_score(other, student) == 0
    # nothing on either side counts half, so an empty vacancy is not ranked above a matching one
    blank = SimpleNamespace(skills=[], job_fields=[], track_ids=[], kind="project", company=SimpleNamespace(industry=""))
    assert 0 < match_score(blank, student) < match_score(job, student)


# --------------------------------------------------------------------------- phase 2: profile and portfolio

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


async def test_photo_cover_and_media_links(client, make_user):
    from tests.test_career import upload_doc
    u = await full_student(client, make_user, "Dilnoza Aliyeva")
    pic = await upload_doc(client, u["headers"], "men.png", PNG)
    me = (await client.put(f"{API}/me/photo", json={"file_id": pic}, headers=u["headers"])).json()
    assert me["photo_url"].startswith(f"{API}/media/{pic}?s=") and me["has_photo_upload"]
    assert "photo" not in me["completeness"]["missing"]
    assert (await client.get(me["photo_url"])).status_code == 200                     # no sign-in needed
    assert (await client.get(f"{API}/media/{pic}?s=wrong")).status_code == 403
    pdf = await upload_doc(client, u["headers"])
    assert (await client.put(f"{API}/me/cover", json={"file_id": pdf}, headers=u["headers"])).status_code == 422
    cover = await upload_doc(client, u["headers"], "muqova.png", PNG)
    me = (await client.put(f"{API}/me/cover", json={"file_id": cover}, headers=u["headers"])).json()
    assert me["cover_url"]
    # someone else's file cannot be used
    other = await full_student(client, make_user, "Boshqa Talaba")
    assert (await client.put(f"{API}/me/photo", json={"file_id": pic}, headers=other["headers"])).status_code == 422
    me = (await client.put(f"{API}/me/photo", json={"file_id": None}, headers=u["headers"])).json()
    assert me["photo_url"] is None


async def test_projects_certificates_and_experience(client, make_user):
    from tests.test_career import upload_doc
    u = await full_student(client, make_user, "Jasur Toshev")
    me = (await client.get(f"{API}/me", headers=u["headers"])).json()
    assert "portfolio" in me["completeness"]["missing"]
    shot = await upload_doc(client, u["headers"], "dashboard.png", PNG)
    r = await client.post(f"{API}/me/portfolio", json={
        "kind": "project", "title": "Savdo dashboardi", "org": "Kurs ishi", "date_from": "2026-03-01", "date_to": "2026-04-15",
        "description": "Power BI'da savdo tahlili", "link": "github.com/jasur/sales", "skills": ["Power BI", "SQL", "SQL"],
        "cover_id": shot}, headers=u["headers"])
    assert r.status_code == 201, r.text
    p = r.json()["projects"][0]
    assert p["trust"] == "self" and p["skills"] == ["Power BI", "SQL"] and p["link"].startswith("https://")
    assert p["cover_url"].startswith(f"{API}/media/")
    bad = await client.post(f"{API}/me/portfolio", json={"kind": "project", "title": "X loyiha", "date_from": "2026-05-01",
                                                          "date_to": "2026-04-01"}, headers=u["headers"])
    assert bad.status_code == 422
    r = await client.post(f"{API}/me/portfolio", json={"kind": "certificate", "title": "IELTS 7.0", "org": "British Council",
                                                       "date_from": "2025-12-10", "credential_id": "25UZ001"}, headers=u["headers"])
    assert r.json()["certificates"][0]["org"] == "British Council"

    job = (await client.post(f"{API}/me/outcomes", json={"company_name": "Kafe Bahor", "position": "Kassir", "kind": "part_time",
                                                         "started_on": "2025-06-01", "ended_on": "2025-08-31",
                                                         "description": "Yozgi ish"}, headers=u["headers"])).json()
    assert job["ended_on"] == "2025-08-31" and job["trust"] == "self"
    r = await client.patch(f"{API}/me/outcomes/{job['id']}", json={"description": "Yozgi ish, kassa va hisobot"},
                           headers=u["headers"])
    assert r.json()["description"] == "Yozgi ish, kassa va hisobot"

    me = (await client.get(f"{API}/me", headers=u["headers"])).json()
    assert me["portfolio_n"] == 3 and "portfolio" not in me["completeness"]["missing"]
    cv = (await client.get(f"{API}/me/cv", headers=u["headers"])).json()
    assert cv["projects"][0]["title"] == "Savdo dashboardi" and cv["experience"][0]["company"] == "Kafe Bahor"

    pid = cv["projects"][0]["id"]
    r = await client.delete(f"{API}/me/portfolio/{pid}", headers=u["headers"])
    assert r.json()["projects"] == []
    assert (await client.get(f"{API}/me", headers=u["headers"])).json()["portfolio_n"] == 2
    other = await full_student(client, make_user, "Boshqa Talaba")
    cert = r.json()["certificates"][0]["id"]
    assert (await client.delete(f"{API}/me/portfolio/{cert}", headers=other["headers"])).status_code == 404


# --------------------------------------------------------------------------- phase 3: messages, events, task files, filters

async def test_chat_opens_only_after_an_application_and_the_student_can_close_it(client, make_user):
    from tests.test_career import make_student
    from tests.test_pipeline_and_inbox import applied_student, live_job
    hr, job = await live_job(client, make_user)
    stranger = await make_student(client, make_user, "Begona Talaba")
    r = await client.post(f"{API}/employer/chats", json={"student_id": stranger["id"]}, headers=hr["headers"])
    assert r.status_code == 403                                          # no application, no accepted request
    student = await applied_student(client, make_user, job, "Dilnoza")
    r = await client.post(f"{API}/employer/chats", json={"student_id": student["id"]}, headers=hr["headers"])
    assert r.status_code == 201, r.text
    tid = r.json()["thread"]["id"]
    r = await client.post(f"{API}/employer/chats/{tid}/messages", json={"text": "Salom! Ertaga suhbatga kela olasizmi?"},
                          headers=hr["headers"])
    assert r.status_code == 201 and r.json()["side"] == "company"
    assert (await client.get(f"{API}/me/chats/unread", headers=student["headers"])).json() == {"unread": 1}
    notes = (await client.get(f"{API}/me/notifications", headers=student["headers"])).json()["items"]
    assert notes[0]["kind"] == "chat_message" and notes[0]["link"] == f"/talaba/xabarlar?c={tid}"
    mine = (await client.get(f"{API}/me/chats", headers=student["headers"])).json()
    assert mine["threads"][0]["company"] == "Data Solutions MChJ" and mine["threads"][0]["unread"] == 1
    thread = (await client.get(f"{API}/me/chats/{tid}", headers=student["headers"])).json()
    assert [m["text"] for m in thread["messages"]] == ["Salom! Ertaga suhbatga kela olasizmi?"]
    assert (await client.get(f"{API}/me/chats/unread", headers=student["headers"])).json() == {"unread": 0}
    await client.post(f"{API}/me/chats/{tid}/messages", json={"text": "Ha, albatta"}, headers=student["headers"])
    assert (await client.get(f"{API}/employer/chats/unread", headers=hr["headers"])).json() == {"unread": 1}
    # closed by the student: the company cannot write until the student writes again
    await client.post(f"{API}/me/chats/{tid}/close", json={"closed": True}, headers=student["headers"])
    assert (await client.post(f"{API}/employer/chats/{tid}/messages", json={"text": "Yana bir savol"},
                              headers=hr["headers"])).status_code == 409
    other_hr, _ = await live_job(client, make_user, stir="309999999", name="HR Boshqa")
    assert (await client.get(f"{API}/employer/chats/{tid}", headers=other_hr["headers"])).status_code == 404
    assert (await client.get(f"{API}/me/chats/{tid}", headers=stranger["headers"])).status_code == 404


async def test_company_events_reach_every_student_and_show_registrations(client, make_user):
    from datetime import UTC, datetime, timedelta
    from tests.test_career import make_student
    from tests.test_pipeline_and_inbox import live_job
    hr, _ = await live_job(client, make_user)
    when = (datetime.now(UTC) + timedelta(days=5)).isoformat()
    r = await client.post(f"{API}/employer/events", json={"title": "Ochiq eshiklar kuni", "kind": "open_day",
                                                          "starts_at": when, "location": "Toshkent, Amir Temur 1", "capacity": 1},
                          headers=hr["headers"])
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    a = await make_student(client, make_user, "Aziza")
    b = await make_student(client, make_user, "Bekzod")
    events = (await client.get(f"{API}/me/events", headers=a["headers"])).json()
    assert events[0]["organiser"] == "company" and events[0]["organiser_name"] == "Data Solutions MChJ"
    assert (await client.post(f"{API}/me/events/{eid}/register", headers=a["headers"])).status_code == 201
    assert (await client.post(f"{API}/me/events/{eid}/register", headers=b["headers"])).status_code == 409   # capacity 1
    regs = (await client.get(f"{API}/employer/events/{eid}/registrations", headers=hr["headers"])).json()
    assert [x["full_name"] for x in regs] == ["Aziza"]
    mine = (await client.get(f"{API}/me/events?scope=mine", headers=a["headers"])).json()
    assert [e["id"] for e in mine] == [eid] and mine[0]["me_registered"]
    await client.post(f"{API}/employer/events/{eid}/cancel", headers=hr["headers"])
    notes = (await client.get(f"{API}/me/notifications", headers=a["headers"])).json()["items"]
    assert notes[0]["kind"] == "event_cancelled"
    # the university panel's own list is not affected by company events
    staff = await approved_staff(client, make_user, "TDIU")
    assert (await client.get(f"{API}/university/events", headers=staff["headers"])).json() == []


async def test_task_entry_with_files_and_job_filters(client, make_user):
    from datetime import date, timedelta
    from tests.test_career import make_student, upload_doc
    from tests.test_pipeline_and_inbox import live_job
    hr, job = await live_job(client, make_user)
    task = (await client.post(f"{API}/employer/tasks", json={
        "title": "Savdo tahlili", "description": "Ilova qilingan jadval bo'yicha oylik savdoni tahlil qiling va xulosa yozing.",
        "points": 20, "ends_on": (date.today() + timedelta(days=7)).isoformat()}, headers=hr["headers"])).json()
    s = await make_student(client, make_user, "Aziza")
    assert (await client.post(f"{API}/challenges/{task['id']}/enter", json={"note": "Tayyor"},
                              headers=s["headers"])).status_code == 422          # neither a link nor a file
    xlsx = await upload_doc(client, s["headers"], "tahlil.xlsx", b"PK\x03\x04 fake xlsx")
    r = await client.post(f"{API}/challenges/{task['id']}/enter", json={"file_ids": [xlsx], "note": "Tayyor"}, headers=s["headers"])
    assert r.status_code == 201, r.text
    url = r.json()["files"][0]["url"]
    got = await client.get(url)
    assert got.status_code == 200 and "attachment" in got.headers["content-disposition"]     # a spreadsheet downloads
    entries = (await client.get(f"{API}/employer/tasks/{task['id']}/entries", headers=hr["headers"])).json()
    assert entries[0]["files"][0]["url"] == url

    await client.patch(f"{API}/me", json={"job_fields": ["data"], "skills": ["SQL", "Power BI", "Excel"]}, headers=s["headers"])
    jobs = (await client.get(f"{API}/jobs?field=design", headers=s["headers"])).json()
    assert jobs == []
    assert len((await client.get(f"{API}/jobs?sort=new", headers=s["headers"])).json()) == 1
