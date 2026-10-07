from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.db import get_session
from ..core.security import read_token
from ..models import Role, User
from ..services import admin_password

Session = Annotated[AsyncSession, Depends(get_session)]


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Kirish talab qilinadi")
    return authorization.removeprefix("Bearer ")


async def current_user(session: Session, authorization: Annotated[str | None, Header()] = None) -> User:
    user_id = read_token(_bearer(authorization), "user")
    user = await session.get(User, int(user_id)) if user_id else None
    if user is None:
        raise HTTPException(401, "Sessiya tugagan, ilovani qayta oching")
    if user.is_blocked:
        raise HTTPException(403, "Hisobingiz bloklangan. Savollar bo'lsa, adminga yozing.")
    return user


@dataclass
class Actor:
    """Who is using the admin panel: the owner's password, or an admin's own Telegram account."""
    name: str
    is_owner: bool
    user: User | None


async def admin_actor(session: Session, authorization: Annotated[str | None, Header()] = None) -> Actor:
    token = _bearer(authorization)
    admin_sub = read_token(token, "admin")
    if admin_sub is not None:
        if admin_sub != f"admin:{await admin_password.fingerprint(session)}":
            raise HTTPException(401, "Parol o'zgargan. Yangi parol bilan qayta kiring.")
        return Actor(name="Ega (parol orqali)", is_owner=True, user=None)
    user_id = read_token(token, "user")
    user = await session.get(User, int(user_id)) if user_id else None
    if user is None or user.is_blocked:
        raise HTTPException(401, "Admin sifatida kiring")
    if not (user.is_owner or user.role is Role.admin):
        raise HTTPException(403, "Bu bo'lim faqat adminlar uchun")
    return Actor(name=user.full_name, is_owner=user.is_owner, user=user)


async def owner_actor(actor: Annotated[Actor, Depends(admin_actor)]) -> Actor:
    if not actor.is_owner:
        raise HTTPException(403, "Buni faqat ilova egasi qila oladi")
    return actor


CurrentUser = Annotated[User, Depends(current_user)]
AdminActor = Annotated[Actor, Depends(admin_actor)]
OwnerActor = Annotated[Actor, Depends(owner_actor)]
