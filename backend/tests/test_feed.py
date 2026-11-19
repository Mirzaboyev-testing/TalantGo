"""The posts feed ("Lenta", docs/12-talaba-postlar.md): posting with images, who sees what, reactions, comments with
notifications, report-based hiding and the admin queue."""
from fastapi.routing import APIRouter, APIRoute
from sqlalchemy import update

from app.api import feed as feed_api
from app.core.db import SessionLocal
from app.models import User
from app.services import admin_access
from tests.conftest import owner_headers as owner
from tests.test_admin_access import _owner_only
from tests.test_career import make_employer, uni_id, upload_doc
from tests.test_notifications_and_password import admin_bell
from tests.test_pipeline_and_inbox import API
from tests.test_ranking_and_admin import staff_account
from tests.test_signup_and_tests import approved_employer, full_student
from tests.test_student_panel2 import PNG
from tests.test_university_panel import approved_staff


async def student(client, make_user, name: str, uni: str = "TDIU", fields: list[str] | None = None) -> dict:
    u = await full_student(client, make_user, name)
    changes = {}
    if uni != "TDIU":
        changes["university_id"] = await uni_id(uni)
    if fields is not None:
        changes["job_fields"] = fields
    if changes:
        r = await client.patch(f"{API}/me", json=changes, headers=u["headers"])
        assert r.status_code == 200, r.text
    return u


async def post(client, who: dict, text: str = "Amaliyotimning birinchi haftasi", **extra) -> dict:
    r = await client.post(f"{API}/posts", json={"kind": "experience", "text": text, **extra}, headers=who["headers"])
    assert r.status_code == 201, r.text
    return r.json()


async def feed_ids(client, who: dict, scope: str = "all") -> list[int]:
    r = await client.get(f"{API}/feed", params={"scope": scope}, headers=who["headers"])
    assert r.status_code == 200, r.text
    return [p["id"] for p in r.json()["items"]]


async def bell(client, who: dict) -> list[dict]:
    return (await client.get(f"{API}/me/notifications", headers=who["headers"])).json()["items"]


async def test_post_with_images_edit_and_the_image_link_dies_after_removal(client, make_user):
    a = await student(client, make_user, "Dilnoza Aliyeva")
    b = await student(client, make_user, "Jasur Toshev")
    p1 = await upload_doc(client, a["headers"], "birinchi.png", PNG)
    p2 = await upload_doc(client, a["headers"], "ikkinchi.png", PNG)
    p = await post(client, a, "  Loyiham tayyor!\n\n\n\nDashboard  ", kind="project", media_ids=[p1, p2, p1])
    assert p["text"] == "Loyiham tayyor!\n\nDashboard" and [m["id"] for m in p["media"]] == [p1, p2]
    assert p["author"] == {"kind": "student", "user_id": a["id"], "name": "Dilnoza Aliyeva", "photo_url": None,
                           "subtitle": "TDIU · Iqtisodiyot · 2-kurs", "verified": False, "company_id": None,
                           "company_logo": None, "university_id": await uni_id("TDIU")}
    assert p["mine"] and p["status"] == "visible" and p["reactions"] == {"like": 0, "congrats": 0}
    assert p["my_reaction"] is None and p["comments_n"] == 0 and p["edited_at"] is None and p["visibility"] == "all"
    urls = {m["id"]: m["url"] for m in p["media"]}
    assert (await client.get(urls[p1])).status_code == 200

    seen = (await client.get(f"{API}/posts/{p['id']}", headers=b["headers"])).json()
    assert seen["mine"] is False and seen["text"] == p["text"]

    # rules on what a post may hold
    other_pic = await upload_doc(client, b["headers"], "boshqa.png", PNG)
    assert (await client.post(f"{API}/posts", json={"kind": "project", "text": "Mening rasmim emas", "media_ids": [other_pic]},
                              headers=a["headers"])).status_code == 422
    pdf = await upload_doc(client, a["headers"])
    assert (await client.post(f"{API}/posts", json={"kind": "project", "text": "PDF bilan", "media_ids": [pdf]},
                              headers=a["headers"])).status_code == 422
    assert (await client.post(f"{API}/posts", json={"kind": "project", "text": "Ko'p rasm", "media_ids": [1, 2, 3, 4, 5]},
                              headers=a["headers"])).status_code == 422
    assert (await client.post(f"{API}/posts", json={"kind": "question", "text": " x "}, headers=a["headers"])).status_code == 422
    assert (await client.post(f"{API}/posts", json={"kind": "question", "text": "y" * 3001}, headers=a["headers"])).status_code == 422
    assert (await client.post(f"{API}/posts", json={"kind": "news", "text": "Talaba yangiligi"}, headers=a["headers"])).status_code == 422
    only_pic = await upload_doc(client, a["headers"], "faqat.png", PNG)
    assert (await client.post(f"{API}/posts", json={"kind": "event", "media_ids": [only_pic]}, headers=a["headers"])).status_code == 201

    # only the author edits; a dropped image stops being served
    assert (await client.patch(f"{API}/posts/{p['id']}", json={"text": "Boshqa matn"}, headers=b["headers"])).status_code == 403
    r = await client.patch(f"{API}/posts/{p['id']}", json={"media_ids": [p2], "text": "Loyiham tayyor (yangilandi)"},
                           headers=a["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["edited_at"] and [m["id"] for m in r.json()["media"]] == [p2]
    assert (await client.get(urls[p1])).status_code == 404
    assert (await client.get(urls[p2])).status_code == 200

    assert (await client.delete(f"{API}/posts/{p['id']}", headers=b["headers"])).status_code == 403
    assert (await client.delete(f"{API}/posts/{p['id']}", headers=a["headers"])).json() == {"ok": True}
    assert (await client.get(urls[p2])).status_code == 404
    assert p["id"] not in await feed_ids(client, b)
    assert (await client.get(f"{API}/posts/{p['id']}", headers=a["headers"])).status_code == 404
    assert p["id"] not in [x["id"] for x in (await client.get(f"{API}/me/posts", headers=a["headers"])).json()["items"]]


async def test_company_and_university_posts(client, make_user):
    hr = await approved_employer(client, make_user)
    staff = await approved_staff(client, make_user, "TDIU")
    logo = await upload_doc(client, hr["headers"], "e'lon.png", PNG)
    c = await post(client, hr, "Yozgi amaliyotga qabul boshlandi", kind="news", media_ids=[logo])
    assert c["author"]["kind"] == "company" and c["author"]["name"] == "Data Solutions MChJ"
    assert c["author"]["verified"] is True and c["author"]["company_id"] == hr["company_id"]
    assert "IT / dasturlash" in c["author"]["subtitle"] and c["author"]["university_id"] is None
    assert (await client.post(f"{API}/posts", json={"kind": "news", "text": "Faqat TDIU uchun", "visibility": "university"},
                              headers=hr["headers"])).status_code == 422
    u = await post(client, staff, "Karyera kuni 25-noyabrda", kind="event", visibility="university")
    assert u["author"]["kind"] == "university" and u["author"]["name"] == "TDIU" and u["author"]["verified"] is True
    assert u["author"]["university_id"] == await uni_id("TDIU") and u["author"]["subtitle"]
    # people of a company that is not approved yet neither read nor post
    pending = await make_employer(client, make_user, "HR Kutayotgan", stir="309999999")
    assert (await client.get(f"{API}/feed", headers=pending["headers"])).status_code == 403
    assert (await client.post(f"{API}/posts", json={"kind": "news", "text": "Salom hammaga"},
                              headers=pending["headers"])).status_code == 403


async def test_feed_scopes_university_visibility_and_paging(client, make_user):
    a = await student(client, make_user, "Aziza TDIU", fields=["finance", "data"])
    b = await student(client, make_user, "Bobur WIUT", uni="WIUT", fields=["design"])
    c = await student(client, make_user, "Sardor TDIU", fields=["data"])
    hr = await approved_employer(client, make_user)
    staff = await approved_staff(client, make_user, "TDIU")
    wiut_staff = await approved_staff(client, make_user, "WIUT", name="WIUT markazi")

    pa = await post(client, a, "Faqat TDIU talabalari uchun", visibility="university")
    pb = await post(client, b, "WIUT'dan salom")
    pc = await post(client, c, "Data loyiham")
    ph = await post(client, hr, "Bizda amaliyot", kind="news")
    ps = await post(client, staff, "TDIU karyera kuni", kind="news")

    assert await feed_ids(client, a) == [ps["id"], ph["id"], pc["id"], pb["id"], pa["id"]]
    assert pa["id"] not in await feed_ids(client, b)                       # another university
    assert pa["id"] not in await feed_ids(client, hr) and pa["id"] not in await feed_ids(client, wiut_staff)
    assert pa["id"] in await feed_ids(client, staff)                        # the university's own staff
    assert (await client.get(f"{API}/posts/{pa['id']}", headers=b["headers"])).status_code == 404
    assert (await client.get(f"{API}/posts/{pa['id']}", headers=staff["headers"])).status_code == 200

    assert await feed_ids(client, a, "students") == [pc["id"], pb["id"], pa["id"]]
    assert await feed_ids(client, a, "university") == [ps["id"], pc["id"], pa["id"]]
    assert await feed_ids(client, b, "university") == [pb["id"]]
    assert await feed_ids(client, staff, "university") == [ps["id"], pc["id"], pa["id"]]
    assert await feed_ids(client, hr, "university") == []
    assert await feed_ids(client, a, "fields") == [pc["id"], pa["id"]]     # data / finance, not design
    assert await feed_ids(client, b, "fields") == [pb["id"]]
    assert await feed_ids(client, hr, "fields") == []                       # an employer has no job fields

    first = (await client.get(f"{API}/feed", params={"limit": 2}, headers=a["headers"])).json()
    assert [p["id"] for p in first["items"]] == [ps["id"], ph["id"]] and first["next"] == ph["id"]
    rest = (await client.get(f"{API}/feed", params={"limit": 3, "before": first["next"]}, headers=a["headers"])).json()
    assert [p["id"] for p in rest["items"]] == [pc["id"], pb["id"], pa["id"]] and rest["next"] is None

    # a profile's "Faoliyat": the same rules
    assert [p["id"] for p in (await client.get(f"{API}/people/{a['id']}/posts", headers=c["headers"])).json()["items"]] == [pa["id"]]
    assert (await client.get(f"{API}/people/{a['id']}/posts", headers=b["headers"])).json() == {"items": [], "next": None}

    # a blocked author's posts disappear
    async with SessionLocal() as s:
        await s.execute(update(User).where(User.id == c["id"]).values(is_blocked=True))
        await s.commit()
    assert pc["id"] not in await feed_ids(client, a)


async def test_reactions_switch_and_count(client, make_user):
    a = await student(client, make_user, "Muallif Talaba")
    b = await student(client, make_user, "Birinchi O'quvchi")
    c = await student(client, make_user, "Ikkinchi O'quvchi")
    p = await post(client, a)
    url = f"{API}/posts/{p['id']}/reaction"
    assert (await client.put(url, json={"kind": "like"}, headers=b["headers"])).json() == {
        "reactions": {"like": 1, "congrats": 0}, "my_reaction": "like"}
    await client.put(url, json={"kind": "like"}, headers=c["headers"])
    await client.put(url, json={"kind": "like"}, headers=c["headers"])                # a repeat counts once
    r = (await client.put(url, json={"kind": "congrats"}, headers=c["headers"])).json()   # switched, not added
    assert r == {"reactions": {"like": 1, "congrats": 1}, "my_reaction": "congrats"}
    assert (await client.put(url, json={"kind": "wow"}, headers=c["headers"])).status_code == 422
    mine = (await client.get(f"{API}/feed", headers=b["headers"])).json()["items"][0]
    assert mine["my_reaction"] == "like" and mine["reactions"] == {"like": 1, "congrats": 1}
    assert (await client.delete(url, headers=b["headers"])).json() == {"reactions": {"like": 0, "congrats": 1}, "my_reaction": None}
    assert (await client.delete(url, headers=b["headers"])).json()["reactions"] == {"like": 0, "congrats": 1}
    assert (await client.get(f"{API}/feed", headers=a["headers"])).json()["items"][0]["my_reaction"] is None


async def test_comments_replies_notifications_and_deleting(client, make_user):
    a = await student(client, make_user, "Post Muallifi")
    b = await student(client, make_user, "Bekzod Izohchi")
    c = await student(client, make_user, "Charos Javobchi")
    hr = await approved_employer(client, make_user)
    p = await post(client, a)
    url = f"{API}/posts/{p['id']}/comments"

    c1 = (await client.post(url, json={"text": "  Zo'r natija!  "}, headers=b["headers"]))
    assert c1.status_code == 201, c1.text
    c1 = c1.json()
    assert c1["text"] == "Zo'r natija!" and c1["parent_id"] is None and c1["mine"] and c1["can_delete"]
    assert c1["author"]["name"] == "Bekzod Izohchi" and c1["author"]["subtitle"] == "TDIU · Iqtisodiyot · 2-kurs"
    note = (await bell(client, a))[0]
    assert note["kind"] == "post_comment" and note["link"] == f"/talaba/hamjamiyat?post={p['id']}"
    assert note["params"]["name"] == "Bekzod Izohchi" and note["params"]["text"] == "Zo'r natija!"
    assert note["text"] == "Bekzod Izohchi postingizga izoh yozdi: «Zo'r natija!»"

    c2 = (await client.post(url, json={"text": "Rahmat!", "parent_id": c1["id"]}, headers=a["headers"])).json()
    assert c2["parent_id"] == c1["id"]
    assert (await bell(client, b))[0]["kind"] == "comment_reply"
    assert len(await bell(client, a)) == 1                               # no notice for your own reply
    # a reply to a reply hangs under the top-level comment; the post's author gets one notice, not two
    c3 = (await client.post(url, json={"text": "Men ham qo'shilaman", "parent_id": c2["id"]}, headers=c["headers"])).json()
    assert c3["parent_id"] == c1["id"]
    kinds = [n["kind"] for n in await bell(client, a)]
    assert kinds == ["comment_reply", "post_comment"]
    assert (await client.post(url, json={"text": "   "}, headers=c["headers"])).status_code == 422
    assert (await client.post(url, json={"text": "z" * 1001}, headers=c["headers"])).status_code == 422
    assert (await client.post(url, json={"text": "Yo'q izohga", "parent_id": 999999}, headers=c["headers"])).status_code == 404

    # a company comments as the company; its own post's notices carry no student link
    h1 = (await client.post(url, json={"text": "Bizga ariza yuboring"}, headers=hr["headers"])).json()
    assert h1["author"]["kind"] == "company" and h1["author"]["name"] == "Data Solutions MChJ"
    hp = await post(client, hr, "Amaliyot e'loni", kind="news")
    await client.post(f"{API}/posts/{hp['id']}/comments", json={"text": "Qiziqaman"}, headers=b["headers"])
    hr_note = (await bell(client, hr))[0]
    assert hr_note["kind"] == "post_comment" and hr_note["link"] == ""

    listed = (await client.get(url, headers=a["headers"])).json()
    assert [x["id"] for x in listed] == [c1["id"], c2["id"], c3["id"], h1["id"]]
    assert all(x["can_delete"] for x in listed)                          # the post's author may delete any
    seen_by_c = {x["id"]: x for x in (await client.get(url, headers=c["headers"])).json()}
    assert seen_by_c[c3["id"]]["can_delete"] and not seen_by_c[c1["id"]]["can_delete"]
    assert (await client.get(f"{API}/posts/{p['id']}", headers=a["headers"])).json()["comments_n"] == 4

    assert (await client.delete(f"{API}/comments/{c1['id']}", headers=c["headers"])).status_code == 403
    assert (await client.delete(f"{API}/comments/{c3['id']}", headers=c["headers"])).json() == {"ok": True}
    assert (await client.get(f"{API}/posts/{p['id']}", headers=a["headers"])).json()["comments_n"] == 3
    # the post's author removes a top-level comment: its replies go with it
    assert (await client.delete(f"{API}/comments/{c1['id']}", headers=a["headers"])).json() == {"ok": True}
    assert [x["id"] for x in (await client.get(url, headers=b["headers"])).json()] == [h1["id"]]
    assert (await client.get(f"{API}/posts/{p['id']}", headers=a["headers"])).json()["comments_n"] == 1
    assert (await client.delete(f"{API}/comments/{c1['id']}", headers=a["headers"])).status_code == 404
    # deleting a reply under a removed comment does not count it twice
    assert (await client.delete(f"{API}/comments/{c2['id']}", headers=a["headers"])).json() == {"ok": True}
    assert (await client.get(f"{API}/posts/{p['id']}", headers=a["headers"])).json()["comments_n"] == 1


async def test_three_reports_hide_a_post_until_an_admin_decides(client, make_user):
    admin_h = await owner(client)                          # the admin bell reaches accounts that exist
    a = await student(client, make_user, "Shikoyat Qilingan")
    r1, r2, r3 = [await student(client, make_user, f"Shikoyatchi {i}") for i in ("Bir", "Ikki", "Uch")]
    p = await post(client, a, "Bu yerda reklama bor")
    url = f"{API}/posts/{p['id']}/report"
    assert (await client.post(url, json={"reason": "spam"}, headers=a["headers"])).status_code == 422
    assert (await client.post(url, json={"reason": "bad"}, headers=r1["headers"])).status_code == 422
    assert (await client.post(url, json={"reason": "spam", "note": "Reklama"}, headers=r1["headers"])).json() == {"ok": True}
    assert (await client.post(url, json={"reason": "spam"}, headers=r1["headers"])).json() == {"ok": True}  # repeat: no error
    await client.post(url, json={"reason": "offensive"}, headers=r2["headers"])
    assert p["id"] in await feed_ids(client, r3)                         # two different people: still shown
    await client.post(url, json={"reason": "false"}, headers=r3["headers"])

    assert p["id"] not in await feed_ids(client, r1)
    assert (await client.get(f"{API}/posts/{p['id']}", headers=r1["headers"])).status_code == 404
    own = (await client.get(f"{API}/feed", headers=a["headers"])).json()["items"]
    assert own[0]["id"] == p["id"] and own[0]["status"] == "hidden"      # the author still sees it, marked
    assert (await client.get(f"{API}/me/posts", headers=a["headers"])).json()["items"][0]["status"] == "hidden"
    assert (await client.put(f"{API}/posts/{p['id']}/reaction", json={"kind": "like"}, headers=a["headers"])).status_code == 409
    note = (await bell(client, a))[0]
    assert note["kind"] == "post_hidden" and "yashirildi" in note["text"]

    notice = (await admin_bell(client, admin_h))[0]
    assert notice["kind"] == "post_hidden" and notice["link"] == "posts"
    queue = (await client.get(f"{API}/admin/posts", headers=admin_h)).json()
    assert [q["post"]["id"] for q in queue] == [p["id"]] and queue[0]["reports_open"] == 3
    assert {r["reason"] for r in queue[0]["reports"]} == {"spam", "offensive", "false"}
    assert any(r["reporter_name"] == "Shikoyatchi Bir" and r["note"] == "Reklama" for r in queue[0]["reports"])
    assert queue[0]["post"]["status"] == "hidden"
    assert [q["post"]["id"] for q in (await client.get(f"{API}/admin/posts", params={"status": "hidden"}, headers=admin_h)).json()] == [p["id"]]

    assert (await client.post(f"{API}/admin/posts/{p['id']}/restore", headers=admin_h)).json() == {"ok": True}
    assert p["id"] in await feed_ids(client, r1)
    assert (await client.get(f"{API}/admin/posts", headers=admin_h)).json() == []
    assert (await bell(client, a))[0]["kind"] == "post_restored"

    r = await client.post(f"{API}/admin/posts/{p['id']}/hide", json={"note": "Reklama joylash mumkin emas"}, headers=admin_h)
    assert r.json() == {"ok": True}
    assert p["id"] not in await feed_ids(client, r1)
    last = (await bell(client, a))[0]
    assert last["kind"] == "post_hidden_admin" and last["params"]["note"] == "Reklama joylash mumkin emas"
    hidden = (await client.get(f"{API}/admin/posts", params={"status": "hidden"}, headers=admin_h)).json()
    assert hidden[0]["hidden_note"] == "Reklama joylash mumkin emas"
    log = (await client.get(f"{API}/admin/audit", headers=admin_h)).json()
    assert {"post.hide", "post.restore"} <= {e["action"] for e in log}


async def test_comment_reports_admin_rules_and_permissions(client, make_user):
    admin_h = await owner(client)
    a = await student(client, make_user, "Post Egasi")
    b = await student(client, make_user, "Yomon Izoh")
    reporters = [await student(client, make_user, f"Kuzatuvchi {i}") for i in ("Bir", "Ikki", "Uch")]
    p = await post(client, a)
    bad = (await client.post(f"{API}/posts/{p['id']}/comments", json={"text": "Haqoratli gap"}, headers=b["headers"])).json()
    reply = (await client.post(f"{API}/posts/{p['id']}/comments", json={"text": "Bunday demang", "parent_id": bad["id"]},
                               headers=a["headers"])).json()
    assert (await client.post(f"{API}/comments/{bad['id']}/report", json={"reason": "offensive"},
                              headers=b["headers"])).status_code == 422
    for r in reporters:
        assert (await client.post(f"{API}/comments/{bad['id']}/report", json={"reason": "offensive"},
                                  headers=r["headers"])).json() == {"ok": True}
    assert (await admin_bell(client, admin_h))[0]["kind"] == "comment_reported"
    queue = (await client.get(f"{API}/admin/posts", headers=admin_h)).json()
    assert queue[0]["post"]["id"] == p["id"] and queue[0]["reports_open"] == 0
    assert queue[0]["comments"][0]["comment"]["id"] == bad["id"] and queue[0]["comments"][0]["reports_open"] == 3

    # the feed's moderation is the "complaints" permission: an analyst may look, not decide; a moderator may
    assert admin_access.required("POST", "/admin/posts/{post_id}/hide") == "complaints"
    assert admin_access.required("POST", "/admin/comments/{comment_id}/hide") == "complaints"
    analyst = await staff_account(client, "analyst", "analyst@careerup.test")
    assert (await client.get(f"{API}/admin/posts", headers=analyst)).status_code == 200
    assert (await client.post(f"{API}/admin/comments/{bad['id']}/hide", json={}, headers=analyst)).status_code == 403
    mod = await staff_account(client, "moderator", "mod@careerup.test")
    assert (await client.post(f"{API}/admin/comments/{bad['id']}/hide", json={"note": "Haqorat"}, headers=mod)).json() == {"ok": True}
    assert (await client.get(f"{API}/posts/{p['id']}/comments", headers=a["headers"])).json() == []
    assert (await client.get(f"{API}/posts/{p['id']}", headers=a["headers"])).json()["comments_n"] == 0
    assert (await client.get(f"{API}/admin/posts", headers=admin_h)).json() == []
    assert (await client.post(f"{API}/admin/comments/{bad['id']}/restore", headers=mod)).json() == {"ok": True}
    assert [x["id"] for x in (await client.get(f"{API}/posts/{p['id']}/comments", headers=a["headers"])).json()] == [bad["id"], reply["id"]]
    assert (await client.get(f"{API}/posts/{p['id']}", headers=a["headers"])).json()["comments_n"] == 2


def test_every_feed_admin_change_has_a_permission():
    router: APIRouter = feed_api.admin_router
    missing = [f"{m} {r.path}" for r in router.routes if isinstance(r, APIRoute)
               for m in r.methods - {"GET", "HEAD"} if admin_access.required(m, r.path) is None and not _owner_only(r)]
    assert missing == []


async def test_rate_limits_for_posts_and_comments(client, make_user):
    a = await student(client, make_user, "Faol Talaba")
    for i in range(10):
        await post(client, a, f"Kundalik yozuv {i + 1}")
    r = await client.post(f"{API}/posts", json={"kind": "experience", "text": "O'n birinchi"}, headers=a["headers"])
    assert r.status_code == 429 and "10" in r.json()["detail"]
    pid = (await feed_ids(client, a))[0]
    for i in range(10):
        assert (await client.post(f"{API}/posts/{pid}/comments", json={"text": f"Izoh {i}"}, headers=a["headers"])).status_code == 201
    assert (await client.post(f"{API}/posts/{pid}/comments", json={"text": "Yana"}, headers=a["headers"])).status_code == 429
