"""Sign-up and sign-in for the admin website (email + password). Nothing here involves Telegram."""
import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..models import AdminAccount
from ..services import admin_password
from ..services.admin_accounts import (check_password, hash_password, issue_token, normalize_email, owners_count,
                                       touch_login)
from .deps import AdminActor, Session, audit

router = APIRouter(prefix="/admin-auth", tags=["admin-auth"])
MAX_PENDING = 20


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=254)
    password: str = Field(min_length=10, max_length=128)
    setup_code: str | None = Field(default=None, max_length=128)


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)


@router.get("/status")
async def status(session: Session) -> dict:
    """Tells the sign-up form whether the first (owner) account still has to be created."""
    return {"needs_owner": await owners_count(session) == 0}


@router.post("/register")
async def register(body: RegisterIn, session: Session) -> dict:
    email = normalize_email(body.email)
    if await session.scalar(select(AdminAccount.id).where(AdminAccount.email == email)):
        raise HTTPException(409, "Bu email bilan hisob bor")
    if await owners_count(session) == 0:
        # the first account is the owner: only someone holding the server's setup code can create it
        if not body.setup_code or not await admin_password.verify(session, body.setup_code):
            await asyncio.sleep(1)
            raise HTTPException(403, "Sozlash kodi noto'g'ri")
        account = AdminAccount(email=email, name=body.name.strip(), password_hash=hash_password(body.password),
                               role="owner", status="active")
        session.add(account)
        await session.commit()
        await touch_login(session, account)
        return {"status": "active", "token": issue_token(account)}
    pending = await session.scalar(select(func.count()).select_from(AdminAccount).where(AdminAccount.status == "pending"))
    if pending >= MAX_PENDING:
        raise HTTPException(429, "Kutilayotgan so'rovlar juda ko'p. Keyinroq urinib ko'ring.")
    session.add(AdminAccount(email=email, name=body.name.strip(), password_hash=hash_password(body.password),
                             role="admin", status="pending"))
    await session.commit()
    return {"status": "pending"}


@router.post("/login")
async def login(body: LoginIn, session: Session) -> dict:
    account = (await session.execute(select(AdminAccount).where(
        AdminAccount.email == body.email.strip().lower()))).scalar_one_or_none()
    if account is None or not check_password(body.password, account.password_hash):
        await asyncio.sleep(1)                       # slows down password guessing
        raise HTTPException(401, "Email yoki parol noto'g'ri")
    if account.status == "pending":
        raise HTTPException(403, "Hisobingiz hali tasdiqlanmagan. Ilova egasi tasdiqlagach kira olasiz.")
    if account.status != "active":
        raise HTTPException(403, "Hisobingiz o'chirilgan")
    await touch_login(session, account)
    return {"token": issue_token(account)}


@router.get("/me")
async def me(actor: AdminActor) -> dict:
    a = actor.account
    return {"id": a.id, "name": a.name, "email": a.email, "role": a.role, "is_owner": actor.is_owner}


@router.put("/password")
async def change_password(body: PasswordIn, actor: AdminActor, session: Session) -> dict:
    account = actor.account
    if not check_password(body.current_password, account.password_hash):
        raise HTTPException(400, "Joriy parol noto'g'ri")
    account.password_hash = hash_password(body.new_password)
    audit(session, actor, "account.password", account.email)
    await session.commit()
    return {"token": issue_token(account)}           # this session continues; all others end
