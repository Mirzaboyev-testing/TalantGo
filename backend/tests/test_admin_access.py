"""Permissions the owner switches on and off per admin account (services/admin_access.py)."""
import importlib
import pkgutil

from fastapi import APIRouter
from fastapi.routing import APIRoute

import app.api as api_pkg
from app.api import deps
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

    # the owner takes company approvals away from this admin: deciding goes, and so does the list with the
    # documents and the HR person's contacts (2026-11-20)
    owner_h = await owner(client)
    aid = await account_id(client, "admin@careerup.test")
    keep = sorted(set(admin_access.PERMISSIONS) - {"companies"})
    changed = (await client.patch(f"{API}/admin/accounts/{aid}", json={"permissions": keep}, headers=owner_h)).json()
    assert "companies" not in changed["permissions"] and changed["custom_permissions"] is True
    hr = (await live_job(client, make_user))[0]
    denied = await client.post(f"{API}/admin/companies/{hr['company_id']}/review", json={"approve": True}, headers=admin_h)
    assert denied.status_code == 403 and "Korxonalarni tasdiqlash" in denied.json()["detail"]
    assert (await client.get(f"{API}/admin/companies", headers=admin_h)).status_code == 403

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


PERSONAL_LISTS = {
    "/admin/verifications": "students", "/admin/companies": "companies", "/admin/staff": "universities",
    "/admin/users": "users", "/admin/submissions": "content", "/admin/complaints": "complaints",
    "/admin/groups": "groups", "/admin/applications": "reports", "/admin/outcomes": "reports",
}


async def test_lists_with_personal_data_need_their_permission(client, make_user):
    """2026-11-20 review: an analyst with nothing switched on could read phones, documents and student numbers."""
    analyst = await staff_account(client, "analyst", "analyst@careerup.test")
    owner_h = await owner(client)
    for path in PERSONAL_LISTS:
        r = await client.get(f"{API}{path}", headers=analyst)
        assert r.status_code == 403, (path, r.status_code)
        assert "Ilova egasidan so'rang" in r.json()["detail"]
        assert (await client.get(f"{API}{path}", headers=owner_h)).status_code == 200, path    # the owner sees all
    for path in ("/admin/stats", "/admin/dashboard", "/admin/inbox", "/admin/permissions", "/admin/jobs",
                 "/admin/universities", "/admin/notifications", "/admin/site", "/admin/posts"):
        assert (await client.get(f"{API}{path}", headers=analyst)).status_code == 200, path
    assert (await client.get(f"{API}/admin/accounts", headers=analyst)).status_code == 403

    # the owner switches reports on: the applications list and the CSV open together, nothing else does
    aid = await account_id(client, "analyst@careerup.test")
    await client.patch(f"{API}/admin/accounts/{aid}", json={"permissions": ["reports"]}, headers=owner_h)
    assert (await client.get(f"{API}/admin/applications", headers=analyst)).status_code == 200
    assert (await client.get(f"{API}/admin/export/applications.csv", headers=analyst)).status_code == 200
    assert (await client.get(f"{API}/admin/users", headers=analyst)).status_code == 403

    # a moderator keeps the lists of what it decides on
    mod = await staff_account(client, "moderator", "mod3@careerup.test")
    for path in ("/admin/verifications", "/admin/companies", "/admin/complaints", "/admin/groups"):
        assert (await client.get(f"{API}{path}", headers=mod)).status_code == 200, path
    assert (await client.get(f"{API}/admin/staff", headers=mod)).status_code == 403


def test_personal_lists_match_the_rules():
    for path, permission in PERSONAL_LISTS.items():
        assert admin_access.required("GET", path) == permission, path


def _owner_only(route: APIRoute) -> bool:
    def walk(dep) -> bool:
        return dep.call is deps.owner_actor or any(walk(d) for d in dep.dependencies)
    return walk(route.dependant)


def _admin_routes() -> list[APIRoute]:
    """Every route in app/api that signs in an admin-site account (AdminActor or OwnerActor)."""
    def uses_admin(dep) -> bool:
        return dep.call in (deps.admin_actor, deps.owner_actor) or any(uses_admin(d) for d in dep.dependencies)
    routes = []
    for module in pkgutil.iter_modules(api_pkg.__path__):
        for obj in vars(importlib.import_module(f"app.api.{module.name}")).values():
            if isinstance(obj, APIRouter):
                routes += [r for r in obj.routes if isinstance(r, APIRoute) and uses_admin(r.dependant)]
    return routes


def test_every_admin_endpoint_has_a_permission_an_open_read_or_the_owner():
    """A new admin endpoint must get a rule in admin_access.RULES, be a read in OPEN_READS, or be owner-only;
    otherwise only the owner can use it and a limited account gets 403."""
    routes = _admin_routes()
    assert len(routes) > 50                                      # the walk really found the admin API
    missing = []
    for route in routes:
        path = route.path[route.path.index("/admin"):] if "/admin" in route.path else route.path
        if path.startswith("/admin-auth/") or _owner_only(route):
            continue
        for method in route.methods - {"HEAD"}:
            if admin_access.required(method, path) is None and not (method == "GET" and path.startswith(admin_access.OPEN_READS)):
                missing.append(f"{method} {path}")
    assert missing == []
