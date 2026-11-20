"""What each admin-site account may do. The owner switches permissions on and off per account; until then an
account has its role's defaults. The owner can always do everything, and some things stay owner-only whatever
is switched on (admin accounts, the bot token, AI keys, rules, resetting user passwords, adjusting points).

Every admin API call must match a rule below or it is refused for everyone but the owner, so a new endpoint
is closed until it is given a permission here. Reading works the same way since 2026-11-20 (review of
e9ec19a): a list with personal data (contacts, documents, student numbers, messages, employment records)
needs the permission that acts on it, and only the reads in OPEN_READS (counts, catalogues, public data)
are open to every active account.
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
    "announcements": ("Boshqaruv", "E'lonlar (bildirishnoma va bot)"),
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
    ("W", "/admin/posts/", "complaints"),          # the feed's report queue: hide or restore posts and comments
    ("W", "/admin/comments/", "complaints"),
    # lists with personal data: the same permission as deciding on them (an analyst with nothing switched on
    # used to read every phone, document link and student number)
    ("GET", "/admin/verifications", "students"),   # student numbers
    ("GET", "/admin/companies", "companies"),      # documents and the HR person's contacts
    ("GET", "/admin/staff", "universities"),       # staff documents, phones and work e-mails
    ("GET", "/admin/users", "users"),              # e-mails, phones, Telegram
    ("GET", "/admin/submissions", "content"),      # students' work
    ("GET", "/admin/complaints", "complaints"),    # who reported whom and why
    ("GET", "/admin/groups", "groups"),            # group members and messages
    ("GET", "/admin/applications", "reports"),     # the same rows as export/applications.csv
    ("GET", "/admin/outcomes", "reports"),         # who works where
    ("W", "/admin/competitions", "tests"),         # competitions (docs/13-musobaqalar.md): hide, score, results
    ("GET", "/admin/competitions", "tests"),       # entries with students' work
)

# reads with no contacts or documents, open to every active account: counts and charts, the approval badges,
# the permission catalogue, things public on the site anyway (catalogues, the site's own content, posts: a
# limited role may look at the report queue but not decide)
OPEN_READS = ("/admin/stats", "/admin/dashboard", "/admin/inbox", "/admin/permissions", "/admin/tracks",
              "/admin/tasks", "/admin/jobs", "/admin/tests", "/admin/challenges", "/admin/universities",
              "/admin/partnerships", "/admin/ranking", "/admin/site", "/admin/posts")


# open to every active account: its own bell
SELF = "self"
OPEN_PREFIXES = ("/admin/notifications",)


def effective(account) -> set[str]:
    """The permissions an account has now: everything for the owner, the owner's choice, or the role defaults."""
    if account.role == "owner":
        return set(PERMISSIONS)
    if account.permissions is not None:
        return {p for p in account.permissions if p in PERMISSIONS}
    return set(ROLE_DEFAULTS.get(account.role, frozenset()))


def required(method: str, path: str) -> str | None:
    if path.startswith(OPEN_PREFIXES):
        return SELF
    for rule_method, prefix, permission in RULES:
        if path.startswith(prefix) and (rule_method == "*" or (rule_method == "W" and method != "GET") or rule_method == method):
            return permission
    return None


def check(account, method: str, path: str) -> None:
    """Raises 403 when the account may not make this call. `path` is the route template from /admin on."""
    if account.role == "owner" or path.startswith("/admin-auth/") or method in ("HEAD", "OPTIONS"):
        return
    permission = required(method, path)
    if permission == SELF:
        return
    if permission is None:
        if method == "GET" and path.startswith(OPEN_READS):
            return
        raise HTTPException(403, "Bu amalni faqat ilova egasi bajara oladi")
    if permission not in effective(account):
        raise HTTPException(403, f"Sizda bu ruxsat yo'q: «{PERMISSIONS[permission][1]}». Ilova egasidan so'rang.")


def catalog() -> dict:
    return {"permissions": [{"key": k, "group": g, "label": label} for k, (g, label) in PERMISSIONS.items()],
            "defaults": {role: sorted(perms) for role, perms in ROLE_DEFAULTS.items()}}
