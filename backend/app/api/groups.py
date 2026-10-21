"""In-app groups: the whole community, one per track, and private groups people create themselves.

Private groups are invisible to non-members and joined only through their invite code. Messages are
fetched by polling (`after` = last seen id), which is enough at pilot scale and works everywhere.
"""
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..seed import COMMUNITY_GROUP
from ..models import Group, GroupMember, GroupMessage, Role, User
from ..services import notify
from .deps import CurrentUser, Session

router = APIRouter(prefix="/groups", tags=["groups"])
MAX_OWN_GROUPS = 10
MAX_MEMBERS = 500
MESSAGES_PER_MINUTE = 20
NOTIFY_EVERY = timedelta(minutes=30)
READING_WINDOW = timedelta(minutes=2)


class GroupIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=300)


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=32)


def badge(u: User | None) -> str:
    """Shown next to a name in chats, so people know who is who."""
    if u is None:
        return ""
    if u.account_type == "employer":
        return f"HR · {u.company.name}" if u.company else "HR"
    if u.account_type == "university":
        return f"{u.staff_university.short_name} karyera markazi" if u.staff_university else "Universitet"
    if u.role in (Role.mentor, Role.admin):
        return "Mentor"
    return " · ".join(filter(None, [u.university_ref.short_name if u.university_ref else None,
                                    f"{u.course}-kurs" if u.course and u.course < 7 else None]))


async def ensure_official_memberships(session: Session, user: User) -> None:
    """Everyone is in the community group; students are in their track's group."""
    wanted = select(Group.id).where(Group.is_official, Group.is_archived.is_(False),
                                    Group.auto_join_all | ((Group.track_id == user.track_id) & (Group.track_id.isnot(None))))
    have = select(GroupMember.group_id).where(GroupMember.user_id == user.id)
    for gid in (await session.execute(wanted.where(Group.id.notin_(have)))).scalars():
        session.add(GroupMember(group_id=gid, user_id=user.id))
    await session.commit()


async def membership(session: Session, group_id: int, user: User) -> tuple[Group, GroupMember]:
    group = await session.get(Group, group_id)
    member = (await session.execute(select(GroupMember).where(
        GroupMember.group_id == group_id, GroupMember.user_id == user.id))).scalar_one_or_none()
    if group is None or group.is_archived or member is None:
        raise HTTPException(404, "Guruh topilmadi")      # private groups never reveal they exist
    return group, member


def message_out(m: GroupMessage, me: User) -> dict:
    return {"id": m.id, "text": None if m.deleted_at else m.text, "deleted": m.deleted_at is not None,
            "created_at": m.created_at, "mine": m.user_id == me.id, "user_id": m.user_id,
            "author": m.user.full_name if m.user else "O'chirilgan foydalanuvchi", "badge": badge(m.user)}


async def _group_card(session: Session, g: Group, member: GroupMember | None, me: User) -> dict:
    members = await session.scalar(select(func.count()).select_from(GroupMember).where(GroupMember.group_id == g.id))
    last = (await session.execute(select(GroupMessage).where(GroupMessage.group_id == g.id, GroupMessage.deleted_at.is_(None))
                                  .order_by(GroupMessage.id.desc()).limit(1))).scalar_one_or_none()
    unread = 0
    if member:
        unread = await session.scalar(select(func.count()).select_from(GroupMessage).where(
            GroupMessage.group_id == g.id, GroupMessage.id > member.last_read_id, GroupMessage.deleted_at.is_(None),
            GroupMessage.user_id != me.id))
    return {"id": g.id, "name": g.name, "description": g.description, "is_private": g.is_private,
            "is_official": g.is_official, "members": members, "unread": unread,
            "my_role": member.role if member else None,
            "last_message": {"author": last.user.full_name if last.user else "", "text": last.text[:120],
                             "created_at": last.created_at} if last else None}


@router.get("")
async def my_groups(user: CurrentUser, session: Session) -> dict:
    await ensure_official_memberships(session, user)
    mine = (await session.execute(select(Group, GroupMember).join(GroupMember, GroupMember.group_id == Group.id)
                                  .where(GroupMember.user_id == user.id, Group.is_archived.is_(False)))).all()
    joined = {g.id for g, _ in mine}
    open_groups = select(Group).where(Group.is_private.is_(False), Group.is_archived.is_(False))
    if joined:
        open_groups = open_groups.where(Group.id.notin_(joined))
    discover = (await session.execute(open_groups)).scalars().all()
    cards = [await _group_card(session, g, m, user) for g, m in mine]
    cards.sort(key=lambda c: (not c["is_official"] or c["name"] != COMMUNITY_GROUP,
                              -(c["last_message"]["created_at"].timestamp() if c["last_message"] else 0)))
    return {"mine": cards, "discover": [await _group_card(session, g, None, user) for g in discover]}


@router.get("/unread")
async def unread_total(user: CurrentUser, session: Session) -> dict:
    total = await session.scalar(
        select(func.count()).select_from(GroupMessage)
        .join(GroupMember, (GroupMember.group_id == GroupMessage.group_id) & (GroupMember.user_id == user.id))
        .join(Group, Group.id == GroupMessage.group_id)
        .where(GroupMessage.id > GroupMember.last_read_id, GroupMessage.deleted_at.is_(None),
               GroupMessage.user_id != user.id, Group.is_archived.is_(False)))
    return {"unread": total}


@router.post("", status_code=201)
async def create_group(body: GroupIn, user: CurrentUser, session: Session) -> dict:
    own = await session.scalar(select(func.count()).select_from(Group).where(
        Group.created_by_id == user.id, Group.is_archived.is_(False)))
    if own >= MAX_OWN_GROUPS:
        raise HTTPException(429, f"Bir kishi {MAX_OWN_GROUPS} tagacha guruh ocha oladi")
    group = Group(name=body.name.strip(), description=body.description.strip(), is_private=True, created_by_id=user.id)
    session.add(group)
    await session.flush()
    member = GroupMember(group_id=group.id, user_id=user.id, role="owner")
    session.add(member)
    await session.commit()
    return await _group_card(session, group, member, user)


async def _join(session: Session, group: Group, user: User) -> dict:
    existing = (await session.execute(select(GroupMember).where(
        GroupMember.group_id == group.id, GroupMember.user_id == user.id))).scalar_one_or_none()
    if existing is None:
        if await session.scalar(select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group.id)) >= MAX_MEMBERS:
            raise HTTPException(409, "Guruh to'lgan")
        existing = GroupMember(group_id=group.id, user_id=user.id)
        session.add(existing)
        await session.commit()
    return await _group_card(session, group, existing, user)


@router.post("/join")
async def join_by_code(body: JoinIn, user: CurrentUser, session: Session) -> dict:
    group = (await session.execute(select(Group).where(Group.invite_code == body.code.strip(),
                                                       Group.is_archived.is_(False)))).scalar_one_or_none()
    if group is None:
        raise HTTPException(404, "Taklif kodi noto'g'ri yoki guruh o'chirilgan")
    return await _join(session, group, user)


@router.post("/{group_id}/join")
async def join_public(group_id: int, user: CurrentUser, session: Session) -> dict:
    group = await session.get(Group, group_id)
    if group is None or group.is_archived or group.is_private:
        raise HTTPException(404, "Guruh topilmadi")
    return await _join(session, group, user)


@router.get("/{group_id}")
async def group_detail(group_id: int, user: CurrentUser, session: Session) -> dict:
    group, member = await membership(session, group_id, user)
    members = (await session.execute(select(GroupMember).where(GroupMember.group_id == group_id)
                                     .order_by(GroupMember.role.desc(), GroupMember.joined_at).limit(MAX_MEMBERS))).scalars()
    return {**await _group_card(session, group, member, user),
            "invite_code": group.invite_code if group.is_private else None,
            "member_list": [{"user_id": m.user_id, "name": m.user.full_name, "badge": badge(m.user), "role": m.role,
                             "username": None if group.is_official else m.user.username} for m in members]}


@router.patch("/{group_id}")
async def edit_group(group_id: int, body: GroupIn, user: CurrentUser, session: Session) -> dict:
    group, member = await membership(session, group_id, user)
    if member.role != "owner":
        raise HTTPException(403, "Faqat guruh egasi o'zgartira oladi")
    group.name, group.description = body.name.strip(), body.description.strip()
    await session.commit()
    return await _group_card(session, group, member, user)


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: int, user: CurrentUser, session: Session) -> None:
    group, member = await membership(session, group_id, user)
    if member.role != "owner" or group.is_official:
        raise HTTPException(403, "Faqat o'zingiz ochgan guruhni o'chira olasiz")
    group.is_archived = True
    await session.commit()


@router.post("/{group_id}/leave", status_code=204)
async def leave(group_id: int, user: CurrentUser, session: Session) -> None:
    group, member = await membership(session, group_id, user)
    if group.is_official:
        raise HTTPException(409, "Rasmiy guruhdan chiqib bo'lmaydi, lekin uni ochmasangiz bo'ladi")
    if member.role == "owner":
        raise HTTPException(409, "Guruh egasi chiqa olmaydi: guruhni o'chiring")
    await session.delete(member)
    await session.commit()


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(group_id: int, user_id: int, user: CurrentUser, session: Session) -> None:
    _, member = await membership(session, group_id, user)
    if member.role != "owner" or user_id == user.id:
        raise HTTPException(403, "Faqat guruh egasi boshqa a'zoni chiqara oladi")
    target = (await session.execute(select(GroupMember).where(GroupMember.group_id == group_id,
                                                              GroupMember.user_id == user_id))).scalar_one_or_none()
    if target:
        await session.delete(target)
        await session.commit()


@router.post("/{group_id}/invite/reset")
async def reset_invite(group_id: int, user: CurrentUser, session: Session) -> dict:
    group, member = await membership(session, group_id, user)
    if member.role != "owner" or not group.is_private:
        raise HTTPException(403, "Faqat shaxsiy guruh egasi")
    group.invite_code = secrets.token_urlsafe(9)
    await session.commit()
    return {"invite_code": group.invite_code}


@router.get("/{group_id}/messages")
async def messages(group_id: int, user: CurrentUser, session: Session,
                   after: int = Query(default=0, ge=0), before: int | None = Query(default=None, ge=1),
                   limit: int = Query(default=50, ge=1, le=100)) -> list[dict]:
    _, member = await membership(session, group_id, user)
    query = select(GroupMessage).where(GroupMessage.group_id == group_id)
    if before:
        query = query.where(GroupMessage.id < before).order_by(GroupMessage.id.desc()).limit(limit)
    elif after:
        query = query.where(GroupMessage.id > after).order_by(GroupMessage.id).limit(limit)
    else:
        query = query.order_by(GroupMessage.id.desc()).limit(limit)
    rows = sorted((await session.execute(query)).scalars().all(), key=lambda m: m.id)
    if rows and rows[-1].id > member.last_read_id and not before:
        member.last_read_id = rows[-1].id
    member.last_read_at = datetime.now(UTC)
    await session.commit()
    return [message_out(m, user) for m in rows]


@router.post("/{group_id}/messages", status_code=201)
async def send(group_id: int, body: MessageIn, user: CurrentUser, session: Session) -> dict:
    group, member = await membership(session, group_id, user)
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "Bo'sh xabar")
    recent = await session.scalar(select(func.count()).select_from(GroupMessage).where(
        GroupMessage.user_id == user.id, GroupMessage.created_at >= datetime.now(UTC) - timedelta(minutes=1)))
    if recent >= MESSAGES_PER_MINUTE:
        raise HTTPException(429, "Juda tez yozyapsiz, biroz kuting")
    msg = GroupMessage(group_id=group_id, user_id=user.id, text=text)
    session.add(msg)
    await session.flush()
    member.last_read_id, member.last_read_at = msg.id, datetime.now(UTC)
    await session.commit()
    if group.is_private:
        await _notify_members(session, group, user, text)
    return message_out(msg, user)


async def _notify_members(session: Session, group: Group, author: User, text: str) -> None:
    """Private groups only: a bot message to members who are not reading, at most once per half hour."""
    now = datetime.now(UTC)
    members = (await session.execute(select(GroupMember).where(
        GroupMember.group_id == group.id, GroupMember.user_id != author.id))).scalars().all()
    to_notify = [m for m in members
                 if (m.last_read_at is None or m.last_read_at < now - READING_WINDOW)
                 and (m.notified_at is None or m.notified_at < now - NOTIFY_EVERY)]
    for m in to_notify:
        m.notified_at = now
    await session.commit()
    notify.send([m.user.telegram_id for m in to_notify if m.user],
                f"💬 {group.name}\n{author.full_name}: {text[:200]}", button="Guruhni ochish")


@router.delete("/{group_id}/messages/{message_id}", status_code=204)
async def delete_message(group_id: int, message_id: int, user: CurrentUser, session: Session) -> None:
    _, member = await membership(session, group_id, user)
    msg = await session.get(GroupMessage, message_id)
    if msg is None or msg.group_id != group_id:
        raise HTTPException(404, "Xabar topilmadi")
    if msg.user_id != user.id and member.role != "owner":
        raise HTTPException(403, "Faqat o'z xabaringizni o'chira olasiz")
    msg.deleted_at = datetime.now(UTC)
    await session.commit()

