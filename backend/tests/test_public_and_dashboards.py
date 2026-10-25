"""Phase 3: the public website, saved vacancies, the student and company dashboards and the candidates table."""
from tests.conftest import owner_headers as owner
from tests.test_career import JOB
from tests.test_pipeline_and_inbox import API, applied_student, live_job, move


async def test_public_pages_need_no_sign_in_and_hide_private_company_data(client, make_user):
    hr, job = await live_job(client, make_user)
    stats = (await client.get(f"{API}/public/stats")).json()
    assert stats["jobs"] == 1 and stats["companies"] == 1 and stats["universities"] >= 25

    page = (await client.get(f"{API}/public/jobs", params={"q": "analitik"})).json()
    assert page["total"] == 1 and page["items"][0]["company_name"] == "Data Solutions MChJ"
    assert "review_note" not in page["items"][0] and "views" not in page["items"][0]
    assert (await client.get(f"{API}/public/jobs", params={"kind": "junior"})).json()["total"] == 0
    assert (await client.get(f"{API}/public/jobs", params={"industry": "it"})).json()["total"] == 1
    assert (await client.get(f"{API}/public/jobs/{job['id']}")).json()["title"] == JOB["title"]

    companies = (await client.get(f"{API}/public/companies")).json()
    assert companies["total"] == 1 and companies["items"][0]["open_jobs"] == 1
    profile = (await client.get(f"{API}/public/companies/{hr['company_id']}")).json()
    assert [j["id"] for j in profile["jobs"]] == [job["id"]]
    for private in ("stir", "email", "telegram", "address", "review_note", "status"):
        assert private not in profile

    # a closed job and an unapproved company disappear from the public site
    await client.post(f"{API}/employer/jobs/{job['id']}/close", headers=hr["headers"])
    assert (await client.get(f"{API}/public/jobs/{job['id']}")).status_code == 404
    assert (await client.get(f"{API}/public/companies/{hr['company_id']}")).json()["open_jobs"] == 0
    await client.post(f"{API}/admin/companies/{hr['company_id']}/review", json={"approve": False, "note": "STIR xato"},
                      headers=await owner(client))
    assert (await client.get(f"{API}/public/companies/{hr['company_id']}")).status_code == 404


async def test_students_save_jobs_and_see_their_dashboard(client, make_user):
    hr, job = await live_job(client, make_user)
    student = await applied_student(client, make_user, job)
    other = (await client.post(f"{API}/employer/jobs", json={**JOB, "title": "SQL stajyor"}, headers=hr["headers"])).json()
    await client.post(f"{API}/admin/jobs/{other['id']}/review", json={"approve": True}, headers=await owner(client))

    assert (await client.post(f"{API}/jobs/{other['id']}/save", headers=student["headers"])).status_code == 204
    assert (await client.post(f"{API}/jobs/{other['id']}/save", headers=student["headers"])).status_code == 204   # idempotent
    saved = (await client.get(f"{API}/me/saved-jobs", headers=student["headers"])).json()
    assert [j["id"] for j in saved] == [other["id"]] and saved[0]["saved"] is True
    listed = {j["id"]: j["saved"] for j in (await client.get(f"{API}/jobs", headers=student["headers"])).json()}
    assert listed == {job["id"]: False, other["id"]: True}
    # companies do not bookmark vacancies
    assert (await client.post(f"{API}/jobs/{other['id']}/save", headers=hr["headers"])).status_code == 403

    await move(client, hr, student["application_id"], status="interview", interview_at="2099-01-10T11:00:00",
               interview_place="Ofis")
    d = (await client.get(f"{API}/me/dashboard", headers=student["headers"])).json()
    assert d["applications"] == {"interview": 1} and d["active_applications"] == 1
    assert d["interviews"][0]["place"] == "Ofis" and d["recent"][0]["status"] == "interview"
    assert [j["id"] for j in d["recommended"]] == [other["id"]] and d["saved"] == 1

    assert (await client.delete(f"{API}/jobs/{other['id']}/save", headers=student["headers"])).status_code == 204
    assert (await client.get(f"{API}/me/saved-jobs", headers=student["headers"])).json() == []


async def test_company_dashboard_and_candidates_table(client, make_user):
    hr, job = await live_job(client, make_user)
    a = await applied_student(client, make_user, job, name="Aziza")
    b = await applied_student(client, make_user, job, name="Bekzod")
    await move(client, hr, a["application_id"], status="hired")
    await move(client, hr, b["application_id"], status="interview", interview_at="2099-03-01T09:00:00")

    d = (await client.get(f"{API}/employer/dashboard", headers=hr["headers"])).json()
    assert d["jobs"]["approved"] == 1 and d["applications_total"] == 2 and d["received"] == 2
    assert d["pipeline"]["hired"] == 1 and d["pipeline"]["interview"] == 1 and d["hired"] == 1
    assert [i["student"] for i in d["interviews"]] == ["Bekzod"]

    table = (await client.get(f"{API}/employer/applications", headers=hr["headers"])).json()
    assert table["total"] == 2 and {r["identity"]["full_name"] for r in table["items"]} == {"Aziza", "Bekzod"}
    assert table["items"][0]["job_title"] == JOB["title"] and 0 <= table["items"][0]["match"] <= 100
    assert table["jobs"] == [{"id": job["id"], "title": JOB["title"]}]
    only = (await client.get(f"{API}/employer/applications", params={"status": "hired"}, headers=hr["headers"])).json()
    assert [r["identity"]["full_name"] for r in only["items"]] == ["Aziza"]
    found = (await client.get(f"{API}/employer/applications", params={"q": "bek"}, headers=hr["headers"])).json()
    assert found["total"] == 1
    page = (await client.get(f"{API}/employer/applications", params={"limit": 1, "offset": 1}, headers=hr["headers"])).json()
    assert page["total"] == 2 and len(page["items"]) == 1

    # another company sees none of it
    other, _ = await live_job(client, make_user, stir="309876543", name="HR Boshqa")
    assert (await client.get(f"{API}/employer/applications", headers=other["headers"])).json()["total"] == 0
    assert (await client.get(f"{API}/employer/dashboard", headers=other["headers"])).json()["applications_total"] == 0
    # students cannot open company pages
    assert (await client.get(f"{API}/employer/dashboard", headers=a["headers"])).status_code == 403
