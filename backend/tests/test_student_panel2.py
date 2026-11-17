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
