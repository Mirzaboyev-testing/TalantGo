"""Notifications phase 2: collapsing threads (chat, a task's new entries), no track-wide pings, company event notices,
interview and deadline reminders, the weekly digest for everyone, and admin announcements in the bell."""
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.core.db import SessionLocal
from app.models import Application, AppConfig, Challenge, Job, Notification, User
from app.services import notify, reminders
from app.services.progress import TASHKENT
from tests.conftest import owner_headers as owner
from tests.test_company_tasks import TASK
from tests.test_pipeline_and_inbox import applied_student, live_job
from tests.test_signup_and_tests import TEST, full_student

API = "/api/v1"


@pytest.fixture
def pings(monkeypatch):
    sent: list[tuple[list[int], str]] = []
    monkeypatch.setattr(notify, "send", lambda ids, text, **kw: sent.append(([i for i in ids if i], text)))
    return sent


async def bell(client, headers, unread_only=True) -> list[dict]:
    items = (await client.get(f"{API}/me/notifications", headers=headers)).json()["items"]
    return [n for n in items if not unread_only or not n["read"]]


async def tg_id(user_id: int) -> int:
    async with SessionLocal() as s:
        return (await s.get(User, user_id)).telegram_id


async def test_chat_collapses_into_one_unread_notice_and_one_ping(client, make_user, pings):
    hr, job = await live_job(client, make_user)
    student = await applied_student(client, make_user, job)
    thread = (await client.post(f"{API}/me/chats", json={"company_id": hr["company_id"]}, headers=student["headers"])).json()
    thread_id = thread.get("thread", thread)["id"]
    pings.clear()
    for i in range(3):
        r = await client.post(f"{API}/me/chats/{thread_id}/messages", json={"text": f"Salom {i}"}, headers=student["headers"])
        assert r.status_code == 201
    chat = [n for n in await bell(client, hr["headers"]) if n["kind"] == "chat_message"]
    assert len(chat) == 1 and chat[0]["params"]["count"] == 3 and chat[0]["params"]["text"] == "Salom 2"
    assert chat[0]["text"].endswith("3 ta yangi xabar")
    hr_tg = await tg_id(hr["id"])
    assert sum(hr_tg in ids for ids, _ in pings) == 1                 # one Telegram ping, not three

    # once read, the next message starts a new notice and pings again
    await client.post(f"{API}/me/notifications/read", json={}, headers=hr["headers"])
    await client.post(f"{API}/me/chats/{thread_id}/messages", json={"text": "Yana savol"}, headers=student["headers"])
    chat = [n for n in await bell(client, hr["headers"]) if n["kind"] == "chat_message"]
    assert len(chat) == 1 and chat[0]["params"]["count"] == 1
    assert sum(hr_tg in ids for ids, _ in pings) == 2


async def test_new_task_entries_collapse_and_resubmission_stays_separate(client, make_user, pings):
    hr, _ = await live_job(client, make_user)
    task = (await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": (date.today() + timedelta(days=7)).isoformat()},
                              headers=hr["headers"])).json()
    a = await full_student(client, make_user, "Aziza Karimova")
    b = await full_student(client, make_user, "Bobur Aliyev")
    for s, url in ((a, "https://github.com/aziza/report"), (b, "https://github.com/bobur/report")):
        r = await client.post(f"{API}/challenges/{task['id']}/enter", json={"proof_url": url}, headers=s["headers"])
        assert r.status_code == 201, r.text
    entries = [n for n in await bell(client, hr["headers"]) if n["kind"] == "task_entry_new"]
    assert len(entries) == 1 and entries[0]["params"]["count"] == 2 and "Jami 2 ta yangi ish" in entries[0]["text"]
    # editing an entry before review is not a new entry
    await client.post(f"{API}/challenges/{task['id']}/enter", json={"proof_url": "https://github.com/aziza/report-v2"},
                      headers=a["headers"])
    assert [n["params"]["count"] for n in await bell(client, hr["headers"]) if n["kind"] == "task_entry_new"] == [2]


async def test_company_event_reaches_students_who_know_the_company(client, make_user):
    hr, job = await live_job(client, make_user)
    applicant = await applied_student(client, make_user, job, name="Dilnoza")
    stranger = await full_student(client, make_user, "Sardor Toshmatov")
    start = (datetime.now(TASHKENT) + timedelta(days=3)).replace(microsecond=0, tzinfo=None)
    r = await client.post(f"{API}/employer/events", json={
        "title": "Ochiq eshiklar kuni", "description": "Ofisimizga keling, jamoa bilan tanishing va savollar bering.",
        "kind": "open_day", "starts_at": start.isoformat(), "place": "Toshkent, Amir Temur 1"}, headers=hr["headers"])
    assert r.status_code == 201, r.text
    assert [n["kind"] for n in await bell(client, applicant["headers"])][0] == "company_event"
    assert all(n["kind"] != "company_event" for n in await bell(client, stranger["headers"]))


async def test_interview_reminder_once_and_again_after_a_new_time(client, make_user):
    hr, job = await live_job(client, make_user)
    student = await applied_student(client, make_user, job)
    now = datetime.now(UTC)
    async with SessionLocal() as s:
        await s.execute(update(Application).where(Application.id == student["application_id"]).values(
            status="interview", interview_at=now + timedelta(hours=5), interview_place="Online"))
        await s.commit()
    assert await reminders.remind_interviews(now) == 1
    assert await reminders.remind_interviews(now) == 0                 # not twice for the same time
    note = (await bell(client, student["headers"]))[0]
    assert note["kind"] == "interview_reminder" and "Online" in note["text"] and note["link"] == "/talaba/arizalar"
    async with SessionLocal() as s:                                     # the company moves it: a new reminder
        await s.execute(update(Application).where(Application.id == student["application_id"]).values(
            interview_at=now + timedelta(hours=20)))
        await s.commit()
    assert await reminders.remind_interviews(now) == 1
    # too far ahead: nothing yet
    async with SessionLocal() as s:
        await s.execute(update(Application).where(Application.id == student["application_id"]).values(
            interview_at=now + timedelta(days=3)))
        await s.commit()
    assert await reminders.remind_interviews(now) == 0


async def test_deadline_reminders_for_started_tests_and_invited_tasks(client, make_user):
    hr, _ = await live_job(client, make_user)
    admin = await owner(client)
    started = await full_student(client, make_user, "Aziza Karimova")
    idle = await full_student(client, make_user, "Bobur Aliyev")
    invited = await full_student(client, make_user, "Lola Rahimova")
    now = datetime.now(UTC)
    tomorrow = (now.astimezone(TASHKENT).date() + timedelta(days=1)).isoformat()
    t = (await client.post(f"{API}/employer/tests", json={**TEST, "deadline": tomorrow}, headers=hr["headers"])).json()
    await client.post(f"{API}/admin/tests/{t['id']}/review", json={"approve": True}, headers=admin)
    assert (await client.post(f"{API}/tests/{t['id']}/start", headers=started["headers"])).status_code in (200, 201)

    task = (await client.post(f"{API}/employer/tasks", json={
        **TASK, "ends_on": (now.astimezone(TASHKENT).date() + timedelta(days=1)).isoformat(),
        "audience": "selected", "student_ids": [invited["id"]]}, headers=hr["headers"])).json()
    assert "id" in task, task
    async with SessionLocal() as s:
        ends_at = (await s.get(Challenge, task["id"])).ends_at
    moment = ends_at - timedelta(hours=10)                             # ten hours before the task closes
    sent = await reminders.remind_deadlines(moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment)
    assert sent >= 1
    assert any(n["kind"] == "task_deadline" for n in await bell(client, invited["headers"]))
    assert not any("deadline" in n["kind"] for n in await bell(client, idle["headers"]))
    # the test closes tomorrow relative to `moment` only if the dates line up; check it explicitly with `now`
    async with SessionLocal() as s:
        await s.execute(update(Challenge).where(Challenge.id == task["id"]).values(deadline_reminded_at=None))
        await s.commit()
    await reminders.remind_deadlines(now)
    assert any(n["kind"] == "test_deadline" for n in await bell(client, started["headers"]))
    assert await reminders.remind_deadlines(now) == 0                   # each item once


async def test_weekly_digest_reaches_students_without_a_track_in_the_bell(client, make_user):
    hr, job = await live_job(client, make_user)
    student = await full_student(client, make_user, "Lola Rahimova")
    await client.patch(f"{API}/me", json={"track_id": None}, headers=student["headers"])
    async with SessionLocal() as s:                 # the vacancy is for one of her job functions
        await s.execute(update(Job).where(Job.id == job["id"]).values(job_fields=["data"]))
        await s.commit()
    await client.post(f"{API}/employer/tasks", json={**TASK, "ends_on": (date.today() + timedelta(days=10)).isoformat()},
                      headers=hr["headers"])
    unfinished = await make_user("Yarim Talaba")
    today = datetime.now(TASHKENT)
    monday = (today + timedelta(days=7 - today.weekday())).replace(hour=10, minute=30)    # next Monday, after 10:00
    async with SessionLocal() as s:                 # the vacancy came out during the week before that Monday
        await s.execute(update(Job).where(Job.id == job["id"]).values(created_at=monday - timedelta(days=1)))
        await s.commit()
    sent = await reminders.run_once(monday)                            # no bot token: the bell still gets it
    assert sent == 0
    digest = [n for n in await bell(client, student["headers"]) if n["kind"] == "weekly_digest"]
    assert len(digest) == 1 and "1 ta yangi vakansiya" in digest[0]["text"] and "korxona vazifasi" in digest[0]["text"]
    assert not any(n["kind"] == "weekly_digest" for n in await bell(client, unfinished["headers"]))
    assert await reminders.run_once(monday) == 0
    assert len([n for n in await bell(client, student["headers"]) if n["kind"] == "weekly_digest"]) == 1   # once a week


async def test_admin_announcement_goes_to_the_chosen_audience_in_the_bell(client, make_user):
    hr, _ = await live_job(client, make_user)
    student = await full_student(client, make_user, "Aziza Karimova")
    admin = await owner(client)
    r = await client.post(f"{API}/admin/announcements", json={"text": "Korxonalar uchun yangi qoida", "audience": "companies"},
                          headers=admin)
    assert r.status_code == 201, r.text
    assert r.json()["in_app"] == 1 and r.json()["total"] == 0           # no bot token set: the bell only
    assert [n["kind"] for n in await bell(client, hr["headers"])][0] == "admin_announcement"
    assert all(n["kind"] != "admin_announcement" for n in await bell(client, student["headers"]))
    note = (await bell(client, hr["headers"]))[0]
    assert note["link"] == "/korxona"

    r = await client.post(f"{API}/admin/announcements", json={"text": "Hammaga salom", "audience": "all"}, headers=admin)
    assert r.json()["in_app"] == 2
    assert (await bell(client, student["headers"]))[0]["link"] == "/talaba"
    # a filter nobody matches is refused
    r = await client.post(f"{API}/admin/announcements", json={"text": "Bo'sh guruh", "audience": "students",
                                                              "group_name": "yo'q-guruh"}, headers=admin)
    assert r.status_code == 400
