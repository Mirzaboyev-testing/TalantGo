"""TalantGo AI chat (see services/assistant.py).

Each person has one conversation, stored on the server: only they and the platform admins can read it.
Peers and mentors never see another person's conversation.
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..models import AssistantMessage, User
from ..services import ai_review, assistant, settings_store
from ..services.progress import TASHKENT, today
from .deps import AdminActor, CurrentUser, Session, audit

router = APIRouter(tags=["assistant"])
CONTEXT_MESSAGES = 12            # earlier turns the model sees with each question


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


def message_out(m: AssistantMessage) -> dict:
    return {"id": m.id, "role": m.role, "text": m.text, "created_at": m.created_at}


async def _key_if_available(session: Session) -> tuple[str, str] | None:
    config = await ai_review.get_config(session)
    key = await settings_store.get_value(session, settings_store.GEMINI_KEY)
    # the chat always uses the fast model: students wait for it, unlike the background review
    return (key, ai_review.FALLBACK_MODEL) if key and config.assistant else None


@router.get("/assistant/status")
async def status(user: CurrentUser, session: Session) -> dict:
    return {"available": await _key_if_available(session) is not None, "daily_limit": assistant.DAILY_LIMIT,
            "audience": assistant.audience(user)}


@router.get("/assistant/messages")
async def my_messages(user: CurrentUser, session: Session) -> list[dict]:
    rows = (await session.execute(select(AssistantMessage).where(AssistantMessage.user_id == user.id)
                                  .order_by(AssistantMessage.id.desc()).limit(100))).scalars().all()
    return [message_out(m) for m in reversed(rows)]


@router.post("/assistant/chat")
async def chat(body: ChatIn, user: CurrentUser, session: Session) -> dict:
    available = await _key_if_available(session)
    if available is None:
        raise HTTPException(503, "TalantGo AI hozir o'chirilgan")
    day_start = datetime.combine(today(), datetime.min.time(), TASHKENT)
    asked_today = await session.scalar(select(func.count()).select_from(AssistantMessage).where(
        AssistantMessage.user_id == user.id, AssistantMessage.role == "user", AssistantMessage.created_at >= day_start))
    if asked_today >= assistant.DAILY_LIMIT:
        raise HTTPException(429, f"Bugungi limit tugadi ({assistant.DAILY_LIMIT} ta savol). Ertaga yana yozing.")

    earlier = (await session.execute(select(AssistantMessage).where(AssistantMessage.user_id == user.id)
                                     .order_by(AssistantMessage.id.desc()).limit(CONTEXT_MESSAGES))).scalars().all()
    contents = [{"role": m.role, "parts": [{"text": m.text}]} for m in reversed(earlier)]
    contents.append({"role": "user", "parts": [{"text": body.text.strip()}]})
    key, model = available
    system = await assistant.system_prompt(session, user, (await ai_review.get_config(session)).enabled)
    try:
        reply = await ai_review.generate(key, model, [], contents=contents, system=system, json_mode=False,
                                         temperature=0.5, timeout=30)
    except ai_review.AiError as exc:
        raise HTTPException(502, f"TalantGo AI javob bera olmadi: {exc}") from exc
    reply = reply.strip() or "Kechirasiz, javob tayyorlay olmadim. Savolni boshqacharoq yozib ko'ring."

    question = AssistantMessage(user_id=user.id, role="user", text=body.text.strip())
    answer = AssistantMessage(user_id=user.id, role="model", text=reply[:8000])
    session.add(question)
    await session.flush()                 # the question gets the lower id, so history keeps its order
    session.add(answer)
    await session.commit()
    return {"question": message_out(question), "answer": message_out(answer)}


# --------------------------------------------------------------------------- admin: read conversations

@router.get("/admin/assistant/users")
async def admin_conversations(_: AdminActor, session: Session) -> list[dict]:
    rows = (await session.execute(
        select(User, func.count(AssistantMessage.id), func.max(AssistantMessage.created_at))
        .join(AssistantMessage, AssistantMessage.user_id == User.id)
        .where(AssistantMessage.role == "user")
        .group_by(User.id).order_by(func.max(AssistantMessage.created_at).desc()).limit(200))).all()
    return [{"user_id": u.id, "full_name": u.full_name, "username": u.username, "role": u.role.value,
             "account_type": u.account_type, "company": u.company.name if u.company else None,
             "track": u.track.title if u.track else None, "questions": n, "last_at": last} for u, n, last in rows]


@router.get("/admin/assistant/users/{user_id}/messages")
async def admin_conversation(user_id: int, actor: AdminActor, session: Session) -> list[dict]:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Foydalanuvchi topilmadi")
    rows = (await session.execute(select(AssistantMessage).where(AssistantMessage.user_id == user_id)
                                  .order_by(AssistantMessage.id.desc()).limit(300))).scalars().all()
    audit(session, actor, "assistant.view", f"{user.full_name} (#{user.id})")   # reading a chat is logged
    await session.commit()
    return [message_out(m) for m in reversed(rows)]
