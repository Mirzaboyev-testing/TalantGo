"""The in-app inbox (the bell in every panel). Telegram gets a copy when the person has it.

People who signed up on the website have no Telegram, so every notice that matters is stored here first.
`kind` + `params` let the app show the message in the reader's language; `text` is the Uzbek fallback.
"""
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Notification, User
from . import notify

CHUNK = 5000


async def push(session: AsyncSession, user_ids: Iterable[int | None], kind: str, text: str, link: str = "",
               params: dict | None = None, telegram: bool = True) -> None:
    """Stores one notice per person and commits. Call it after the change it announces is committed."""
    ids = [i for i in dict.fromkeys(user_ids) if i]
    if not ids:
        return
    rows = []
    for start in range(0, len(ids), CHUNK):       # the database driver limits the size of one IN (...) list
        rows += (await session.execute(select(User.id, User.telegram_id).where(
            User.id.in_(ids[start:start + CHUNK]), User.is_blocked.is_(False)))).all()
    session.add_all(Notification(user_id=uid, kind=kind, text=text, link=link, params=params or {}) for uid, _ in rows)
    await session.commit()
    if telegram:
        notify.send([tg for _, tg in rows if tg], text, path=link)
