"""What each admin-site account may do. The owner switches permissions on and off per account; until then an
account has its role's defaults. The owner can always do everything, and some things stay owner-only whatever
is switched on (admin accounts, the bot token, AI keys, rules, resetting user passwords, adjusting points).

Every change in the admin API (anything but GET) must match a rule below or it is refused for everyone but
the owner, so a new endpoint is closed until it is given a permission here. A GET is open to every active
account unless a rule names it (exports, AI conversations, broadcasts, the audit log, settings).
"""
from fastapi import HTTPException

# key → (group, label shown to the owner)
PERMISSIONS: dict[str, tuple[str, str]] = {
    "students": ("Tasdiqlash", "Talabalik tasdig'i"),
    "companies": ("Tasdiqlash", "Korxonalarni tasdiqlash"),
    "universities": ("Tasdiqlash", "Universitetlarni (xodimlarini) tasdiqlash"),
    "jobs": ("Tasdiqlash", "Vakansiyalarni tasdiqlash"),
    "tests": ("Tasdiqlash", "Testlar va chellenjlar"),
    "complaints": ("Moderatsiya", "Shikoyatlarni hal qilish"),
    "groups": ("Moderatsiya", "Guruhlar va xabarlar"),
    "users": ("Moderatsiya", "Talabalar va mentorlarni tahrirlash"),
    "content": ("Moderatsiya", "Yo'nalishlar, topshiriqlar va ishlar"),
    "catalog": ("Boshqaruv", "Universitetlar katalogi"),
    "site": ("Boshqaruv", "Sayt kontenti"),
    "announcements": ("Boshqaruv", "E'lonlar (bot orqali xabar)"),
    "ranking": ("Boshqaruv", "Reytingni sozlash va e'lon qilish"),
    "reports": ("Ma'lumotlar", "Hisobotlar va CSV yuklab olish"),
    "ai_chats": ("Ma'lumotlar", "AI yordamchi suhbatlarini ko'rish"),
    "audit": ("Ma'lumotlar", "Audit jurnali"),
    "settings": ("Ma'lumotlar", "Sozlamalarni ko'rish (bot, AI, qoidalar)"),
}

# an admin starts with everything; a moderator with the checks it always had (university staff stay off until the
# owner switches them on, since approved staff can verify students); an analyst only looks
ROLE_DEFAULTS: dict[str, frozenset[str]] = {
    "admin": frozenset(PERMISSIONS),
    "moderator": frozenset({"students", "companies", "jobs", "tests", "complaints", "groups"}),
    "analyst": frozenset(),
}

# (method, path prefix after /api/v1, permission). "W" means any change (POST, PUT, PATCH, DELETE), "*" any method.
RULES: tuple[tuple[str, str, str], ...] = (
    ("W", "/admin/verifications/", "students"),
    ("W", "/admin/companies/", "companies"),
    ("W", "/admin/staff/", "universities"),
    ("W", "/admin/jobs/", "jobs"),
    ("W", "/admin/tests/", "tests"),
    ("W", "/admin/challenges/", "tests"),
    ("W", "/admin/complaints/", "complaints"),
    ("W", "/admin/groups/", "groups"),
    ("W", "/admin/group-messages/", "groups"),
    ("W", "/admin/users/", "users"),
    ("W", "/admin/submissions/", "content"),
    ("W", "/admin/tracks", "content"),
    ("W", "/admin/tasks", "content"),
    ("W", "/admin/universities", "catalog"),
    ("W", "/admin/site", "site"),
    ("*", "/admin/announcements", "announcements"),
    ("W", "/admin/ranking", "ranking"),
    ("*", "/admin/export/", "reports"),
    ("*", "/admin/assistant/", "ai_chats"),
    ("*", "/admin/audit", "audit"),
    ("*", "/admin/bot", "settings"),
    ("*", "/admin/ai", "settings"),
    ("*", "/admin/rules", "settings"),
)


def effective(account) -> set[str]:
    """The permissions an account has now: everything for the owner, the owner's choice, or the role defaults."""
    if account.role == "owner":
        return set(PERMISSIONS)
    if account.permissions is not None:
        return {p for p in account.permissions if p in PERMISSIONS}
    return set(ROLE_DEFAULTS.get(account.role, frozenset()))


def required(method: str, path: str) -> str | None:
    for rule_method, prefix, permission in RULES:
        if path.startswith(prefix) and (rule_method == "*" or (rule_method == "W" and method != "GET") or rule_method == method):
            return permission
    return None


def check(account, method: str, path: str) -> None:
    """Raises 403 when the account may not make this call. `path` is the route template from /admin on."""
    if account.role == "owner" or path.startswith("/admin-auth/") or method in ("HEAD", "OPTIONS"):
        return
    permission = required(method, path)
    if permission is None:
        if method == "GET":
            return
        raise HTTPException(403, "Bu amalni faqat ilova egasi bajara oladi")
    if permission not in effective(account):
        raise HTTPException(403, f"Sizda bu ruxsat yo'q: «{PERMISSIONS[permission][1]}». Ilova egasidan so'rang.")


def catalog() -> dict:
    return {"permissions": [{"key": k, "group": g, "label": label} for k, (g, label) in PERMISSIONS.items()],
            "defaults": {role: sorted(perms) for role, perms in ROLE_DEFAULTS.items()}}
