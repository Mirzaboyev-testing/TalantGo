"""CareerFlow.ai chat for students and mentors (see services/assistant.py)."""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services import ai_review, assistant, settings_store
from .deps import CurrentUser, Session

router = APIRouter(tags=["assistant"])


class ChatMessage(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(min_length=1, max_length=2000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=16)


async def _key_if_available(session: Session) -> tuple[str, str] | None:
    config = await ai_review.get_config(session)
    key = await settings_store.get_value(session, settings_store.GEMINI_KEY)
    # the chat always uses the fast model: students wait for it, unlike the background review
    return (key, ai_review.FALLBACK_MODEL) if key and config.assistant else None


@router.get("/assistant/status")
async def status(_: CurrentUser, session: Session) -> dict:
    return {"available": await _key_if_available(session) is not None, "daily_limit": assistant.DAILY_LIMIT}


@router.post("/assistant/chat")
async def chat(body: ChatIn, user: CurrentUser, session: Session) -> dict:
    if body.messages[-1].role != "user":
        raise HTTPException(422, "Oxirgi xabar talabadan bo'lishi kerak")
    available = await _key_if_available(session)
    if available is None:
        raise HTTPException(503, "CareerFlow.ai hozir o'chirilgan")
    if not assistant.take_turn(user.id):
        raise HTTPException(429, f"Bugungi limit tugadi ({assistant.DAILY_LIMIT} ta savol). Ertaga yana yozing.")
    key, model = available
    system = await assistant.system_prompt(session, user, (await ai_review.get_config(session)).enabled)
    contents = [{"role": m.role, "parts": [{"text": m.text}]} for m in body.messages]
    try:
        reply = await ai_review.generate(key, model, [], contents=contents, system=system, json_mode=False,
                                         temperature=0.5, timeout=30)
    except ai_review.AiError as exc:
        raise HTTPException(502, f"CareerFlow.ai javob bera olmadi: {exc}") from exc
    return {"reply": reply.strip() or "Kechirasiz, javob tayyorlay olmadim. Savolni boshqacharoq yozib ko'ring."}
