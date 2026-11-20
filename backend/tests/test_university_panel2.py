"""University panel v2: staff request in detail, admin and lead decisions, team, student table with filters,
student card, bulk verification, exports, profile, messages, events and the companies directory."""
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import University, UniversityEvent, User
from tests.conftest import owner_headers as owner
from tests.test_career import make_student, uni_id, upload_doc
from tests.test_pipeline_and_inbox import API, live_job
from tests.test_university_panel import approved_staff


async def verified(*users: dict) -> None:
    """The university confirmed these students: only then its student-only announcements and events reach them."""
    async with SessionLocal() as s:
        for u in users:
            (await s.get(User, u["id"])).verification = "verified"
        await s.commit()


async def staff_form(client, make_user, name="Aziza Karimova", short="TDIU", **extra) -> dict:
    """A person who fills in the full website form (phone, document, cooperation, pledge)."""
    u = await make_user(name)
    await client.patch(f"{API}/me", json={"phone": "+998901234567"}, headers=u["headers"])
    doc = await upload_doc(client, u["headers"], "buyruq.pdf")
    body = {"university_id": await uni_id(short) if short else None, "position": "career_head", "full_name": name,
            "department": "Karyera markazi", "work_email": "karyera@tdiu.uz", "doc_id": doc,
            "cooperation": ["verify_students", "job_fair", "nonsense"], "telegram": "@tdiu_career",
            "data_pledge": True, **extra}
    r = await client.post(f"{API}/me/staff-request", json=body, headers=u["headers"])
    u["response"] = r
    return u


async def test_detailed_request_needs_info_resend_and_approval_makes_a_lead(client, make_user):
    u = await staff_form(client, make_user)
    assert u["response"].status_code == 201, u["response"].text
    me = u["response"].json()
    assert me["staff_status"] == "pending" and me["staff"]["cooperation"] == ["verify_students", "job_fair"]
    assert me["staff"]["doc"]["name"] == "buyruq.pdf" and me["staff"]["decided_by_lead"] is False

    admin = await owner(client)
    rows = (await client.get(f"{API}/admin/staff", headers=admin)).json()
    row = next(r for r in rows if r["id"] == u["id"])
    assert row["phone"] == "+998901234567" and row["work_email"] == "karyera@tdiu.uz" and row["doc"]["url"]

    # a question back to the person: note required, then they send it again
    assert (await client.post(f"{API}/admin/staff/{u['id']}/review", json={"decision": "needs_info"},
                              headers=admin)).status_code == 422
    r = await client.post(f"{API}/admin/staff/{u['id']}/review",
                          json={"decision": "needs_info", "note": "Buyruq sahifasi o'qilmaydi"}, headers=admin)
    assert r.json()["status"] == "needs_info"
    me = (await client.get(f"{API}/me", headers=u["headers"])).json()
    assert me["staff_status"] == "needs_info" and me["staff"]["review_note"] == "Buyruq sahifasi o'qilmaydi"
    # sending again without a new file keeps the earlier document
    again = await client.post(f"{API}/me/staff-request", json={
        "university_id": await uni_id("TDIU"), "position": "career_head", "full_name": "Aziza Karimova",
        "cooperation": ["verify_students"], "telegram": "@tdiu_career", "data_pledge": True}, headers=u["headers"])
    assert again.status_code == 201 and again.json()["staff_status"] == "pending"
    assert again.json()["staff"]["doc"] is not None

    r = await client.post(f"{API}/admin/staff/{u['id']}/review", json={"decision": "approve"}, headers=admin)
    assert r.json() == {"status": "approved", "role": "lead"}
    prof = (await client.get(f"{API}/university/profile", headers=u["headers"])).json()
    assert prof["telegram"] == "@tdiu_career"                 # filled from the request on approval
    assert (await client.get(f"{API}/university/dashboard", headers=u["headers"])).json()["role"] == "lead"


async def test_form_requires_document_pledge_and_phone(client, make_user):
    u = await make_user("Telefonsiz")
    body = {"university_id": await uni_id("TDIU"), "position": "career_staff", "full_name": "Telefonsiz Xodim",
            "cooperation": ["verify_students"], "data_pledge": True}
    assert (await client.post(f"{API}/me/staff-request", json=body, headers=u["headers"])).status_code == 422
    await client.patch(f"{API}/me", json={"phone": "+998901112233"}, headers=u["headers"])
    r = await client.post(f"{API}/me/staff-request", json=body, headers=u["headers"])
    assert r.status_code == 422 and "hujjat" in r.text


async def test_new_university_waits_and_is_activated_on_approval(client, make_user):
    u = await staff_form(client, make_user, short=None, new_university="Yangi Texnologiyalar Universiteti",
                         new_university_region="Samarqand")
    assert u["response"].status_code == 201, u["response"].text
    async with SessionLocal() as s:
        uni = (await s.execute(select(University).where(University.name == "Yangi Texnologiyalar Universiteti"))).scalar_one()
        assert uni.is_active is False and uni.region == "Samarqand"
    names = [x["name"] for x in (await client.get(f"{API}/universities")).json()]
    assert "Yangi Texnologiyalar Universiteti" not in names           # not offered to students until checked
    admin = await owner(client)
    row = next(r for r in (await client.get(f"{API}/admin/staff", headers=admin)).json() if r["id"] == u["id"])
    assert row["new_university"] is True
    await client.post(f"{API}/admin/staff/{u['id']}/review", json={"decision": "approve"}, headers=admin)
    names = [x["name"] for x in (await client.get(f"{API}/universities")).json()]
    assert "Yangi Texnologiyalar Universiteti" in names


async def test_lead_decides_on_colleagues_and_manages_the_team(client, make_user):
    lead = await approved_staff(client, make_user, name="Rahbar")
    colleague = await staff_form(client, make_user, name="Hamkasb Bir")
    me = colleague["response"].json()
    assert me["staff"]["decided_by_lead"] is True and me["staff"]["leads"] == ["Rahbar"]
    notes = (await client.get(f"{API}/me/notifications", headers=lead["headers"])).json()
    assert any(n["kind"] == "staff_request" for n in notes["items"])

    team = (await client.get(f"{API}/university/team", headers=lead["headers"])).json()
    assert {r["full_name"]: r["status"] for r in team["rows"]} == {"Rahbar": "approved", "Hamkasb Bir": "pending"}
    r = await client.post(f"{API}/university/team/{colleague['id']}/decide", json={"decision": "approve"}, headers=lead["headers"])
    assert r.status_code == 200 and r.json()["role"] == "member"
    # a member cannot decide; the lead can make them lead too, then step down
    other = await staff_form(client, make_user, name="Hamkasb Ikki")
    assert (await client.post(f"{API}/university/team/{other['id']}/decide", json={"decision": "approve"},
                              headers=colleague["headers"])).status_code == 403
    assert (await client.post(f"{API}/university/team/{lead['id']}/role", json={"role": "member"},
                              headers=lead["headers"])).status_code == 409          # the only lead
    await client.post(f"{API}/university/team/{colleague['id']}/role", json={"role": "lead"}, headers=lead["headers"])
    assert (await client.post(f"{API}/university/team/{lead['id']}/role", json={"role": "member"},
                              headers=lead["headers"])).json()["role"] == "member"
    # the new lead takes access away from someone who left
    await client.post(f"{API}/university/team/{other['id']}/decide", json={"decision": "approve"}, headers=colleague["headers"])
    r = await client.post(f"{API}/university/team/{other['id']}/revoke", json={"note": "Ishdan ketdi"}, headers=colleague["headers"])
    assert r.json()["status"] == "rejected"
    assert (await client.get(f"{API}/university/dashboard", headers=other["headers"])).status_code == 403


async def test_roster_filters_facets_detail_bulk_and_export(client, make_user):
    staff = await approved_staff(client, make_user)
    a = await make_student(client, make_user, "Ali Valiyev")
    b = await make_student(client, make_user, "Bobur Karimov", open_to_work=False)
    c = await make_student(client, make_user, "Charos Olimova")
    await client.patch(f"{API}/me", json={"faculty": "Moliya", "course": 2, "group_name": "M-21"}, headers=c["headers"])
    for s in (a, b, c):
        await client.post(f"{API}/me/verification", headers=s["headers"])
    h = staff["headers"]

    page = (await client.get(f"{API}/university/roster", params={"verification": "pending", "sort": "name"}, headers=h)).json()
    assert page["total"] == 3 and [r["full_name"] for r in page["items"]] == ["Ali Valiyev", "Bobur Karimov", "Charos Olimova"]
    only = (await client.get(f"{API}/university/roster", params={"faculty": "Moliya"}, headers=h)).json()
    assert [r["full_name"] for r in only["items"]] == ["Charos Olimova"]
    ready = (await client.get(f"{API}/university/roster", params={"open_to_work": "true", "faculty": "Iqtisodiyot"}, headers=h)).json()
    assert [r["full_name"] for r in ready["items"]] == ["Ali Valiyev"]
    paged = (await client.get(f"{API}/university/roster", params={"limit": 5, "page": 2}, headers=h)).json()
    assert paged["items"] == [] and paged["total"] == 3

    facets = (await client.get(f"{API}/university/roster/facets", headers=h)).json()
    assert {f["value"]: f["count"] for f in facets["faculties"]} == {"Iqtisodiyot": 2, "Moliya": 1}
    assert facets["counts"]["pending"] == 3 and facets["groups"] == [{"value": "M-21", "count": 1}]

    card = (await client.get(f"{API}/university/students/{a['id']}", headers=h)).json()
    assert card["skills"] == ["SQL", "Excel", "Power BI"] and card["applications_list"] == []
    stranger = await make_user("Begona")
    assert (await client.get(f"{API}/university/students/{stranger['id']}", headers=h)).status_code == 404

    assert (await client.post(f"{API}/university/verifications/bulk", json={"ids": [b["id"]], "approve": False},
                              headers=h)).status_code == 422
    r = await client.post(f"{API}/university/verifications/bulk", json={"ids": [a["id"], c["id"], stranger["id"]], "approve": True},
                          headers=h)
    assert r.json() == {"done": 2, "skipped": 1}
    verified = (await client.get(f"{API}/university/roster", params={"verification": "verified"}, headers=h)).json()
    assert verified["total"] == 2

    csv = (await client.get(f"{API}/university/export.csv", params={"faculty": "Moliya"}, headers=h)).text
    assert "Charos Olimova" in csv and "Ali Valiyev" not in csv
    fac = (await client.get(f"{API}/university/faculties", headers=h)).json()
    assert {r["faculty"]: (r["students"], r["verified"]) for r in fac} == {"Iqtisodiyot": (2, 1), "Moliya": (1, 1)}
    assert "Fakultet" in (await client.get(f"{API}/university/faculties.csv", headers=h)).text


async def test_profile_dashboard_todo_and_logo(client, make_user):
    staff = await approved_staff(client, make_user)
    h = staff["headers"]
    dash = (await client.get(f"{API}/university/dashboard", headers=h)).json()
    assert "logo" in dash["todo"]["profile_missing"] and len(dash["signups_weekly"]) == 8
    logo = (await client.post(f"{API}/uploads", files={"file": ("logo.png", b"\x89PNG\r\n\x1a\n" + b"0" * 64)}, headers=h)).json()
    r = await client.patch(f"{API}/university/profile", json={
        "description": "Toshkent davlat iqtisodiyot universiteti: iqtisodchilar va moliyachilar tayyorlaydi.",
        "telegram": "@tdiu", "email": "info@tdiu.uz", "students_total": 18000, "cooperation": ["job_fair", "x"],
        "logo_id": logo["id"]}, headers=h)
    assert r.status_code == 200, r.text
    prof = r.json()
    assert prof["students_total"] == 18000 and prof["cooperation"] == ["job_fair"] and prof["logo_url"]
    assert "logo" not in prof["missing"] and "description" not in prof["missing"]
    assert (await client.get(prof["logo_url"])).status_code == 200


async def test_messages_reach_only_the_chosen_students(client, make_user):
    staff = await approved_staff(client, make_user)
    a = await make_student(client, make_user, "Ali Valiyev")
    c = await make_student(client, make_user, "Charos Olimova")
    await client.patch(f"{API}/me", json={"faculty": "Moliya"}, headers=c["headers"])
    await verified(a, c)
    h = staff["headers"]
    assert (await client.post(f"{API}/university/announcements/preview", json={"faculty": "Moliya"}, headers=h)).json() == {"recipients": 1, "companies": 0}
    r = await client.post(f"{API}/university/announcements", json={
        "title": "Karyera kuni", "text": "Ertaga soat 10:00 da katta zalda", "audience": {"faculty": "Moliya"}}, headers=h)
    assert r.status_code == 201 and r.json()["recipients"] == 1
    assert (await client.post(f"{API}/university/announcements", json={"title": "Tashqi", "text": "Havola tekshiruvi",
                                                                       "link": "http://evil.example"}, headers=h)).status_code == 422
    feed_c = (await client.get(f"{API}/me/university/feed", headers=c["headers"])).json()
    feed_a = (await client.get(f"{API}/me/university/feed", headers=a["headers"])).json()
    assert [x["title"] for x in feed_c["announcements"]] == ["Karyera kuni"] and feed_a["announcements"] == []
    assert len((await client.get(f"{API}/university/announcements", headers=h)).json()) == 1


async def test_events_signup_capacity_cancel_and_attendance(client, make_user):
    staff = await approved_staff(client, make_user)
    a = await make_student(client, make_user, "Ali Valiyev")
    b = await make_student(client, make_user, "Bobur Karimov")
    await verified(a, b)
    h = staff["headers"]
    start = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    r = await client.post(f"{API}/university/events", json={"title": "Ish yarmarkasi", "kind": "job_fair", "starts_at": start,
                                                           "location": "Asosiy bino", "capacity": 1}, headers=h)
    assert r.status_code == 201, r.text
    event = r.json()
    assert event["notified"] == 2
    feed = (await client.get(f"{API}/me/university/feed", headers=a["headers"])).json()
    assert feed["events"][0]["title"] == "Ish yarmarkasi" and feed["events"][0]["me_registered"] is False
    assert (await client.post(f"{API}/me/university/events/{event['id']}/register", headers=a["headers"])).status_code == 201
    assert (await client.post(f"{API}/me/university/events/{event['id']}/register", headers=b["headers"])).status_code == 409
    regs = (await client.get(f"{API}/university/events/{event['id']}/registrations", headers=h)).json()
    assert [x["full_name"] for x in regs] == ["Ali Valiyev"]
    await client.post(f"{API}/university/events/{event['id']}/attendance", json={"user_ids": [a["id"]], "attended": True}, headers=h)
    listed = (await client.get(f"{API}/university/events", headers=h)).json()
    assert listed[0]["registered"] == 1 and listed[0]["attended"] == 1
    assert "Ali Valiyev" in (await client.get(f"{API}/university/events/{event['id']}/registrations.csv", headers=h)).text
    assert (await client.post(f"{API}/university/events/{event['id']}/cancel", headers=h)).json()["status"] == "cancelled"
    assert (await client.delete(f"{API}/me/university/events/{event['id']}/register", headers=a["headers"])).status_code == 200


async def test_companies_directory_and_targeted_recommendation(client, make_user):
    hr, job = await live_job(client, make_user)
    staff = await approved_staff(client, make_user)
    a = await make_student(client, make_user, "Ali Valiyev")
    c = await make_student(client, make_user, "Charos Olimova")
    await client.patch(f"{API}/me", json={"faculty": "Moliya"}, headers=c["headers"])
    async with SessionLocal() as s:
        for uid in (a["id"], c["id"]):
            (await s.get(User, uid)).verification = "verified"
        await s.commit()
    h = staff["headers"]
    rows = (await client.get(f"{API}/university/companies", headers=h)).json()
    assert rows[0]["name"] == "Data Solutions MChJ" and rows[0]["open_jobs"] == 1 and rows[0]["partnership"] is None
    r = await client.post(f"{API}/university/jobs/{job['id']}/recommend", json={"note": "", "faculty": "Moliya"}, headers=h)
    assert r.json()["students"] == 1


# --------------------------------------------------------------------------- review round before the push (2026-11-17)

async def test_university_never_sees_student_contacts_and_csv_cannot_run_formulas(client, make_user):
    staff = await approved_staff(client, make_user)
    a = await make_student(client, make_user, "Ali Valiyev")
    async with SessionLocal() as s:
        u = await s.get(User, a["id"])
        u.phone, u.email, u.username, u.group_name = "+998901110000", "ali@mail.uz", "ali_tg", "=HYPERLINK(\"http://x\")"
        u.verification = "verified"              # registers for the university's event below
        await s.commit()
    h = staff["headers"]
    row = (await client.get(f"{API}/university/roster", headers=h)).json()["items"][0]
    assert not {"phone", "email", "username"} & row.keys()
    card = (await client.get(f"{API}/university/students/{a['id']}", headers=h)).json()
    assert not {"phone", "email", "username"} & card.keys()
    # the Telegram handle is not a search key either
    assert (await client.get(f"{API}/university/roster", params={"q": "ali_tg"}, headers=h)).json()["total"] == 0
    csv = (await client.get(f"{API}/university/export.csv", headers=h)).text
    assert "+998901110000" not in csv and "ali@mail.uz" not in csv and "Telefon" not in csv
    assert "'=HYPERLINK" in csv

    start = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    event = (await client.post(f"{API}/university/events", json={"title": "Karyera kuni", "starts_at": start}, headers=h)).json()
    await client.post(f"{API}/me/university/events/{event['id']}/register", headers=a["headers"])
    regs = (await client.get(f"{API}/university/events/{event['id']}/registrations", headers=h)).json()
    assert len(regs) == 1 and "phone" not in regs[0]
    regs_csv = (await client.get(f"{API}/university/events/{event['id']}/registrations.csv", headers=h)).text
    assert "+998901110000" not in regs_csv and "'=HYPERLINK" in regs_csv


async def test_message_links_stay_inside_the_app(client, make_user):
    staff = await approved_staff(client, make_user)
    await verified(await make_student(client, make_user, "Ali Valiyev"))
    h = staff["headers"]
    for bad in ("/\\evil.example", "/\t/evil.example", "//evil.example", "/ok page"):
        r = await client.post(f"{API}/university/announcements", json={"title": "Havola", "text": "Havola tekshiruvi",
                                                                       "link": bad}, headers=h)
        assert r.status_code == 422, bad
    r = await client.post(f"{API}/university/announcements", json={"title": "Havola", "text": "Havola tekshiruvi",
                                                                   "link": "/vakansiyalar/12"}, headers=h)
    assert r.status_code == 201


async def test_members_do_not_get_colleagues_documents_and_contacts(client, make_user):
    lead = await staff_form(client, make_user, name="Rahbar Xodim")
    await client.post(f"{API}/admin/staff/{lead['id']}/review", json={"decision": "approve"}, headers=await owner(client))
    member = await staff_form(client, make_user, name="Oddiy Xodim")
    await client.post(f"{API}/university/team/{member['id']}/decide", json={"decision": "approve"}, headers=lead["headers"])
    waiting = await staff_form(client, make_user, name="Navbatdagi Xodim")
    seen_by_lead = {r["full_name"]: r for r in (await client.get(f"{API}/university/team", headers=lead["headers"])).json()["rows"]}
    assert seen_by_lead["Navbatdagi Xodim"]["doc"] and seen_by_lead["Navbatdagi Xodim"]["phone"]
    seen_by_member = {r["full_name"]: r for r in (await client.get(f"{API}/university/team", headers=member["headers"])).json()["rows"]}
    assert seen_by_member["Navbatdagi Xodim"]["doc"] is None and seen_by_member["Navbatdagi Xodim"]["phone"] == ""
    assert seen_by_member["Rahbar Xodim"]["phone"] == "" and seen_by_member["Rahbar Xodim"]["work_email"] == ""
    assert seen_by_member["Oddiy Xodim"]["phone"]                      # their own row stays whole
    assert waiting["response"].status_code == 201


async def test_switched_off_university_closes_the_panel_and_requests_are_limited(client, make_user):
    staff = await approved_staff(client, make_user)
    async with SessionLocal() as s:
        (await s.get(University, await uni_id("TDIU"))).is_active = False
        await s.commit()
    assert (await client.get(f"{API}/university/dashboard", headers=staff["headers"])).status_code == 403

    u = await make_user("Takror Yuboruvchi")
    body = {"university_id": await uni_id("TATU"), "position": "Karyera markazi"}
    codes = [(await client.post(f"{API}/me/staff-request", json=body, headers=u["headers"])).status_code for _ in range(7)]
    assert codes[:6] == [201] * 6 and codes[6] == 429


async def test_company_event_is_not_reachable_through_the_university_signup(client, make_user):
    loner = await make_user("Universitetsiz")
    async with SessionLocal() as s:
        (await s.get(User, loner["id"])).account_type = "student"
        e = UniversityEvent(university_id=None, title="Korxona ochiq kuni", starts_at=datetime.now(UTC) + timedelta(days=1))
        s.add(e)
        await s.commit()
        event_id = e.id
    r = await client.post(f"{API}/me/university/events/{event_id}/register", headers=loner["headers"])
    assert r.status_code == 404


# --------------------------------------------------------------------------- announcements with photos (2026-11-19)

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


async def _photo(client, headers, name="rasm.png") -> int:
    return (await client.post(f"{API}/uploads", files={"file": (name, PNG)}, headers=headers)).json()["id"]


async def _partner(client, staff, hr) -> None:
    uni = await uni_id("TDIU")
    p = (await client.post(f"{API}/employer/universities/{uni}/partnership", json={"message": ""}, headers=hr["headers"])).json()
    r = await client.post(f"{API}/university/partners/{p['id']}/decide", json={"accept": True}, headers=staff["headers"])
    assert r.status_code == 200, r.text


async def test_announcements_with_photos_reach_students_partner_companies_and_the_public_page(client, make_user):
    hr, _ = await live_job(client, make_user)
    stranger_hr, _ = await live_job(client, make_user, stir="309876543", name="HR Begona")
    staff = await approved_staff(client, make_user)
    await _partner(client, staff, hr)
    a = await make_student(client, make_user, "Ali Valiyev")
    c = await make_student(client, make_user, "Charos Olimova")
    await client.patch(f"{API}/me", json={"faculty": "Moliya"}, headers=c["headers"])
    await verified(a, c)
    h = staff["headers"]
    p1, p2 = await _photo(client, h), await _photo(client, h, "ikki.webp")
    foreign = await _photo(client, a["headers"])
    base = {"title": "Karyera kuni", "text": "25-noyabr soat 10:00 katta zalda"}

    # validation: a channel is required, someone else's file, seven photos, a plain http link
    assert (await client.post(f"{API}/university/announcements", json={**base, "channels": []}, headers=h)).status_code == 422
    r = await client.post(f"{API}/university/announcements", json={**base, "photo_ids": [foreign]}, headers=h)
    assert r.status_code == 422 and "Rasm" in r.text
    assert (await client.post(f"{API}/university/announcements", json={**base, "photo_ids": [p1] * 7}, headers=h)).status_code == 422
    assert (await client.post(f"{API}/university/announcements", json={**base, "link": "http://forms.example/x"}, headers=h)).status_code == 422

    preview = await client.post(f"{API}/university/announcements/preview", json={"faculty": "Moliya", "channels": ["students", "companies"]}, headers=h)
    assert preview.json() == {"recipients": 1, "companies": 1}

    # 1) students of one faculty, with photos and an outside registration form
    r = await client.post(f"{API}/university/announcements", json={
        **base, "audience": {"faculty": "Moliya"}, "channels": ["students"], "category": "event", "photo_ids": [p1, p2],
        "link": "https://forms.example/karyera"}, headers=h)
    assert r.status_code == 201, r.text
    to_students = r.json()
    assert to_students["recipients"] == 1 and to_students["company_recipients"] == 0
    assert [x["name"] for x in to_students["photos"]] == ["rasm.png", "ikki.webp"] and to_students["category"] == "event"
    assert (await client.get(to_students["photos"][0]["url"])).status_code == 200
    # 2) partner companies only
    to_companies = (await client.post(f"{API}/university/announcements", json={
        "title": "Hamkorlarga: yarmarka", "text": "Stend uchun 20-noyabrgacha yozing", "channels": ["companies"]}, headers=h)).json()
    assert to_companies["company_recipients"] == 1 and to_companies["recipients"] == 0
    # 3) the public page only
    public = (await client.post(f"{API}/university/announcements", json={
        "title": "Grant natijalari", "text": "Ro'yxat universitet saytida", "channels": ["public"], "photo_ids": [p2]}, headers=h)).json()

    feed = lambda who: client.get(f"{API}/me/university/feed", headers=who["headers"])  # noqa: E731
    titles = lambda rows: [x["title"] for x in rows]  # noqa: E731
    assert titles((await feed(c)).json()["announcements"]) == ["Grant natijalari", "Karyera kuni"]
    assert titles((await feed(a)).json()["announcements"]) == ["Grant natijalari"]          # another faculty
    assert (await feed(c)).json()["announcements"][1]["photos"][0]["url"]

    partner_news = (await client.get(f"{API}/employer/university-news", headers=hr["headers"])).json()
    assert titles(partner_news) == ["Grant natijalari", "Hamkorlarga: yarmarka"] and partner_news[1]["partner"] is True
    assert titles((await client.get(f"{API}/employer/university-news", headers=stranger_hr["headers"])).json()) == ["Grant natijalari"]
    notes = (await client.get(f"{API}/me/notifications", headers=hr["headers"])).json()["items"]
    tdiu = await uni_id("TDIU")
    assert any(n["kind"] == "university_announcement" and n["link"] == f"/korxona/universitetlar?u={tdiu}" for n in notes)
    detail = (await client.get(f"{API}/employer/universities/{await uni_id('TDIU')}", headers=hr["headers"])).json()
    assert titles(detail["news"]) == ["Grant natijalari", "Hamkorlarga: yarmarka"]

    page = (await client.get(f"{API}/public/universities/{tdiu}")).json()
    assert titles(page["news"]) == ["Grant natijalari"] and "cooperation" in page and "logo_url" in page

    # deleting takes it off every page; only once, and only by the university's own staff
    other = await approved_staff(client, make_user, short="TATU", name="Boshqa xodim")
    assert (await client.delete(f"{API}/university/announcements/{to_students['id']}", headers=other["headers"])).status_code == 404
    assert (await client.delete(f"{API}/university/announcements/{to_students['id']}", headers=h)).json() == {"deleted": True}
    assert (await client.delete(f"{API}/university/announcements/{to_students['id']}", headers=h)).status_code == 404
    assert titles((await feed(c)).json()["announcements"]) == ["Grant natijalari"]
    assert titles((await client.get(f"{API}/university/announcements", headers=h)).json()) == ["Grant natijalari", "Hamkorlarga: yarmarka"]
    assert public["channels"] == ["public"]

    # a university without partners cannot send to companies only
    r = await client.post(f"{API}/university/announcements", json={**base, "channels": ["companies"]}, headers=other["headers"])
    assert r.status_code == 422 and "hamkor" in r.text


async def test_the_company_hears_when_a_university_recommends_its_vacancy(client, make_user):
    hr, job = await live_job(client, make_user)
    staff = await approved_staff(client, make_user)
    s = await make_student(client, make_user, "Ali Valiyev")
    async with SessionLocal() as db:
        (await db.get(User, s["id"])).verification = "verified"
        await db.commit()
    r = await client.post(f"{API}/university/jobs/{job['id']}/recommend", json={"note": ""}, headers=staff["headers"])
    assert r.json()["students"] == 1
    notes = (await client.get(f"{API}/me/notifications", headers=hr["headers"])).json()["items"]
    mine = [n for n in notes if n["kind"] == "job_recommended_company"]
    assert len(mine) == 1 and mine[0]["params"]["count"] == 1 and mine[0]["link"] == "/korxona/vakansiyalar"


async def test_the_company_sees_who_recommended_its_vacancy_and_a_university_can_take_it_back(client, make_user):
    hr, job = await live_job(client, make_user)
    staff = await approved_staff(client, make_user)
    await client.post(f"{API}/university/jobs/{job['id']}/recommend", json={"note": "Moliya talabalari uchun"}, headers=staff["headers"])
    mine = (await client.get(f"{API}/employer/jobs", headers=hr["headers"])).json()
    assert [(r["short_name"], r["note"]) for r in mine[0]["recommended_by"]] == [("TDIU", "Moliya talabalari uchun")]
    other = await approved_staff(client, make_user, short="TATU", name="Boshqa xodim")
    assert (await client.delete(f"{API}/university/jobs/{job['id']}/recommend", headers=other["headers"])).status_code == 404
    assert (await client.delete(f"{API}/university/jobs/{job['id']}/recommend", headers=staff["headers"])).json() == {"recommended": False}
    assert (await client.get(f"{API}/employer/jobs", headers=hr["headers"])).json()[0]["recommended_by"] == []
    opp = (await client.get(f"{API}/university/opportunities", headers=staff["headers"])).json()
    assert next(j for j in opp if j["id"] == job["id"])["recommended"] is False



async def test_only_students_the_university_verified_get_its_student_posts_and_events(client, make_user):
    """The university on a profile is typed by the person: a company account or another university's student who
    puts it in must not read the career centre's student-only announcements or sign up for its events."""
    hr, _ = await live_job(client, make_user)
    staff = await approved_staff(client, make_user)
    h, tdiu = staff["headers"], await uni_id("TDIU")
    await verified(await make_student(client, make_user, "Tasdiqlangan Talaba"))     # someone the post can reach
    r = await client.post(f"{API}/university/announcements", json={"title": "Faqat talabalarga", "text": "Ichki stipendiya tanlovi",
                                                                  "channels": ["students"]}, headers=h)
    assert r.status_code == 201 and r.json()["recipients"] == 1
    await client.post(f"{API}/university/announcements", json={"title": "Hammaga", "text": "Ochiq eshiklar kuni haqida",
                                                              "channels": ["public"]}, headers=h)
    start = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    event = (await client.post(f"{API}/university/events", json={"title": "Ichki karyera kuni", "starts_at": start}, headers=h)).json()
    student = await make_student(client, make_user, "Ali Valiyev")         # chose TDIU, not verified yet
    # unverified people got no notice of it either (the notice carries the full text)
    assert not any(n["kind"] == "university_announcement" for n in
                   (await client.get(f"{API}/me/notifications", headers=student["headers"])).json()["items"])
    async with SessionLocal() as s:                                      # a company account that typed TDIU in its profile
        (await s.get(User, hr["id"])).university_id = tdiu
        await s.commit()
    titles = lambda r: [x["title"] for x in r.json()["announcements"]]  # noqa: E731

    for who in (student, hr):
        feed = await client.get(f"{API}/me/university/feed", headers=who["headers"])
        assert titles(feed) == ["Hammaga"] and feed.json()["events"] == [] and feed.json()["verified"] is False
    r = await client.post(f"{API}/me/university/events/{event['id']}/register", headers=student["headers"])
    assert r.status_code == 403 and "tasdiqlagandan" in r.text
    assert (await client.post(f"{API}/me/university/events/{event['id']}/register", headers=hr["headers"])).status_code == 404
    assert all(e["organiser"] != "university" for e in (await client.get(f"{API}/me/events", headers=student["headers"])).json())
    r = await client.post(f"{API}/me/events/{event['id']}/register", headers=student["headers"])
    assert r.status_code == 403 and "tasdiqlagandan" in r.text

    # the career centre verifies the student: the student-only post and the event open
    await client.post(f"{API}/me/verification", headers=student["headers"])
    assert (await client.post(f"{API}/university/verifications/{student['id']}", json={"approve": True}, headers=h)).status_code == 200
    feed = await client.get(f"{API}/me/university/feed", headers=student["headers"])
    assert titles(feed) == ["Hammaga", "Faqat talabalarga"] and feed.json()["verified"] is True
    assert [e["title"] for e in feed.json()["events"]] == ["Ichki karyera kuni"]
    assert (await client.post(f"{API}/me/university/events/{event['id']}/register", headers=student["headers"])).status_code == 201
    assert any(e["id"] == event["id"] for e in (await client.get(f"{API}/me/events", headers=student["headers"])).json())

    # the verification is withdrawn: the posts close again, but one's own registration can still be dropped
    async with SessionLocal() as s:
        (await s.get(User, student["id"])).verification = "rejected"
        await s.commit()
    assert titles(await client.get(f"{API}/me/university/feed", headers=student["headers"])) == ["Hammaga"]
    assert (await client.delete(f"{API}/me/university/events/{event['id']}/register", headers=student["headers"])).status_code == 200
    assert (await client.delete(f"{API}/me/university/events/{event['id']}/register", headers=student["headers"])).status_code == 403
