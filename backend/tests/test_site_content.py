"""The public website's content managed in admin: partner logos strip, team, page photos, contacts."""
from app.core.db import SessionLocal
from app.models import Company, University
from tests.conftest import owner_headers as owner
from tests.test_ranking_and_admin import staff_account

API = "/api/v1"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"0" * 40


async def upload(client, headers, name="logo.png", data=PNG):
    return await client.post(f"{API}/admin/site/media", files={"file": (name, data)}, headers=headers)


async def test_partner_strip_from_upload_and_from_platform(client):
    admin = await owner(client)
    async with SessionLocal() as session:
        company = Company(name="Data Solutions MChJ", status="approved", industry="it")
        hidden = Company(name="Kutilayotgan MChJ", status="pending", industry="it")
        uni = University(name="Toshkent axborot texnologiyalari universiteti", short_name="TATU", is_active=True)
        session.add_all([company, hidden, uni])
        await session.commit()
        company_id, hidden_id, uni_id = company.id, hidden.id, uni.id

    logo = (await upload(client, admin)).json()
    assert logo["url"] == f"/api/v1/public/site/media/{logo['id']}"
    served = await client.get(logo["url"])
    assert served.status_code == 200 and served.headers["content-type"] == "image/png"
    assert served.headers["x-content-type-options"] == "nosniff"

    r = await client.post(f"{API}/admin/site/partners", json={
        "kind": "company", "name": "  Uzum   Market ", "website": "https://uzum.uz", "logo_media_id": logo["id"]}, headers=admin)
    assert r.status_code == 200, r.text
    uzum = r.json()
    assert uzum["name"] == "Uzum Market" and uzum["logo_url"] == logo["url"]

    linked = (await client.post(f"{API}/admin/site/partners", json={
        "kind": "university", "name": "TATU", "university_id": uni_id}, headers=admin)).json()
    assert linked["short"] == "TATU" and linked["logo_url"] is None          # no logo yet: the page shows initials
    from_company = (await client.post(f"{API}/admin/site/partners", json={
        "kind": "company", "name": "Data Solutions", "company_id": company_id, "is_visible": False}, headers=admin)).json()

    # only approved companies can be linked, and only real links are kept
    bad = await client.post(f"{API}/admin/site/partners", json={"kind": "company", "name": "X", "company_id": hidden_id}, headers=admin)
    assert bad.status_code == 422
    bad = await client.post(f"{API}/admin/site/partners", json={"kind": "company", "name": "X", "website": "javascript:alert(1)"}, headers=admin)
    assert bad.status_code == 422
    bare = (await client.post(f"{API}/admin/site/partners", json={"kind": "company", "name": "Nur Soft", "website": "nursoft.uz", "is_visible": False}, headers=admin)).json()
    assert bare["website"] == "https://nursoft.uz"
    await client.delete(f"{API}/admin/site/partners/{bare['id']}", headers=admin)

    site = (await client.get(f"{API}/public/site")).json()
    assert [p["name"] for p in site["partners"]] == ["Uzum Market", "TATU"]      # the hidden one is left out
    assert "company_id" not in site["partners"][0]

    # reorder and delete
    await client.put(f"{API}/admin/site/partners/order", json={"ids": [linked["id"], uzum["id"], from_company["id"]]}, headers=admin)
    assert [p["name"] for p in (await client.get(f"{API}/public/site")).json()["partners"]] == ["TATU", "Uzum Market"]
    assert (await client.delete(f"{API}/admin/site/partners/{uzum['id']}", headers=admin)).status_code == 200
    names = [p["name"] for p in (await client.get(f"{API}/admin/site", headers=admin)).json()["partners"]]
    assert names == ["TATU", "Data Solutions"]

    picks = (await client.get(f"{API}/admin/site/choices", params={"kind": "company", "q": "data"}, headers=admin)).json()
    assert [c["name"] for c in picks] == ["Data Solutions MChJ"]
    picks = (await client.get(f"{API}/admin/site/choices", params={"kind": "university", "q": "tatu"}, headers=admin)).json()
    assert picks[0]["short"] == "TATU"


async def test_uploads_must_be_real_images(client):
    admin = await owner(client)
    assert (await upload(client, admin, "logo.webp", WEBP)).status_code == 200
    for name, data in [("logo.png", b"<html><script>alert(1)</script></html>"), ("logo.svg", b"<svg onload=alert(1)>")]:
        r = await upload(client, admin, name, data)
        assert r.status_code == 422, name
    assert (await client.get(f"{API}/public/site/media/999999")).status_code == 404


async def test_team_photos_and_contacts(client):
    admin = await owner(client)
    photo = (await upload(client, admin, "me.png")).json()
    r = await client.post(f"{API}/admin/site/team", json={
        "full_name": "Muhammadqodir Mirzaboyev", "role": "Asoschi", "role_ru": "Основатель", "role_en": "Founder",
        "link": "https://www.linkedin.com/in/example", "photo_media_id": photo["id"]}, headers=admin)
    assert r.status_code == 200, r.text
    second = (await client.post(f"{API}/admin/site/team", json={"full_name": "Dilnoza", "role": "Dizayner"}, headers=admin)).json()
    assert (await client.post(f"{API}/admin/site/team", json={"full_name": "X", "role": "Y", "photo_media_id": 999999}, headers=admin)).status_code == 422

    await client.put(f"{API}/admin/site/team/{second['id']}", json={"full_name": "Dilnoza", "role": "Dizayner", "is_visible": False}, headers=admin)
    team = (await client.get(f"{API}/public/site")).json()["team"]
    assert [m["full_name"] for m in team] == ["Muhammadqodir Mirzaboyev"]
    assert team[0]["role_en"] == "Founder" and team[0]["photo_url"] == photo["url"]

    hero = (await upload(client, admin, "hero.png")).json()
    r = await client.put(f"{API}/admin/site/settings", json={
        "images": {"hero": hero["id"]}, "contacts": {"email": "info@careerup.uz", "phone": " +998 90 123 45 67 ", "instagram": ""}}, headers=admin)
    assert r.status_code == 200, r.text
    site = (await client.get(f"{API}/public/site")).json()
    assert site["images"] == {"hero": hero["url"], "students": None, "about": None}
    assert site["contacts"] == {"email": "info@careerup.uz", "phone": "+998 90 123 45 67"}

    # a photo can be reset to the built-in one
    await client.put(f"{API}/admin/site/settings", json={"images": {"hero": None}, "contacts": site["contacts"]}, headers=admin)
    assert (await client.get(f"{API}/public/site")).json()["images"]["hero"] is None
    assert (await client.put(f"{API}/admin/site/settings", json={"contacts": {"fax": "1"}}, headers=admin)).status_code == 422


async def test_limited_roles_only_look(client):
    moderator = await staff_account(client, "moderator", "mod-site@careerup.test")
    assert (await client.get(f"{API}/admin/site", headers=moderator)).status_code == 200
    r = await client.post(f"{API}/admin/site/partners", json={"kind": "company", "name": "X"}, headers=moderator)
    assert r.status_code == 403
    assert (await upload(client, moderator)).status_code == 403
    assert (await client.get(f"{API}/admin/site")).status_code == 401


async def test_headline_numbers_count_signed_up_students_and_approved_members(client):
    from datetime import UTC, datetime

    from app.models import User
    now = datetime.now(UTC)
    async with SessionLocal() as session:
        joined = University(name="Joined University", short_name="JU", is_active=True)
        waiting = University(name="Waiting University", short_name="WU", is_active=True)
        session.add_all([joined, waiting])
        await session.flush()
        session.add_all([
            User(telegram_id=71001, full_name="Lead", account_type="university", staff_university_id=joined.id, staff_status="approved"),
            User(telegram_id=71002, full_name="Applicant", account_type="university", staff_university_id=waiting.id, staff_status="pending"),
            User(telegram_id=71003, full_name="Verified", university_id=joined.id, verification="verified", consent_at=now),
            User(telegram_id=71004, full_name="Just signed up", university_id=joined.id, consent_at=now),
            User(telegram_id=71005, full_name="Blocked", university_id=joined.id, consent_at=now, is_blocked=True),
            User(telegram_id=71006, full_name="Only opened the bot"),
        ])
        await session.commit()
    stats = (await client.get(f"{API}/public/stats")).json()
    # a student counts from the moment the sign-up is finished (consent), verified or not; staff never count
    assert stats["universities"] == 1 and stats["students"] == 2


async def test_universities_page_lists_only_joined(client):
    from app.models import User
    async with SessionLocal() as session:
        joined = University(name="Joined Institute", short_name="JI", is_active=True)
        catalogue = University(name="Catalogue Institute", short_name="CI", is_active=True)
        session.add_all([joined, catalogue])
        await session.flush()
        session.add(User(telegram_id=72001, full_name="Lead", account_type="university", staff_university_id=joined.id, staff_status="approved"))
        await session.commit()
        joined_id, catalogue_id = joined.id, catalogue.id
    listed = (await client.get(f"{API}/public/universities", params={"q": "Institute"})).json()
    assert [u["short_name"] for u in listed["items"]] == ["JI"] and listed["total"] == 1
    # a profile stays reachable (the ranking links to it), only the list is limited
    assert (await client.get(f"{API}/public/universities/{catalogue_id}")).status_code == 200
    assert (await client.get(f"{API}/public/universities/{joined_id}")).status_code == 200
