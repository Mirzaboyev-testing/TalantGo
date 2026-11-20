"""Fixes from the 2026-11-19 live test on production: contacts in peers and test results, sign-up and sign-in
limits for a classroom behind one address, admins with a temporary password, the public lists cache."""
from sqlalchemy import update

from app.core import shortcache
from app.core.config import settings
from app.core.db import SessionLocal
from app.models import User
from tests.conftest import owner_headers as owner
from tests.test_career import JOB
from tests.test_signup_and_tests import TEST, approved_employer, full_student

API = "/api/v1"


async def set_username(user_id: int, username: str) -> None:
    async with SessionLocal() as session:
        await session.execute(update(User).where(User.id == user_id).values(username=username))
        await session.commit()


async def test_peers_show_a_telegram_username_only_after_the_student_opens_it(client, make_user):
    a = await full_student(client, make_user, "Aziza Yusupova")
    b = await full_student(client, make_user, "Bekzod Karimov")
    await set_username(b["id"], "bekzod_k")
    row = next(p for p in (await client.get(f"{API}/peers", headers=a["headers"])).json() if p["id"] == b["id"])
    assert row["username"] is None

    me = (await client.patch(f"{API}/me", json={"show_telegram": True}, headers=b["headers"])).json()
    assert me["show_telegram"] is True
    row = next(p for p in (await client.get(f"{API}/peers", headers=a["headers"])).json() if p["id"] == b["id"])
    assert row["username"] == "bekzod_k"


async def test_test_results_show_a_username_only_once_the_student_applied(client, make_user):
    hr = await approved_employer(client, make_user)
    admin = await owner(client)
    s = await full_student(client, make_user, "Aziza Yusupova")
    await set_username(s["id"], "aziza_y")
    t = (await client.post(f"{API}/employer/tests", json=TEST, headers=hr["headers"])).json()
    await client.post(f"{API}/admin/tests/{t['id']}/review", json={"approve": True}, headers=admin)
    await client.post(f"{API}/tests/{t['id']}/start", headers=s["headers"])
    await client.post(f"{API}/tests/{t['id']}/submit", json={"answers": []}, headers=s["headers"])

    rows = (await client.get(f"{API}/employer/tests/{t['id']}/results", headers=hr["headers"])).json()["rows"]
    assert rows[0]["student"]["username"] is None                  # taking a test is not consent
    detail = (await client.get(f"{API}/employer/test-attempts/{rows[0]['attempt_id']}", headers=hr["headers"])).json()
    assert detail["student"]["username"] is None

    job = (await client.post(f"{API}/employer/jobs", json=JOB, headers=hr["headers"])).json()
    await client.post(f"{API}/admin/jobs/{job['id']}/review", json={"approve": True}, headers=admin)
    assert (await client.post(f"{API}/me/verification", headers=s["headers"])).status_code == 200
    assert (await client.post(f"{API}/jobs/{job['id']}/apply", json={"note": "Qiziqaman"}, headers=s["headers"])).status_code == 201
    rows = (await client.get(f"{API}/employer/tests/{t['id']}/results", headers=hr["headers"])).json()["rows"]
    assert rows[0]["student"]["username"] == "aziza_y"


async def test_a_classroom_behind_one_address_signs_up_and_signs_in(client):
    """The live test hit 429 on the 11th sign-up from one IP: a campus Wi-Fi is one address for everyone."""
    for i in range(25):
        r = await client.post(f"{API}/auth/register", json={"full_name": f"Talaba Sinf {i}", "email": f"t{i}@sinf.uz",
                                                             "password": "kuchli-parol-1"})
        assert r.status_code == 201, (i, r.text)
    for _ in range(2):
        for i in range(25):                                         # 50 right passwords never block the address
            r = await client.post(f"{API}/auth/login", json={"email": f"t{i}@sinf.uz", "password": "kuchli-parol-1"})
            assert r.status_code == 200, (i, r.text)


async def test_wrong_passwords_from_one_address_are_still_limited(client):
    for i in range(60):                                             # a different e-mail each time: no per-e-mail lock
        r = await client.post(f"{API}/auth/login", json={"email": f"yoq{i}@sinf.uz", "password": "notogri-parol"})
        assert r.status_code == 404                                 # no such account (still counted against the address)
    r = await client.post(f"{API}/auth/login", json={"email": "yoq-yana@sinf.uz", "password": "notogri-parol"})
    assert r.status_code == 429


async def test_an_admin_with_a_temporary_password_replaces_it_before_anything_else(client):
    owner_h = await owner(client)
    email = "yangi-admin@careerflow.test"
    await client.post(f"{API}/admin-auth/register", json={"name": "Yangi Admin", "email": email, "password": "admin-parol-123"})
    account = next(a for a in (await client.get(f"{API}/admin/accounts", headers=owner_h)).json() if a["email"] == email)
    assert (await client.patch(f"{API}/admin/accounts/{account['id']}", json={"status": "active"}, headers=owner_h)).status_code == 200
    temp = (await client.post(f"{API}/admin/accounts/{account['id']}/reset-password", headers=owner_h)).json()["temporary_password"]

    token = (await client.post(f"{API}/admin-auth/login", json={"email": email, "password": temp})).json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    assert (await client.get(f"{API}/admin-auth/me", headers=h)).json()["must_change_password"] is True
    r = await client.get(f"{API}/admin/stats", headers=h)
    assert r.status_code == 403 and "vaqtinchalik" in r.json()["detail"]
    same = await client.put(f"{API}/admin-auth/password", json={"current_password": temp, "new_password": temp}, headers=h)
    assert same.status_code == 400

    r = await client.put(f"{API}/admin-auth/password", json={"current_password": temp, "new_password": "ozimning-parolim-1"},
                         headers=h)
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert (await client.get(f"{API}/admin-auth/me", headers=h)).json()["must_change_password"] is False
    assert (await client.get(f"{API}/admin/stats", headers=h)).status_code == 200


async def test_public_lists_are_kept_for_a_few_seconds(client, monkeypatch):
    monkeypatch.setattr(settings, "app_env", "prod")
    shortcache.clear()
    calls = []

    async def build():
        calls.append(1)
        return {"n": len(calls)}
    assert await shortcache.cached(("x",), build) == {"n": 1}
    assert await shortcache.cached(("x",), build) == {"n": 1}         # served from memory
    assert await shortcache.cached(("y",), build) == {"n": 2}         # another key is built on its own

    # the wrapped routes keep their parameters: filters still reach the query
    first = (await client.get(f"{API}/public/stats")).json()
    assert (await client.get(f"{API}/public/stats")).json() == first
    r = await client.get(f"{API}/public/jobs", params={"kind": "internship", "limit": 5})
    assert r.status_code == 200 and "items" in r.json()
    assert (await client.get(f"{API}/public/companies", params={"q": "yo'q-bunday"})).json()["total"] == 0
    shortcache.clear()


async def test_a_company_without_partners_sees_the_universities_list(client, make_user):
    """The live test: "Kutilmagan xato" on Universitetlar for every company with no partner yet ("ORDER BY false")."""
    hr = await approved_employer(client, make_user)
    r = await client.get(f"{API}/employer/universities", headers=hr["headers"])
    assert r.status_code == 200 and len(r.json()) > 0
    r = await client.get(f"{API}/employer/universities", params={"q": "TDIU"}, headers=hr["headers"])
    assert r.status_code == 200 and all(u["partnership"] is None for u in r.json())


async def test_an_unexpected_error_answers_with_a_plain_message(monkeypatch):
    from httpx import ASGITransport, AsyncClient

    from app.api import public
    from app.main import app
    from tests.test_career import uni_id

    async def broken(*_args, **_kwargs):
        raise RuntimeError("test: a bug in the statistics")
    monkeypatch.setattr(public, "university_stats", broken)
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as c:
        r = await c.get(f"{API}/public/universities/{await uni_id('TDIU')}")
    assert r.status_code == 500
    assert "Serverda xatolik" in r.json()["detail"]


# --------------------------------------------------------------------------- 2026-11-20: logs and review of e9ec19a

def other_address():
    from httpx import ASGITransport, AsyncClient

    from app.main import app
    return AsyncClient(transport=ASGITransport(app=app, client=("10.20.30.40", 5000)), base_url="http://test")


async def register(client, email: str, password: str = "kuchli-parol-1") -> dict:
    r = await client.post(f"{API}/auth/register", json={"full_name": "Sinov Talaba", "email": email, "password": password})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


async def test_sign_in_says_what_to_do_for_an_unknown_email_or_a_telegram_only_account(client, make_user):
    """52 tries from people who had no account yet (2026-11-20 logs): they now hear to sign up."""
    r = await client.post(f"{API}/auth/login", json={"email": "yangi-odam@mail.uz", "password": "nimadir-123"})
    assert r.status_code == 404 and "Ro'yxatdan o'tish" in r.json()["detail"]
    u = await make_user("Telegram Foydalanuvchi")
    async with SessionLocal() as session:
        await session.execute(update(User).where(User.id == u["id"]).values(email="tg-odam@mail.uz"))
        await session.commit()
    r = await client.post(f"{API}/auth/login", json={"email": "tg-odam@mail.uz", "password": "nimadir-123"})
    assert r.status_code == 409 and "Telegram" in r.json()["detail"]
    for _ in range(12):                                             # neither counts towards an e-mail lockout
        await client.post(f"{API}/auth/login", json={"email": "yangi-odam@mail.uz", "password": "nimadir-123"})
    await register(client, "yangi-odam@mail.uz")
    ok = await client.post(f"{API}/auth/login", json={"email": "yangi-odam@mail.uz", "password": "kuchli-parol-1"})
    assert ok.status_code == 200


async def test_a_stranger_typing_wrong_passwords_does_not_lock_the_owner_out(client):
    await register(client, "egasi@mail.uz")
    async with other_address() as stranger:
        for _ in range(8):
            r = await stranger.post(f"{API}/auth/login", json={"email": "egasi@mail.uz", "password": "taxmin-qilaman"})
            assert r.status_code == 401
        r = await stranger.post(f"{API}/auth/login", json={"email": "egasi@mail.uz", "password": "taxmin-qilaman"})
        assert r.status_code == 429                                 # the guesser is stopped
    r = await client.post(f"{API}/auth/login", json={"email": "egasi@mail.uz", "password": "kuchli-parol-1"})
    assert r.status_code == 200                                     # the owner, from another address, is not


async def test_the_sign_in_email_changes_without_a_new_password(client):
    h = await register(client, "eski@mail.uz")
    await register(client, "band@mail.uz")
    r = await client.put(f"{API}/me/email", json={"email": "yangi@mail.uz", "current_password": "notogri-123"}, headers=h)
    assert r.status_code == 403
    r = await client.put(f"{API}/me/email", json={"email": "band@mail.uz", "current_password": "kuchli-parol-1"}, headers=h)
    assert r.status_code == 409
    r = await client.put(f"{API}/me/email", json={"email": " Yangi@Mail.uz ", "current_password": "kuchli-parol-1"}, headers=h)
    assert r.status_code == 200 and r.json()["email"] == "yangi@mail.uz"
    assert (await client.get(f"{API}/me", headers=h)).status_code == 200          # this session goes on
    assert (await client.post(f"{API}/auth/login", json={"email": "yangi@mail.uz", "password": "kuchli-parol-1"})).status_code == 200
    assert (await client.post(f"{API}/auth/login", json={"email": "eski@mail.uz", "password": "kuchli-parol-1"})).status_code == 404
    kinds = [n["kind"] for n in (await client.get(f"{API}/me/notifications", headers=h)).json()["items"]]
    assert "email_changed" in kinds


async def test_guessing_the_current_password_on_a_signed_in_session_is_limited(client):
    h = await register(client, "sessiya@mail.uz")
    for _ in range(8):
        r = await client.put(f"{API}/me/password", json={"email": "sessiya@mail.uz", "password": "yangi-parol-9",
                                                          "current_password": "taxmin-123"}, headers=h)
        assert r.status_code == 403
    r = await client.put(f"{API}/me/password", json={"email": "sessiya@mail.uz", "password": "yangi-parol-9",
                                                      "current_password": "kuchli-parol-1"}, headers=h)
    assert r.status_code == 429
    r = await client.put(f"{API}/me/email", json={"email": "boshqa@mail.uz", "current_password": "kuchli-parol-1"}, headers=h)
    assert r.status_code == 429                                     # the same counter guards the e-mail change


async def test_only_students_pick_a_university(client, make_user):
    from tests.test_career import uni_id
    hr = await approved_employer(client, make_user)
    tdiu = await uni_id("TDIU")
    r = await client.patch(f"{API}/me", json={"university_id": tdiu}, headers=hr["headers"])
    assert r.status_code == 403
    s = await make_user("Talaba Bir")
    r = await client.patch(f"{API}/me", json={"university_id": tdiu}, headers=s["headers"])
    assert r.status_code == 200 and r.json()["university_ref"]["id"] == tdiu
