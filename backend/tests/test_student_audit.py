"""Student panel audit (2026-11-19): tests and tasks aimed at job functions, fixing a rejected task entry,
who sees task results, the optional track (sign-up reminder, peers, rating, match) and notification links."""
from datetime import UTC, date, datetime, time, timedelta
from types import SimpleNamespace

from app.api.jobs import match_score
from app.core.db import SessionLocal
from app.models import User
from app.services import reminders
from tests.conftest import owner_headers as owner
from tests.test_career import make_student, upload_doc
from tests.test_pipeline_and_inbox import API, live_job
from tests.test_signup_and_tests import TEST, approved_employer, full_student
from tests.test_university_panel import approved_staff

TASK = {"title": "Savdo ma'lumotlari tahlili", "description": "Berilgan CSV bo'yicha Power BI hisobot tayyorlang va xulosa yozing",
        "points": 20}
PROOF = {"proof_url": "https://github.com/someone/sales-report"}


def ends(days=7) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


async def no_track_student(client, make_user, name: str, fields: list[str]) -> dict:
    """A student who finished the sign-up of 2026-11-17 without a track."""
    u = await full_student(client, make_user, name)
    r = await client.patch(f"{API}/me", json={"track_id": None, "job_fields": fields}, headers=u["headers"])
    assert r.json()["track"] is None and r.json()["signup_missing"] == []
    return u


async def notes(client, u) -> list[dict]:
    return (await client.get(f"{API}/me/notifications", headers=u["headers"])).json()["items"]


async def live_test(client, hr, **body) -> dict:
    t = (await client.post(f"{API}/employer/tests", json={**TEST, **body}, headers=hr["headers"])).json()
    r = await client.post(f"{API}/admin/tests/{t['id']}/review", json={"approve": True}, headers=await owner(client))
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------------- audience by job functions

async def test_tests_reach_students_without_a_track_and_fields_tests_only_matching_ones(client, make_user):
    hr = await approved_employer(client, make_user)
    data = await no_track_student(client, make_user, "Aziza Yusupova", ["data"])
    design = await no_track_student(client, make_user, "Bekzod Karimov", ["design"])

    bad = await client.post(f"{API}/employer/tests", json={**TEST, "audience": "fields"}, headers=hr["headers"])
    assert bad.status_code == 422                                   # no job function picked
    bad = await client.post(f"{API}/employer/tests", json={**TEST, "audience": "fields", "job_fields": ["nope"]},
                            headers=hr["headers"])
    assert bad.status_code == 422                                   # not in the catalog

    everyone = await live_test(client, hr, job_fields=["data"])     # "all": the job functions are dropped
    assert everyone["job_fields"] == []
    for u in (data, design):                                        # the track is optional: both are told
        n = (await notes(client, u))[0]
        assert n["kind"] == "test_new" and n["link"] == "/talaba/topshiriqlar/testlar"
        assert n["text"].endswith("«Topshiriqlar» → «Testlar» bo'limida ishlang.")

    t = await live_test(client, hr, title="Data tahlilchilar uchun test", audience="fields", job_fields=["data", "data", "finance"])
    assert t["audience"] == "fields" and t["job_fields"] == ["data", "finance"]
    assert [x["id"] for x in (await client.get(f"{API}/tests", headers=data["headers"])).json()] == [t["id"], everyone["id"]]
    assert [x["id"] for x in (await client.get(f"{API}/tests", headers=design["headers"])).json()] == [everyone["id"]]
    assert (await client.post(f"{API}/tests/{t['id']}/start", headers=design["headers"])).status_code == 404
    assert (await notes(client, data))[0]["params"]["test"] == "Data tahlilchilar uchun test"
    assert (await notes(client, design))[0]["params"]["test"] == everyone["title"]

    # the graded test points to the tests page too
    q = (await client.post(f"{API}/tests/{t['id']}/start", headers=data["headers"])).json()["questions"]
    await client.post(f"{API}/tests/{t['id']}/submit", json={"answers": [{"question_id": q[2]["id"], "text": "Dashboard"}]},
                      headers=data["headers"])
    rows = (await client.get(f"{API}/employer/tests/{t['id']}/results", headers=hr["headers"])).json()["rows"]
    await client.post(f"{API}/employer/test-attempts/{rows[0]['attempt_id']}/grade",
                      json={"grades": [{"question_id": q[2]["id"], "points": 7}]}, headers=hr["headers"])
    graded = (await notes(client, data))[0]
    assert graded["kind"] == "test_graded" and graded["link"] == "/talaba/topshiriqlar/testlar"


async def test_fields_company_task_is_seen_and_announced_only_by_matching_students(client, make_user):
    hr, _ = await live_job(client, make_user)
    data = await no_track_student(client, make_user, "Aziza Yusupova", ["data", "finance"])
    design = await no_track_student(client, make_user, "Bekzod Karimov", ["design"])
    assert (await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": ends(), "audience": "fields"},
                              headers=hr["headers"])).status_code == 422
    assert (await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": ends(), "audience": "fields",
                                                            "job_fields": ["x"]}, headers=hr["headers"])).status_code == 422
    r = await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": ends(), "audience": "fields",
                                                        "job_fields": ["data", "software"]}, headers=hr["headers"])
    assert r.status_code == 201, r.text
    task = r.json()
    assert task["audience"] == "fields" and task["job_fields"] == ["data", "software"]

    n = (await notes(client, data))[0]
    assert n["kind"] == "company_task_new" and n["link"] == f"/talaba/topshiriqlar?vazifa={task['id']}"
    assert all(x["kind"] != "company_task_new" for x in await notes(client, design))
    assert [c["id"] for c in (await client.get(f"{API}/challenges", headers=data["headers"])).json()] == [task["id"]]
    assert (await client.get(f"{API}/challenges", headers=design["headers"])).json() == []
    assert (await client.get(f"{API}/challenges/{task['id']}", headers=design["headers"])).status_code == 404


# --------------------------------------------------------------------------- fixing a rejected entry

async def test_rejected_entry_can_be_fixed_until_the_deadline_but_an_accepted_one_cannot(client, make_user):
    hr, _ = await live_job(client, make_user)
    s = await make_student(client, make_user, "Aziza")
    task = (await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": ends()}, headers=hr["headers"])).json()
    entry = (await client.post(f"{API}/challenges/{task['id']}/enter", json=PROOF, headers=s["headers"])).json()
    review = f"{API}/employer/tasks/{task['id']}/entries/{entry['id']}/review"
    await client.post(review, json={"accept": False, "comment": "Havola ochilmaydi"}, headers=hr["headers"])
    n = (await notes(client, s))[0]
    assert n["kind"] == "challenge_result" and n["link"] == f"/talaba/topshiriqlar?vazifa={task['id']}"
    assert n["params"]["accepted"] is False and n["params"]["company"] == "Data Solutions MChJ"
    assert n["params"]["comment"] == "Havola ochilmaydi" and n["params"]["can_resubmit"] is True
    assert n["text"] == ("«Savdo ma'lumotlari tahlili» (Data Solutions MChJ) vazifasidagi ishingiz qabul qilinmadi. "
                         "Izoh: Havola ochilmaydi. Muddat tugaguncha tuzatib qayta yuborishingiz mumkin.")
    count = len(await notes(client, s))
    await client.post(review, json={"accept": False, "comment": "Havola ochilmaydi"}, headers=hr["headers"])
    assert len(await notes(client, s)) == count                     # the same review again: no second notice

    xlsx = await upload_doc(client, s["headers"], "tahlil.xlsx", b"PK\x03\x04 fake xlsx")
    r = await client.post(f"{API}/challenges/{task['id']}/enter",
                          json={"proof_url": "https://github.com/someone/fixed", "file_ids": [xlsx]}, headers=s["headers"])
    assert r.status_code == 201, r.text
    fixed = r.json()
    assert fixed["id"] == entry["id"] and fixed["status"] == "submitted" and fixed["score"] is None
    assert fixed["comment"] == "Havola ochilmaydi" and fixed["proof_url"] == "https://github.com/someone/fixed"
    assert fixed["files"][0]["name"] == "tahlil.xlsx"                # the student sees what they uploaded
    mine = (await client.get(f"{API}/challenges", headers=s["headers"])).json()[0]["my_entry"]
    assert mine["files"][0]["name"] == "tahlil.xlsx"
    detail = (await client.get(f"{API}/challenges/{task['id']}", headers=s["headers"])).json()
    assert detail["my_entry"]["files"][0]["name"] == "tahlil.xlsx"
    told = (await notes(client, hr))[0]
    assert told["kind"] == "task_resubmitted" and told["link"] == "/korxona/vazifalar"
    assert told["params"] == {"task": "Savdo ma'lumotlari tahlili", "student": "Aziza"}
    listed = (await client.get(f"{API}/employer/tasks", headers=hr["headers"])).json()
    assert listed[0]["to_review"] == 1

    await client.post(review, json={"accept": True, "score": 90, "comment": "Endi zo'r"}, headers=hr["headers"])
    n = (await notes(client, s))[0]
    assert n["params"]["points"] == 20 and n["params"]["score"] == 90 and "+20 ball" in n["text"]
    assert (await client.get(f"{API}/me", headers=s["headers"])).json()["points"] == 20
    assert (await client.post(f"{API}/challenges/{task['id']}/enter", json=PROOF, headers=s["headers"])).status_code == 409


async def test_moving_a_place_keeps_the_company_cap_for_the_previous_holder(client, make_user):
    hr, _ = await live_job(client, make_user)
    x = await make_student(client, make_user, "Aziza")
    y = await make_student(client, make_user, "Bekzod")
    first = (await client.post(f"{API}/employer/tasks", json={**TASK, "points": 50, "ends_on": ends()}, headers=hr["headers"])).json()
    second = (await client.post(f"{API}/employer/tasks", json={**TASK, "title": "Ikkinchi vazifa", "points": 50,
                                                              "ends_on": ends()}, headers=hr["headers"])).json()
    ids = {}
    for t in (first, second):
        for u in (x, y):
            ids[t["id"], u["id"]] = (await client.post(f"{API}/challenges/{t['id']}/enter", json=PROOF,
                                                       headers=u["headers"])).json()["id"]

    def url(t, u):
        return f"{API}/employer/tasks/{t['id']}/entries/{ids[t['id'], u['id']]}/review"
    await client.post(url(first, x), json={"accept": True, "place": 1}, headers=hr["headers"])       # 50 + 30
    await client.post(url(second, x), json={"accept": True, "place": 1}, headers=hr["headers"])      # capped at 20
    assert (await client.get(f"{API}/me", headers=x["headers"])).json()["points"] == 100
    # first place moves to Bekzod: Aziza drops to the entry points, still within the company's 100
    await client.post(url(second, y), json={"accept": True, "place": 1}, headers=hr["headers"])
    assert (await client.get(f"{API}/me", headers=x["headers"])).json()["points"] == 100


# --------------------------------------------------------------------------- privacy and visibility

async def test_results_are_for_students_and_tasks_of_unapproved_companies_disappear(client, make_user):
    hr, _ = await live_job(client, make_user)
    s = await make_student(client, make_user, "Aziza")
    other = await make_student(client, make_user, "Bekzod")
    task = (await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": ends()}, headers=hr["headers"])).json()
    entry = (await client.post(f"{API}/challenges/{task['id']}/enter", json=PROOF, headers=s["headers"])).json()
    await client.post(f"{API}/employer/tasks/{task['id']}/entries/{entry['id']}/review",
                      json={"accept": True, "score": 88, "place": 1}, headers=hr["headers"])
    seen = (await client.get(f"{API}/challenges/{task['id']}", headers=other["headers"])).json()
    assert seen["results"] == [{"student": "Aziza", "place": 1, "score": 88}]
    staff = await approved_staff(client, make_user)
    for viewer in (hr, staff):                                       # names and scores stay with students
        r = await client.get(f"{API}/challenges/{task['id']}", headers=viewer["headers"])
        assert r.status_code == 200 and r.json()["results"] == []

    await client.post(f"{API}/admin/companies/{hr['company_id']}/review", json={"approve": False, "note": "Hujjat eskirgan"},
                      headers=await owner(client))
    assert (await client.get(f"{API}/challenges", headers=other["headers"])).json() == []
    assert (await client.get(f"{API}/challenges/{task['id']}", headers=other["headers"])).status_code == 404
    assert (await client.post(f"{API}/challenges/{task['id']}/enter", json=PROOF, headers=other["headers"])).status_code == 404


# --------------------------------------------------------------------------- the optional track

async def test_sign_up_reminder_follows_the_app_gate(client, make_user):
    done = await no_track_student(client, make_user, "Aziza Yusupova", ["data"])
    left = await make_user("Chiqib ketgan")
    async with SessionLocal() as s:
        people = [await s.get(User, done["id"]), await s.get(User, left["id"])]
        assert [u.id for u in reminders.unfinished_signup(people)] == [left["id"]]
    assert "yo'nalish, universitet" not in reminders.NUDGE_TEXT and "kasb yo'nalish" in reminders.NUDGE_TEXT


async def test_peers_fall_back_to_job_functions_and_track_rating_is_empty(client, make_user):
    me = await no_track_student(client, make_user, "Aziza Yusupova", ["data"])
    await no_track_student(client, make_user, "Bekzod Karimov", ["finance", "data"])
    await no_track_student(client, make_user, "Dilnoza Aliyeva", ["design"])
    peers = (await client.get(f"{API}/peers", headers=me["headers"])).json()
    assert [p["full_name"] for p in peers] == ["Bekzod Karimov"]
    board = (await client.get(f"{API}/leaderboard", params={"scope": "track"}, headers=me["headers"])).json()
    assert board == {"rows": [], "my_rank": 0}
    assert len((await client.get(f"{API}/leaderboard", headers=me["headers"])).json()["rows"]) == 3


def test_a_track_only_job_is_unknown_for_a_student_without_a_track():
    job = SimpleNamespace(skills=[], job_fields=[], track_ids=[1], kind="junior", company=None)
    blank = dict(skills=[], job_fields=["data"], job_types=[], work_industries=[])
    assert match_score(job, SimpleNamespace(**blank, track_id=None)) == 40       # job function unknown: a quarter
    assert match_score(job, SimpleNamespace(**blank, track_id=2)) == 30          # another track: no job-function points
    assert match_score(job, SimpleNamespace(**blank, track_id=1)) == 70


def test_the_chosen_job_field_beats_skills_left_from_an_old_track():
    """Company panel audit 2026-11-19: a marketing student with old SQL skills saw a data job above an SMM job."""
    student = SimpleNamespace(skills=["Excel", "SQL", "Ingliz B2"], job_fields=["marketing", "content"],
                              job_types=["internship"], work_industries=[], track_id=None)
    smm = SimpleNamespace(skills=["SMM", "Canva"], job_fields=["marketing", "content"], track_ids=[], kind="internship",
                          company=None)
    data = SimpleNamespace(skills=["SQL", "Power BI"], job_fields=[], track_ids=[], kind="internship", company=None)
    assert match_score(smm, student) == 60
    assert match_score(data, student) < match_score(smm, student)


# --------------------------------------------------------------------------- links, dates and the GPA scale

async def test_university_event_link_and_tashkent_date(client, make_user):
    staff = await approved_staff(client, make_user)
    s = await make_student(client, make_user, "Ali Valiyev")
    day = date.today() + timedelta(days=3)
    start = datetime.combine(day, time(20, 30), UTC)                # 01:30 the next day in Tashkent
    r = await client.post(f"{API}/university/events", json={"title": "Ish yarmarkasi", "kind": "job_fair",
                                                           "starts_at": start.isoformat()}, headers=staff["headers"])
    assert r.status_code == 201, r.text
    n = (await notes(client, s))[0]
    assert n["kind"] == "university_event" and n["link"] == "/talaba/tadbirlar"
    assert f"({(day + timedelta(days=1)).strftime('%d.%m.%Y')})" in n["text"]


async def test_changing_only_the_gpa_scale_below_the_stored_gpa_is_refused(client, make_user):
    s = await full_student(client, make_user, "Aziza Yusupova")
    assert (await client.patch(f"{API}/me", json={"gpa": 4.5, "gpa_scale": 5}, headers=s["headers"])).status_code == 200
    r = await client.patch(f"{API}/me", json={"gpa_scale": 4}, headers=s["headers"])
    assert r.status_code == 422 and "shkala" in r.json()["detail"]
    r = await client.patch(f"{API}/me", json={"gpa_scale": 4, "gpa": 3.6}, headers=s["headers"])
    assert r.status_code == 200 and r.json()["gpa_scale"] == 4
