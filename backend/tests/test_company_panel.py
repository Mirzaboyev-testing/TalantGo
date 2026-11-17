"""Company sign-up in steps (role, documents, logo, cooperation), the waiting screen, sidebar counters and the
richer company dashboard."""
from tests.conftest import owner_headers as owner
from tests.test_career import COMPANY, EMPLOYER, employer_body, make_employer, upload_doc
from tests.test_pipeline_and_inbox import applied_student, live_job
from tests.test_signup_and_tests import full_student

API = "/api/v1"
PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
       b"\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82")


async def test_sign_up_keeps_role_documents_logo_and_cooperation(client, make_user):
    hr = await make_user("HR Vakil")
    h = hr["headers"]
    await client.patch(f"{API}/me", json={"phone": "+998901234567"}, headers=h)
    letter = await upload_doc(client, h, "ishonchnoma.pdf")
    logo = await upload_doc(client, h, "logo.png", PNG)
    body = await employer_body(client, h, contact_role="representative", authority_doc_id=letter, logo_file_id=logo,
                               ownership="foreign", cooperation=["internship", "hackathon", "internship"],
                               wanted_track_ids=[1], show_as_partner=True)

    # someone else's file, a spreadsheet as the document, a PDF as the logo: refused
    other = await make_user("Begona")
    foreign = await upload_doc(client, other["headers"])
    for wrong in ({"registration_doc_id": foreign}, {"registration_doc_id": await upload_doc(client, h, "a.xlsx", b"x")},
                  {"logo_file_id": await upload_doc(client, h, "logo.pdf")}):
        assert (await client.post(f"{API}/me/company", json={**body, **wrong}, headers=h)).status_code == 422, wrong

    me = (await client.post(f"{API}/me/company", json=body, headers=h)).json()
    c = me["company"]
    assert c["contact_role"] == "representative" and c["ownership"] == "foreign" and c["show_as_partner"]
    assert c["cooperation"] == ["internship", "hackathon"] and c["wanted_track_ids"] == [1]
    assert c["authority_doc_id"] == letter and c["logo_file_id"] == logo and c["submitted_at"]
    assert c["logo_url"].startswith(f"{API}/files/{logo}/")             # signed while the company waits

    docs = (await client.get(f"{API}/employer/company/documents", headers=h)).json()
    assert {d["kind"] for d in docs} == {"registration", "authority", "logo"}


    # the logo is public only after the admin check
    assert (await client.get(f"{API}/public/companies/{c['id']}/logo")).status_code == 404
    await client.post(f"{API}/admin/companies/{c['id']}/review", json={"approve": True, "note": ""}, headers=await owner(client))
    me = (await client.get(f"{API}/me", headers=h)).json()
    assert me["company"]["reviewed_at"] and me["company"]["logo_url"] == f"{API}/public/companies/{c['id']}/logo?v={logo}"
    r = await client.get(f"{API}/public/companies/{c['id']}/logo")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    listed = (await client.get(f"{API}/public/companies/{c['id']}")).json()
    assert listed["logo_url"] and "stir" not in listed


async def test_waiting_company_sees_its_place_in_the_queue_and_the_students_it_will_reach(client, make_user):
    await full_student(client, make_user, "Vali Karimov")          # works in fintech and bank
    first = await make_employer(client, make_user, "HR Birinchi", "301111111")
    second = await make_employer(client, make_user, "HR Ikkinchi", "302222222")
    s = (await client.get(f"{API}/employer/review-status", headers=second["headers"])).json()
    assert s["status"] == "pending" and s["queue_position"] == 2 and s["typical_hours"] is None
    assert s["students"] == 1 and s["in_industry"] == 0 and s["documents"][0]["kind"] == "registration"
    assert (await client.get(f"{API}/employer/review-status", headers=first["headers"])).json()["queue_position"] == 1

    # a rejected company fixes its data: back in the queue with a new submission time
    admin = await owner(client)
    await client.post(f"{API}/admin/companies/{first['company_id']}/review", json={"approve": False, "note": "Hujjat xira"},
                      headers=admin)
    s = (await client.get(f"{API}/employer/review-status", headers=first["headers"])).json()
    assert s["status"] == "rejected" and s["review_note"] == "Hujjat xira" and s["queue_position"] is None
    c = (await client.patch(f"{API}/employer/company", json={**COMPANY, "stir": "301111111", "industry": "fintech"},
                            headers=first["headers"])).json()
    assert c["status"] == "pending" and c["cooperation"] == ["internship", "projects"]   # fields left out are kept
    assert c["registration_doc_id"]                          # an edit without the file fields keeps the document
    s = (await client.get(f"{API}/employer/review-status", headers=first["headers"])).json()
    assert s["queue_position"] == 2 and s["in_industry"] == 1

    # the admin list shows who signed up and the documents
    rows = (await client.get(f"{API}/admin/companies?status=pending", headers=admin)).json()
    row = next(r for r in rows if r["id"] == second["company_id"])
    assert row["contact"]["full_name"] == "Nigora Karimova" and row["contact"]["phone"] == "+998901234567"
    assert row["documents"][0]["url"].startswith(f"{API}/files/")


async def test_counters_and_dashboard_extras(client, make_user):
    hr, job = await live_job(client, make_user)
    h = hr["headers"]
    await applied_student(client, make_user, job, name="Aziza")

    n = (await client.get(f"{API}/employer/counters", headers=h)).json()
    assert n["new_applications"] == 1 and n["to_grade"] == 0 and n["to_review"] == 0 and n["rejected_jobs"] == 0

    d = (await client.get(f"{API}/employer/dashboard?days=7", headers=h)).json()
    assert len(d["trend"]) == 7 and d["trend"][-1]["applications"] == 1 and d["trend_step"] == 1
    assert d["previous"] == {"received": 0, "hired": 0}
    assert d["top_jobs"][0]["applications"] == 1 and d["universities"][0]["applications"] == 1
    assert d["first_steps"]["job"] and not d["first_steps"]["task"] and 0 <= d["profile"]["percent"] <= 100
    assert len((await client.get(f"{API}/employer/dashboard?days=365", headers=h)).json()["trend"]) == 52

    c = (await client.get(f"{API}/employer/applications", headers=h)).json()
    assert c["stages"] == {"new": 1}

    # counters need an approved company
    waiting = await make_employer(client, make_user, "HR Kutayotgan", "309999999")
    assert (await client.get(f"{API}/employer/counters", headers=waiting["headers"])).status_code == 403
    assert EMPLOYER["contact_role"] == "director"


async def test_admin_csv_exports_do_not_run_typed_text_as_formulas(client, make_user):
    await make_user("=HYPERLINK(\"http://evil\")")
    body = (await client.get(f"{API}/admin/export/users.csv", headers=await owner(client))).text
    assert "'=HYPERLINK" in body and "\n=HYPERLINK" not in body


async def test_company_sees_student_telegram_only_after_application(client, make_user):
    """The CV in the student sheet and the PDF link leave the Telegram username out until the student applies."""
    from urllib.parse import parse_qs, urlparse
    from app.core.db import SessionLocal
    from app.core.security import read_token
    from app.models import User
    hr, job = await live_job(client, make_user)
    student = await full_student(client, make_user, "Vali Karimov")
    async with SessionLocal() as s:
        (await s.get(User, student["id"])).username = "vali_tg"
        await s.commit()

    def scope_ok(url: str, scope: str) -> bool:
        return read_token(parse_qs(urlparse(url).query)["t"][0], scope) == str(student["id"])

    d = (await client.get(f"{API}/employer/students/{student['id']}", headers=hr["headers"])).json()
    assert d["username"] is None and d["cv"]["username"] is None
    link = (await client.get(f"{API}/employer/students/{student['id']}/cv-link", headers=hr["headers"])).json()["url"]
    assert scope_ok(link, "cvpdf-anon") and not scope_ok(link, "cvpdf")

    await client.post(f"{API}/me/verification", headers=student["headers"])      # applying needs a verification request
    r = await client.post(f"{API}/jobs/{job['id']}/apply", json={"note": "Qiziqaman"}, headers=student["headers"])
    assert r.status_code == 201, r.text
    d = (await client.get(f"{API}/employer/students/{student['id']}", headers=hr["headers"])).json()
    assert d["username"] == "vali_tg" and d["cv"]["username"] == "vali_tg"
    link = (await client.get(f"{API}/employer/students/{student['id']}/cv-link", headers=hr["headers"])).json()["url"]
    assert scope_ok(link, "cvpdf")
