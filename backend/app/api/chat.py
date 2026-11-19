"""Company ↔ student messages (student panel v2, phase 3; user decision 2026-11-17).

A thread opens only after the student applied to one of the company's jobs or accepted its contact request, so
companies cannot write to anyone they like. The student can close a thread: the company then cannot write until the
student reopens it. Every message notifies the other side (inbox + Telegram)."""
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..core import ratelimit
from ..models import Application, ChatMessage, Company, ContactRequest, Conversation, Job, User
from ..services import inbox
from ..services.applications import company_staff_ids
from ..services.files import logo_url
from .deps import CurrentUser, Session
from .employer import ApprovedEmployer

router = APIRouter(tags=["chat"])
PAGE = 200


async def may_talk(session, company_id: int, student_id: int) -> bool:
    applied = await session.scalar(select(func.count()).select_from(Application).join(Job).where(
        Application.user_id == student_id, Job.company_id == company_id, Application.status != "withdrawn"))
    if applied:
        return True
    return await session.scalar(select(ContactRequest.status).where(
        ContactRequest.company_id == company_id, ContactRequest.student_id == student_id)) == "accepted"


def _thread_out(c: Conversation, side: str, last: ChatMessage | None) -> dict:
    co = c.company
    return {"id": c.id, "company_id": c.company_id, "company": co.name if co else "",
            "company_logo": logo_url(co.id, co.logo_file_id, co.status) if co else None,
            "student_id": c.student_id, "student": c.student.full_name if c.student else "",
            "student_photo": c.student.photo_url if c.student else None,
            "student_study": " · ".join(x for x in [c.student.university_ref.short_name if c.student and c.student.university_ref else "",
                                                    c.student.faculty if c.student else ""] if x),
            "unread": c.student_unread if side == "student" else c.company_unread,
            "closed": c.closed_by_student, "last_message_at": c.last_message_at,
            "last": {"text": last.text[:140], "side": last.side, "at": last.created_at} if last else None}


def _msg_out(m: ChatMessage) -> dict:
    return {"id": m.id, "side": m.side, "text": m.text, "at": m.created_at,
            "sender": m.sender.full_name if m.sender else ""}


async def _threads(session, where, side: str) -> list[dict]:
    rows = (await session.execute(select(Conversation).where(where)
                                  .order_by(Conversation.last_message_at.desc().nulls_last(), Conversation.id.desc()))).scalars().all()
    if not rows:
        return []
    last_ids = select(func.max(ChatMessage.id)).where(ChatMessage.conversation_id.in_([c.id for c in rows])) \
        .group_by(ChatMessage.conversation_id)
    lasts = {m.conversation_id: m for m in (await session.execute(select(ChatMessage).where(ChatMessage.id.in_(last_ids)))).scalars()}
    return [_thread_out(c, side, lasts.get(c.id)) for c in rows]


async def _messages(session, c: Conversation, side: str) -> dict:
    msgs = (await session.execute(select(ChatMessage).where(ChatMessage.conversation_id == c.id)
                                  .order_by(ChatMessage.id.desc()).limit(PAGE))).scalars().all()
    if side == "student" and c.student_unread:
        c.student_unread = 0
        await session.commit()
    elif side == "company" and c.company_unread:
        c.company_unread = 0
        await session.commit()
    can_write = side == "student" or (not c.closed_by_student and await may_talk(session, c.company_id, c.student_id))
    return {"thread": _thread_out(c, side, msgs[0] if msgs else None), "messages": [_msg_out(m) for m in reversed(msgs)],
            "can_write": can_write}


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


async def _send(session, c: Conversation, user: User, side: str, text: str) -> dict:
    ratelimit.limit(f"chat:{user.id}", 30, 60, "Juda tez yozyapsiz: bir daqiqadan keyin davom eting")
    text = text.strip()
    if not text:
        raise HTTPException(422, "Xabar bo'sh")
    if side == "company" and c.closed_by_student:
        raise HTTPException(409, "Talaba bu suhbatni yopgan")
    if side == "company" and not await may_talk(session, c.company_id, c.student_id):
        raise HTTPException(403, "Talaba ariza bermagan yoki bog'lanishga rozilik bermagan")
    m = ChatMessage(conversation_id=c.id, sender_id=user.id, side=side, text=text)
    session.add(m)
    # counters in SQL: two people of one company writing at the same moment must both count
    values = {"last_message_at": datetime.now(UTC)}
    if side == "company":
        values["student_unread"] = Conversation.student_unread + 1
    else:
        values["company_unread"] = Conversation.company_unread + 1
        values["closed_by_student"] = False             # writing reopens a closed thread
    await session.execute(update(Conversation).where(Conversation.id == c.id).values(**values))
    await session.commit()
    await session.refresh(c)
    await session.refresh(m)
    short = text if len(text) <= 120 else text[:117] + "…"
    # one unread row per conversation (the chat has its own unread count); Telegram at most every 30 minutes
    if side == "company":
        await inbox.push(session, [c.student_id], "chat_message", f"{c.company.name}: {short}",
                         link=f"/talaba/xabarlar?c={c.id}", params={"company": c.company.name, "text": short},
                         group=f"chat:{c.id}", many=" · {count} ta yangi xabar")
    else:
        await inbox.push(session, await company_staff_ids(session, c.company_id), "chat_message",
                         f"{user.full_name}: {short}", link=f"/korxona/xabarlar?c={c.id}",
                         params={"student": user.full_name, "text": short},
                         group=f"chat:{c.id}", many=" · {count} ta yangi xabar")
    return _msg_out(m)


async def _get_or_open(session, company_id: int, student_id: int) -> Conversation:
    find = select(Conversation).where(Conversation.company_id == company_id, Conversation.student_id == student_id)
    c = (await session.execute(find)).scalar_one_or_none()
    if c is None:
        if not await may_talk(session, company_id, student_id):
            raise HTTPException(403, "Suhbat faqat talaba ariza bergan yoki bog'lanishga rozi bo'lgandan keyin ochiladi")
        # two clicks (or two tabs) at once must not fail on the unique pair: insert if missing, then read
        await session.execute(pg_insert(Conversation).values(company_id=company_id, student_id=student_id)
                              .on_conflict_do_nothing(index_elements=["company_id", "student_id"]))
        await session.commit()
        c = (await session.execute(find)).scalar_one()
    return c


# --------------------------------------------------------------------------- student side

@router.get("/me/chats")
async def my_chats(user: CurrentUser, session: Session) -> dict:
    """Threads, plus the companies the student may start one with (applied or accepted their request)."""
    threads = await _threads(session, Conversation.student_id == user.id, "student")
    have = {t["company_id"] for t in threads}
    applied = select(Job.company_id).join(Application, Application.job_id == Job.id).where(
        Application.user_id == user.id, Application.status != "withdrawn")
    accepted = select(ContactRequest.company_id).where(ContactRequest.student_id == user.id, ContactRequest.status == "accepted")
    companies = (await session.execute(select(Company).where(Company.id.in_(applied.union(accepted)),
                                                             Company.status == "approved"))).scalars().all()
    return {"threads": threads,
            "can_start": [{"id": c.id, "name": c.name, "logo": logo_url(c.id, c.logo_file_id, c.status)}
                          for c in companies if c.id not in have]}


@router.get("/me/chats/unread")
async def my_unread(user: CurrentUser, session: Session) -> dict:
    n = await session.scalar(select(func.coalesce(func.sum(Conversation.student_unread), 0)).where(Conversation.student_id == user.id))
    return {"unread": int(n or 0)}


class StartIn(BaseModel):
    company_id: int


@router.post("/me/chats", status_code=201)
async def start_chat(body: StartIn, user: CurrentUser, session: Session) -> dict:
    if user.account_type != "student":
        raise HTTPException(403, "Faqat talabalar uchun")
    c = await _get_or_open(session, body.company_id, user.id)
    return await _messages(session, c, "student")


async def _mine(session, user: User, thread_id: int) -> Conversation:
    c = await session.get(Conversation, thread_id)
    if c is None or c.student_id != user.id:
        raise HTTPException(404, "Suhbat topilmadi")
    return c


@router.get("/me/chats/{thread_id}")
async def my_thread(thread_id: int, user: CurrentUser, session: Session) -> dict:
    return await _messages(session, await _mine(session, user, thread_id), "student")


@router.post("/me/chats/{thread_id}/messages", status_code=201)
async def my_send(thread_id: int, body: MessageIn, user: CurrentUser, session: Session) -> dict:
    return await _send(session, await _mine(session, user, thread_id), user, "student", body.text)


class CloseIn(BaseModel):
    closed: bool


@router.post("/me/chats/{thread_id}/close")
async def my_close(thread_id: int, body: CloseIn, user: CurrentUser, session: Session) -> dict:
    c = await _mine(session, user, thread_id)
    c.closed_by_student = body.closed
    await session.commit()
    return {"closed": c.closed_by_student}


# --------------------------------------------------------------------------- company side

@router.get("/employer/chats")
async def company_chats(user: ApprovedEmployer, session: Session) -> list[dict]:
    return await _threads(session, Conversation.company_id == user.company_id, "company")


@router.get("/employer/chats/unread")
async def company_unread(user: ApprovedEmployer, session: Session) -> dict:
    n = await session.scalar(select(func.coalesce(func.sum(Conversation.company_unread), 0)).where(Conversation.company_id == user.company_id))
    return {"unread": int(n or 0)}


class CompanyStartIn(BaseModel):
    student_id: int


@router.post("/employer/chats", status_code=201)
async def company_start(body: CompanyStartIn, user: ApprovedEmployer, session: Session) -> dict:
    c = await _get_or_open(session, user.company_id, body.student_id)
    return await _messages(session, c, "company")


async def _ours(session, user: User, thread_id: int) -> Conversation:
    c = await session.get(Conversation, thread_id)
    if c is None or c.company_id != user.company_id:
        raise HTTPException(404, "Suhbat topilmadi")
    return c


@router.get("/employer/chats/{thread_id}")
async def company_thread(thread_id: int, user: ApprovedEmployer, session: Session) -> dict:
    return await _messages(session, await _ours(session, user, thread_id), "company")


@router.post("/employer/chats/{thread_id}/messages", status_code=201)
async def company_send(thread_id: int, body: MessageIn, user: ApprovedEmployer, session: Session) -> dict:
    return await _send(session, await _ours(session, user, thread_id), user, "company", body.text)
