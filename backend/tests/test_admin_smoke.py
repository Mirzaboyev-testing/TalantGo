"""Every admin page the website opens answers without a server error, with data in place."""
from tests.conftest import owner_headers

PAGES = ["/admin/stats", "/admin/dashboard", "/admin/inbox", "/admin/users", "/admin/users?role=mentor",
         "/admin/submissions", "/admin/tracks", "/admin/tasks", "/admin/companies?status=pending",
         "/admin/companies", "/admin/jobs", "/admin/jobs?status=approved", "/admin/applications",
         "/admin/applications?status=new&q=a", "/admin/verifications", "/admin/staff", "/admin/universities",
         "/admin/announcements", "/admin/rules", "/admin/bot", "/admin/audit", "/admin/accounts", "/admin/groups", "/admin/challenges",
         "/admin/export/users.csv", "/admin/export/applications.csv", "/admin-auth/me"]


async def test_every_admin_page_loads(client, make_user):
    owner = await owner_headers(client)
    u = await make_user("Aziza")
    await client.get("/api/v1/me", headers=u["headers"])
    failures = []
    for path in PAGES:
        r = await client.get(f"/api/v1{path}", headers=owner)
        if r.status_code != 200:
            failures.append((path, r.status_code, r.text[:120]))
    assert failures == []
