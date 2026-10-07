from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select

from ..core.config import settings
from ..models import Status, Submission, Task, Track, User
from ..schemas import AdminUserOut, BotStatusOut, BotTokenIn, RoleIn, TaskIn, TaskOut, TaskPatch
from ..services import settings_store, telegram_bot
from .deps import Session, require_admin

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


async def _bot_token(session: Session) -> str:
    token = await settings_store.get_value(session, settings_store.BOT_TOKEN)
    if not token:
        raise HTTPException(400, "Avval bot tokenini saqlang")
    return token


@router.get("/bot", response_model=BotStatusOut)
async def bot_status(session: Session) -> BotStatusOut:
    hint = await settings_store.get_hint(session, settings_store.BOT_TOKEN)
    return BotStatusOut(configured=hint is not None, hint=hint, public_url=settings.public_url)


@router.put("/bot", response_model=BotStatusOut)
async def save_bot_token(body: BotTokenIn, session: Session) -> BotStatusOut:
    try:
        await telegram_bot.call(body.token, "getMe")
    except telegram_bot.BotError as exc:
        raise HTTPException(400, f"Token ishlamadi: {exc}") from exc
    hint = await settings_store.set_value(session, settings_store.BOT_TOKEN, body.token)
    return BotStatusOut(configured=True, hint=hint, public_url=settings.public_url)


@router.post("/bot/test")
async def test_bot(session: Session) -> dict:
    try:
        me = await telegram_bot.call(await _bot_token(session), "getMe")
    except telegram_bot.BotError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "username": me.get("username"), "name": me.get("first_name")}


@router.post("/bot/connect")
async def connect_bot(session: Session) -> dict:
    """Points the bot's menu button and webhook at this server. Needs a public https address."""
    if not settings.public_url.startswith("https://"):
        raise HTTPException(400, "Telegram faqat https manzil bilan ishlaydi: PUBLIC_URL serverdagi domen bo'lishi kerak")
    try:
        me = await telegram_bot.connect(await _bot_token(session), settings.public_url)
    except telegram_bot.BotError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "username": me.get("username")}


@router.get("/stats")
async def stats(session: Session) -> dict:
    by_status = dict((await session.execute(
        select(Submission.status, func.count()).group_by(Submission.status))).all())
    return {
        "users": await session.scalar(select(func.count()).select_from(User)),
        "with_track": await session.scalar(select(func.count()).select_from(User).where(User.track_id.isnot(None))),
        "submissions": {s.value: by_status.get(s, 0) for s in Status},
    }


@router.get("/users", response_model=list[AdminUserOut])
async def users(session: Session) -> list[User]:
    return list((await session.execute(select(User).order_by(User.created_at.desc()).limit(500))).scalars())


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def set_role(user_id: int, body: RoleIn, session: Session) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Foydalanuvchi topilmadi")
    user.role = body.role
    await session.commit()
    return user


@router.get("/tasks", response_model=list[TaskOut])
async def all_tasks(session: Session) -> list[Task]:
    return list((await session.execute(
        select(Task).join(Track).order_by(Track.sort_order, Task.sort_order))).scalars())


@router.post("/tasks", response_model=TaskOut, status_code=201)
async def create_task(body: TaskIn, session: Session) -> Task:
    if not await session.get(Track, body.track_id):
        raise HTTPException(404, "Yo'l topilmadi")
    last = await session.scalar(select(func.max(Task.sort_order)).where(Task.track_id == body.track_id))
    task = Task(**body.model_dump(), sort_order=(last or 0) + 1)
    session.add(task)
    await session.commit()
    return task


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(task_id: int, body: TaskPatch, session: Session) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "Topshiriq topilmadi")
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(task, field, value)
    await session.commit()
    return task
