"""The in-app inbox (the bell in every panel). Telegram gets a copy when the person has it.

People who signed up on the website have no Telegram, so every notice that matters is stored here first.
`kind` + `params` let the app show the message in the reader's language; `text` is the Uzbek fallback.

`group` (a chat, a task's new entries) collapses a thread: while a person has not read its last notice, a new one
replaces it (newest first, `params.count` grows) instead of piling up, and Telegram is pinged at most once per
`quiet_minutes` for that thread.
"""
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Notification, User
from . import notify

CHUNK = 5000


async def push(session: AsyncSession, user_ids: Iterable[int | None], kind: str, text: str, link: str = "",
               params: dict | None = None, telegram: bool = True, group: str = "", quiet_minutes: int = 30,
               many: str = "") -> None:
    """Stores one notice per person and commits. Call it after the change it announces is committed.
    With `group`, `many` (e.g. " · {count} ta yangi xabar") is added to the text once a thread holds several."""
    ids = [i for i in dict.fromkeys(user_ids) if i]
    if not ids:
        return
    rows = []
    for start in range(0, len(ids), CHUNK):       # the database driver limits the size of one IN (...) list
        rows += (await session.execute(select(User.id, User.telegram_id).where(
            User.id.in_(ids[start:start + CHUNK]), User.is_blocked.is_(False)))).all()
    if not group:
        session.add_all(Notification(user_id=uid, kind=kind, text=text, link=link, params=params or {}) for uid, _ in rows)
        await session.commit()
        if telegram:
            notify.send([tg for _, tg in rows if tg], text, path=link)
        return

    now = datetime.now(UTC)
    earlier: dict[int, Notification] = {}
    user_ids_ = [uid for uid, _ in rows]
    for start in range(0, len(user_ids_), CHUNK):
        for n in (await session.execute(select(Notification).where(
                Notification.user_id.in_(user_ids_[start:start + CHUNK]), Notification.group_key == group,
                Notification.read_at.is_(None)))).scalars():
            earlier[n.user_id] = n
    ping = []
    for uid, tg in rows:
        old = earlier.get(uid)
        count = (old.params or {}).get("count", 1) + 1 if old else 1
        pinged = (old.params or {}).get("pinged_at") if old else None
        due = pinged is None or datetime.fromisoformat(pinged) < now - timedelta(minutes=quiet_minutes)
        if due and tg:
            ping.append(tg)
        session.add(Notification(user_id=uid, kind=kind, link=link, group_key=group,
                                 text=text + (many.format(count=count) if count > 1 and many else ""),
                                 params={**(params or {}), "count": count,
                                         "pinged_at": now.isoformat() if due else pinged}))
    if earlier:                                    # the newest notice takes the place of the unread one
        await session.execute(delete(Notification).where(Notification.id.in_([n.id for n in earlier.values()])))
    await session.commit()
    if telegram:
        notify.send(ping, text, path=link)
