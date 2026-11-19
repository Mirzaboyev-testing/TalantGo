"""A notice in the reader's language for the bot, with the same words as the bell (Notifications.tsx).

Uzbek is stored as written (`text`); ru/en come from assets/notif_templates.json, generated from the app's
locales by `npm run notif-templates` (frontend/scripts/notif-templates.mjs). Without a template the Uzbek text stays.
"""
import json
import re
from functools import cache
from pathlib import Path

LANGS = ("uz", "ru", "en")
_FIELD = re.compile(r"\{(\w+)\}")

# the bot's own words around a notice
BUTTON = {"uz": "Ilovani ochish", "ru": "Открыть приложение", "en": "Open the app"}
SITE = {"uz": "🌐 Saytda ochish", "ru": "🌐 Открыть сайт", "en": "🌐 Open the website"}
FOOTER = {"uz": "Barcha bildirishnomalar: /bildirishnomalar", "ru": "Все уведомления: /bildirishnomalar",
          "en": "All notifications: /bildirishnomalar"}


@cache
def templates() -> dict[str, dict[str, str]]:
    path = Path(__file__).resolve().parent.parent / "assets" / "notif_templates.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def render(kind: str, params: dict | None, lang: str | None, fallback: str) -> str:
    """The notice text for one reader. Variants follow the app: params.status, then approved/accepted (.ok/.no)."""
    if lang not in ("ru", "en") or not kind:
        return fallback
    table = templates().get(lang, {})
    p = params or {}
    variant = (f".{p['status']}" if isinstance(p.get("status"), str)
               else (".ok" if p["approved"] else ".no") if "approved" in p
               else (".ok" if p["accepted"] else ".no") if "accepted" in p else "")
    template = table.get(f"notif.{kind}{variant}") or table.get(f"notif.{kind}")
    if not template:
        return fallback
    values = {k: "" if v is None else str(v) for k, v in p.items()}
    return _FIELD.sub(lambda m: values.get(m.group(1), ""), template)


def lang_of(user) -> str:
    return user.language if user is not None and user.language in LANGS else "uz"
