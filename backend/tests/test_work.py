import io
import json

from openpyxl import Workbook

from app.core.db import SessionLocal
from app.models import Role
from app.services import ai_review, files, settings_store
from tests.conftest import owner_headers


async def _setup(client, make_user):
    track = next(t for t in (await client.get("/api/v1/tracks")).json() if t["slug"] == "data-analytics")
    users = {name: await make_user(name) for name in ("Aziza", "Bekzod")}
    users["Mentor"] = await make_user("Mentor", Role.mentor)
    for name in ("Aziza", "Bekzod"):
        await client.patch("/api/v1/me", json={"track_id": track["id"]}, headers=users[name]["headers"])
    tasks = (await client.get(f"/api/v1/tracks/{track['id']}/tasks", headers=users["Aziza"]["headers"])).json()
    return track, [t for t in tasks if t["kind"] == "submission"], users


def _xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Savdo"
    ws.append(["Oy", "Summa"])
    ws.append(["Yanvar", 120])
    ws.append(["Fevral", 80])
    ws["B4"] = "=SUM(B2:B3)"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def _upload(client, headers, name="hisobot.xlsx", data=None):
    r = await client.post("/api/v1/uploads", files={"file": (name, data or _xlsx())}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_submit_with_a_file_and_open_it(client, make_user):
    track, tasks, u = await _setup(client, make_user)
    up = await _upload(client, u["Aziza"]["headers"])
    r = await client.post(f"/api/v1/tasks/{tasks[0]['id']}/submit", json={"file_ids": [up["id"]], "note": "Excel"},
                          headers=u["Aziza"]["headers"])
    assert r.status_code == 201, r.text
    sub = r.json()
    assert sub["proof_url"] == "" and [f["name"] for f in sub["files"]] == ["hisobot.xlsx"]

    queue = (await client.get("/api/v1/reviews/queue", headers=u["Bekzod"]["headers"])).json()
    url = queue[0]["files"][0]["url"]
    got = await client.get(url)
    assert got.status_code == 200 and got.content[:2] == b"PK"
    assert got.headers["content-type"] == "application/octet-stream"
    assert "attachment" in got.headers["content-disposition"]
    assert (await client.get(url.split("?")[0] + "?t=forged")).status_code == 403

    # a file can be attached once, and only by its owner
    assert (await client.post(f"/api/v1/tasks/{tasks[1]['id']}/submit", json={"file_ids": [up["id"]]},
                              headers=u["Aziza"]["headers"])).status_code == 422
    other = await _upload(client, u["Bekzod"]["headers"])
    assert (await client.post(f"/api/v1/tasks/{tasks[1]['id']}/submit", json={"file_ids": [other["id"]]},
                              headers=u["Aziza"]["headers"])).status_code == 422
    assert (await client.post(f"/api/v1/tasks/{tasks[1]['id']}/submit", json={"note": "hech narsa"},
                              headers=u["Aziza"]["headers"])).status_code == 422


async def test_upload_limits(client, make_user):
    u = await make_user("Aziza")
    r = await client.post("/api/v1/uploads", files={"file": ("bo'sh.txt", b"")}, headers=u["headers"])
    assert r.status_code == 422
    from app.core.config import settings
    big = b"x" * (settings.max_upload_mb * 1024 * 1024 + 1)
    assert (await client.post("/api/v1/uploads", files={"file": ("katta.csv", big)}, headers=u["headers"])).status_code == 413


async def test_excel_is_readable_for_the_ai(client, make_user):
    u = await make_user("Aziza")
    up = await _upload(client, u["headers"])
    async with SessionLocal() as s:
        from app.models import SubmissionFile
        row = await s.get(SubmissionFile, up["id"])
    parts = files.ai_parts([(row.filename, row.stored_name, row.size)])
    text = parts[0]["text"]
    assert "Varaq: Savdo" in text and "Yanvar | 120" in text and "=SUM(B2:B3)" in text
    unknown = files.ai_parts([("dashboard.pbix", row.stored_name, row.size)])
    assert "o'qib bo'lmadi" in unknown[0]["text"]


async def test_questions_to_the_mentor(client, make_user):
    track, tasks, u = await _setup(client, make_user)
    outsider = await make_user("Boshqa")
    task_id = tasks[0]["id"]
    r = await client.post(f"/api/v1/tasks/{task_id}/questions", json={"text": "Ma'lumotni qayerdan olamiz?"},
                          headers=u["Aziza"]["headers"])
    assert r.status_code == 201 and r.json()["is_mine"]
    assert (await client.get(f"/api/v1/tasks/{task_id}/questions", headers=outsider["headers"])).status_code == 403
    assert (await client.get("/api/v1/mentor/questions", headers=u["Aziza"]["headers"])).status_code == 403

    open_q = (await client.get("/api/v1/mentor/questions", headers=u["Mentor"]["headers"])).json()
    assert [q["text"] for q in open_q] == ["Ma'lumotni qayerdan olamiz?"]
    r = await client.post(f"/api/v1/questions/{open_q[0]['id']}/answer", json={"answer": "Kaggle'dagi savdo to'plami"},
                          headers=u["Mentor"]["headers"])
    assert r.json()["answered_by"] == "Mentor"
    assert (await client.get("/api/v1/mentor/questions", headers=u["Mentor"]["headers"])).json() == []

    seen = (await client.get(f"/api/v1/tasks/{task_id}/questions", headers=u["Bekzod"]["headers"])).json()
    assert seen[0]["answer"] == "Kaggle'dagi savdo to'plami" and not seen[0]["is_mine"]
    listed = (await client.get(f"/api/v1/tracks/{track['id']}/tasks", headers=u["Bekzod"]["headers"])).json()
    assert next(t for t in listed if t["id"] == task_id)["questions"] == 1


async def _enable_ai(monkeypatch, verdicts: list[dict]):
    async def fake_generate(key, model, parts, **kwargs):
        fake_generate.calls.append(parts)
        return json.dumps(verdicts.pop(0)) if verdicts else "OK"
    fake_generate.calls = []
    monkeypatch.setattr(ai_review, "generate", fake_generate)
    async with SessionLocal() as s:
        await settings_store.set_value(s, settings_store.GEMINI_KEY, "AIza-test-key-0000000000")
        await ai_review.save_config(s, ai_review.AiConfig(enabled=True))
    return fake_generate


async def test_ai_vote_counts_as_a_peer(client, make_user, monkeypatch):
    track, tasks, u = await _setup(client, make_user)
    fake = await _enable_ai(monkeypatch, [{"verdict": "approve", "score": 85, "feedback": "Formulalar to'g'ri."}])
    up = await _upload(client, u["Aziza"]["headers"])
    sub = (await client.post(f"/api/v1/tasks/{tasks[0]['id']}/submit", json={"file_ids": [up["id"]]},
                             headers=u["Aziza"]["headers"])).json()
    assert sub["ai_state"] == "checking"
    # peers wait while the AI is looking
    assert (await client.get("/api/v1/reviews/queue", headers=u["Bekzod"]["headers"])).json() == []

    await ai_review.run_review(sub["id"], 1)
    assert "=SUM(B2:B3)" in json.dumps(fake.calls[0])
    mine = next(t for t in (await client.get(f"/api/v1/tracks/{track['id']}/tasks", headers=u["Aziza"]["headers"])).json()
                if t["id"] == tasks[0]["id"])["submission"]
    assert mine["ai_state"] == "done" and mine["status"] == "pending"        # tests require two votes
    assert mine["reviews"][0]["kind"] == "ai" and mine["reviews"][0]["reviewer_name"] == "AI yordamchi"

    r = await client.post(f"/api/v1/submissions/{sub['id']}/reviews", json={"approved": True, "comment": "Hammasi aniq, yaxshi"},
                          headers=u["Bekzod"]["headers"])
    assert r.json()["status"] == "peer_verified"
    cv = (await client.get("/api/v1/me/cv", headers=u["Aziza"]["headers"])).json()
    assert {v["name"] for v in cv["achievements"][0]["verified_by"]} == {"AI yordamchi", "Bekzod"}


async def test_ai_unsure_leaves_the_work_to_people(client, make_user, monkeypatch):
    track, tasks, u = await _setup(client, make_user)
    await _enable_ai(monkeypatch, [{"verdict": "unsure", "score": 0, "feedback": "Havola ochilmadi."}])
    sub = (await client.post(f"/api/v1/tasks/{tasks[0]['id']}/submit", json={"proof_url": "github.com/aziza/sql"},
                             headers=u["Aziza"]["headers"])).json()
    await ai_review.run_review(sub["id"], 1)
    queue = (await client.get("/api/v1/reviews/queue", headers=u["Bekzod"]["headers"])).json()
    assert [q["submission_id"] for q in queue] == [sub["id"]] and queue[0]["peer_reviews"] == 0
    mine = next(t for t in (await client.get(f"/api/v1/tracks/{track['id']}/tasks", headers=u["Aziza"]["headers"])).json()
                if t["id"] == tasks[0]["id"])["submission"]
    assert mine["ai_state"] == "unsure" and mine["ai_note"] == "Havola ochilmadi." and mine["reviews"] == []


async def test_admin_ai_settings(client, make_user, monkeypatch):
    headers = await owner_headers(client)
    status = (await client.get("/api/v1/admin/ai", headers=headers)).json()
    assert status["configured"] is False and status["enabled"] is False
    r = await client.put("/api/v1/admin/ai", json={"enabled": True, "model": "gemini-3.8-flash"}, headers=headers)
    assert r.status_code == 400                                   # no key yet

    async def fake_generate(key, model, parts, **kwargs):
        return "OK"
    monkeypatch.setattr(ai_review, "generate", fake_generate)
    r = await client.put("/api/v1/admin/ai", json={"enabled": True, "model": "gemini-3.8-flash",
                                                   "api_key": "AIzaSyTestKey1234567890"}, headers=headers)
    assert r.status_code == 200 and r.json()["configured"] and r.json()["hint"] != "AIzaSyTestKey1234567890"
    assert (await client.post("/api/v1/admin/ai/test", headers=headers)).json()["reply"] == "OK"
    assert (await client.put("/api/v1/admin/ai", json={"enabled": True, "model": "bad model!"},
                             headers=headers)).status_code == 422


async def test_careerflow_ai_chat(client, make_user, monkeypatch):
    track, tasks, u = await _setup(client, make_user)
    h = u["Aziza"]["headers"]
    assert (await client.get("/api/v1/assistant/status", headers=h)).json()["available"] is False
    assert (await client.post("/api/v1/assistant/chat", json={"messages": [{"role": "user", "text": "Salom"}]},
                              headers=h)).status_code == 503

    seen = {}

    async def fake_generate(key, model, parts, **kwargs):
        seen.update(kwargs)
        return "Yo'l bo'limida topshiriqni oching va fayl yuklang."
    monkeypatch.setattr(ai_review, "generate", fake_generate)
    async with SessionLocal() as s:
        await settings_store.set_value(s, settings_store.GEMINI_KEY, "AIza-test-key-0000000000")
    assert (await client.get("/api/v1/assistant/status", headers=h)).json()["available"] is True

    history = [{"role": "user", "text": "Topshiriqni qanday topshiraman?"}]
    r = await client.post("/api/v1/assistant/chat", json={"messages": history}, headers=h)
    assert r.status_code == 200 and "fayl yuklang" in r.json()["reply"]
    assert seen["contents"][0]["parts"][0]["text"] == "Topshiriqni qanday topshiraman?"
    # the guide and the student's own state travel with every question
    assert "Fayl tanlash" in seen["system"] and "Aziza" in seen["system"] and tasks[0]["title"] in seen["system"]
    assert (await client.post("/api/v1/assistant/chat", json={"messages": [{"role": "model", "text": "Salom"}]},
                              headers=h)).status_code == 422
