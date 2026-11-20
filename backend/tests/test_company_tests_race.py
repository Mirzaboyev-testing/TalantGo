"""Parallel taps on a company test (2026-11-20 live test): three "Topshirish" requests at once all passed,
wrote the answers over each other and told the company three times. Now one wins and the others get 409."""
import asyncio

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import Notification, TestAttempt
from tests.conftest import owner_headers as owner
from tests.test_signup_and_tests import TEST, approved_employer, full_student


async def _approved_test(client, hr: dict) -> dict:
    t = (await client.post("/api/v1/employer/tests", json=TEST, headers=hr["headers"])).json()
    r = await client.post(f"/api/v1/admin/tests/{t['id']}/review", json={"approve": True}, headers=await owner(client))
    assert r.status_code == 200, r.text
    return t


async def _notices(kind: str) -> int:
    async with SessionLocal() as session:
        return await session.scalar(select(func.count()).select_from(Notification).where(Notification.kind == kind))


def _answers(q: list[dict], text: str) -> list[dict]:
    return [{"question_id": q[0]["id"], "choice": [1]}, {"question_id": q[1]["id"], "choice": [0, 1]},
            {"question_id": q[2]["id"], "text": text}, {"question_id": q[3]["id"], "choice": [0]}]


async def test_parallel_submits_count_once_and_tell_the_company_once(client, make_user):
    hr = await approved_employer(client, make_user)
    student = await full_student(client, make_user, "Aziza Yusupova")
    t = await _approved_test(client, hr)
    q = (await client.post(f"/api/v1/tests/{t['id']}/start", headers=student["headers"])).json()["questions"]

    url = f"/api/v1/tests/{t['id']}/submit"
    replies = await asyncio.gather(*(client.post(url, json={"answers": _answers(q, f"Javob {i}")}, headers=student["headers"])
                                     for i in range(3)))
    assert sorted(r.status_code for r in replies) == [200, 409, 409], [r.text for r in replies]
    assert all("allaqachon" in r.json()["detail"] for r in replies if r.status_code == 409)
    won = next(r for r in replies if r.status_code == 200).json()
    assert won["status"] == "submitted" and won["score"] == 10                # single and multi right, text waits

    # the stored answers are the winner's, not a later request's
    async with SessionLocal() as session:
        attempt = await session.scalar(select(TestAttempt).where(TestAttempt.test_id == t["id"]))
        texts = [a["text"] for a in attempt.answers if a["text"]]
    assert texts == [next(i["text"] for i in won["items"] if i["text"])]
    assert await _notices("test_submitted") == 1

    # a later submit still gets the same answer
    late = await client.post(url, json={"answers": _answers(q, "Yana")}, headers=student["headers"])
    assert late.status_code == 409


async def test_two_staff_grading_at_once_tell_the_student_once(client, make_user):
    hr = await approved_employer(client, make_user)
    student = await full_student(client, make_user, "Aziza Yusupova")
    t = await _approved_test(client, hr)
    q = (await client.post(f"/api/v1/tests/{t['id']}/start", headers=student["headers"])).json()["questions"]
    r = await client.post(f"/api/v1/tests/{t['id']}/submit", json={"answers": _answers(q, "Power BI")}, headers=student["headers"])
    assert r.status_code == 200, r.text
    attempt_id = r.json()["id"]

    url = f"/api/v1/employer/test-attempts/{attempt_id}/grade"
    replies = await asyncio.gather(*(client.post(url, json={"grades": [{"question_id": q[2]["id"], "points": p}]},
                                                 headers=hr["headers"]) for p in (7, 8)))
    assert [r.status_code for r in replies] == [200, 200], [r.text for r in replies]
    assert {r.json()["status"] for r in replies} == {"graded"}
    assert await _notices("test_graded") == 1
    final = (await client.get(f"/api/v1/employer/test-attempts/{attempt_id}", headers=hr["headers"])).json()
    assert final["score"] in (17, 18)                                          # the last grader's points stand
