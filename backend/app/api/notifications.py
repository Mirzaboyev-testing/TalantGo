"""The bell: a person's own in-app notifications, newest first."""
from datetime import UTC, datetime

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update

from ..models import Notification
from .deps import CurrentUser, Session

router = APIRouter(prefix="/me/notifications", tags=["notifications"])


class ReadIn(BaseModel):
    ids: list[int] | None = Field(default=None, max_length=200)     # None: mark everything as read


def _out(n: Notification) -> dict:
    return {"id": n.id, "kind": n.kind, "text": n.text, "link": n.link, "params": n.params,
            "created_at": n.created_at, "read": n.read_at is not None}


async def _unread(session: Session, user_id: int) -> int:
    return await session.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id, Notification.read_at.is_(None)))


@router.get("")
async def list_notifications(user: CurrentUser, session: Session, before_id: int | None = None,
                             limit: int = Query(default=30, ge=1, le=100)) -> dict:
    query = select(Notification).where(Notification.user_id == user.id)
    if before_id:
        query = query.where(Notification.id < before_id)
    rows = (await session.execute(query.order_by(Notification.id.desc()).limit(limit))).scalars().all()
    return {"items": [_out(n) for n in rows], "unread": await _unread(session, user.id),
            "more": len(rows) == limit}


@router.get("/unread")
async def unread_count(user: CurrentUser, session: Session) -> dict:
    return {"unread": await _unread(session, user.id)}


@router.post("/read")
async def mark_read(body: ReadIn, user: CurrentUser, session: Session) -> dict:
    query = update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    if body.ids is not None:
        query = query.where(Notification.id.in_(body.ids))
    await session.execute(query.values(read_at=datetime.now(UTC)))
    await session.commit()
    return {"unread": await _unread(session, user.id)}
