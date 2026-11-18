"""Permissions the owner switches on and off per admin account (services/admin_access.py)."""
from fastapi.routing import APIRoute

from app.api import admin, company_tests, deps, site, trust
from app.api import assistant as assistant_api
from app.services import admin_access
from tests.conftest import owner_headers as owner
from tests.test_pipeline_and_inbox import API, live_job
from tests.test_ranking_and_admin import staff_account
from tests.test_university_panel2 import staff_form


async def account_id(client, email):
    admin_h = await owner(client)
    return next(a for a in (await client.get(f"{API}/admin/accounts", headers=admin_h)).json() if a["email"] == email)["id"]


async def test_admins_approve_universities_and_the_owner_can_switch_it_off(client, make_user):
    admin_h = await staff_account(client, "admin", "admin@careerup.test")
    me = (await client.get(f"{API}/admin-auth/me", headers=admin_h)).json()
    assert "universities" in me["permissions"] and "companies" in me["permissions"]

    request = await staff_form(client, make_user)
    r = await client.post(f"{API}/admin/staff/{request['id']}/review", json={"decision": "approve"}, headers=admin_h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"

    # the owner takes company approvals away from this admin: seeing stays, deciding does not
    owner_h = await owner(client)
    aid = await account_id(client, "admin@careerup.test")
    keep = sorted(set(admin_access.PERMISSIONS) - {"companies"})
    changed = (await client.patch(f"{API}/admin/accounts/{aid}", json={"permissions": keep}, headers=owner_h)).json()
    assert "companies" not in changed["permissions"] and changed["custom_permissions"] is True
    hr = (await live_job(client, make_user))[0]
    denied = await client.post(f"{API}/admin/companies/{hr['company_id']}/review", json={"approve": True}, headers=admin_h)
    assert denied.status_code == 403 and "Korxonalarni tasdiqlash" in denied.json()["detail"]
    assert (await client.get(f"{API}/admin/companies", headers=admin_h)).status_code == 200

    # back to the role's defaults
    reset = (await client.patch(f"{API}/admin/accounts/{aid}", json={"reset_permissions": True}, headers=owner_h)).json()
    assert reset["custom_permissions"] is False and "companies" in reset["permissions"]
    assert (await client.post(f"{API}/admin/companies/{hr['company_id']}/review", json={"approve": True},
                              headers=admin_h)).status_code == 200
    log = (await client.get(f"{API}/admin/audit", headers=owner_h)).json()
    assert any(e["action"] == "account.update" and "-companies" in e["details"] for e in log)


async def test_moderators_get_university_approvals_only_when_switched_on(client, make_user):
    mod_h = await staff_account(client, "moderator", "mod2@careerup.test")
    request = await staff_form(client, make_user)
    denied = await client.post(f"{API}/admin/staff/{request['id']}/review", json={"decision": "approve"}, headers=mod_h)
    assert denied.status_code == 403

    owner_h = await owner(client)
    aid = await account_id(client, "mod2@careerup.test")
    granted = sorted(admin_access.ROLE_DEFAULTS["moderator"] | {"universities"})
    await client.patch(f"{API}/admin/accounts/{aid}", json={"permissions": granted}, headers=owner_h)
    assert (await client.post(f"{API}/admin/staff/{request['id']}/review", json={"decision": "approve"},
                              headers=mod_h)).status_code == 200

    # a new role starts from that role's defaults; unknown permissions are refused
    back = (await client.patch(f"{API}/admin/accounts/{aid}", json={"role": "analyst"}, headers=owner_h)).json()
    assert back["permissions"] == [] and back["custom_permissions"] is False
    assert (await client.patch(f"{API}/admin/accounts/{aid}", json={"permissions": ["everything"]}, headers=owner_h)).status_code == 422
    # only the owner manages accounts, whatever is switched on
    assert (await client.patch(f"{API}/admin/accounts/{aid}", json={"permissions": []}, headers=mod_h)).status_code == 403


async def test_permission_catalogue_and_owner_only_actions(client):
    admin_h = await staff_account(client, "admin", "admin3@careerup.test")
    cat = (await client.get(f"{API}/admin/permissions", headers=admin_h)).json()
    assert {p["key"] for p in cat["permissions"]} == set(admin_access.PERMISSIONS)
    assert cat["defaults"]["analyst"] == []
    # even with every permission, these stay with the owner
    assert (await client.put(f"{API}/admin/rules", json={"peer_approvals_required": 1, "review_points": 1,
                                                        "mentor_bonus_percent": 0}, headers=admin_h)).status_code == 403
    assert (await client.get(f"{API}/admin/accounts", headers=admin_h)).status_code == 403


def _owner_only(route: APIRoute) -> bool:
    def walk(dep) -> bool:
        return dep.call is deps.owner_actor or any(walk(d) for d in dep.dependencies)
    return walk(route.dependant)


def test_every_admin_change_needs_a_permission_or_the_owner():
    """A new admin endpoint that changes something must get a rule in admin_access.RULES (or be owner-only)."""
    missing = []
    for router in (admin.router, trust.admin_router, company_tests.admin_router, site.admin_router, assistant_api.router):
        for route in router.routes:
            if not isinstance(route, APIRoute) or "/admin" not in route.path:
                continue
            path = route.path[route.path.index("/admin"):]
            for method in route.methods - {"GET", "HEAD"}:
                if admin_access.required(method, path) is None and not _owner_only(route):
                    missing.append(f"{method} {path}")
    assert missing == []
