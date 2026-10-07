from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.db import get_session
from ..core.security import read_token
from ..models import AdminAccount, AuditLog, User
from ..services.admin_accounts import fingerprint

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
    """Who is using the admin website: an approved email account."""
    account: AdminAccount

    @property
    def name(self) -> str:
        return f"{self.account.name} <{self.account.email}>"

    @property
    def is_owner(self) -> bool:
        return self.account.role == "owner"


async def admin_actor(session: Session, authorization: Annotated[str | None, Header()] = None) -> Actor:
    sub = read_token(_bearer(authorization), "admin") or ""
    parts = sub.split(":")
    if len(parts) != 3 or parts[0] != "acct" or not parts[1].isdigit():
        raise HTTPException(401, "Admin sifatida kiring")
    account = await session.get(AdminAccount, int(parts[1]))
    if account is None or account.status != "active" or parts[2] != fingerprint(account):
        raise HTTPException(401, "Sessiya tugagan. Qayta kiring.")
    return Actor(account=account)


async def owner_actor(actor: Annotated[Actor, Depends(admin_actor)]) -> Actor:
    if not actor.is_owner:
        raise HTTPException(403, "Buni faqat ilova egasi qila oladi")
    return actor


def audit(session: AsyncSession, actor: Actor, action: str, target: str = "", details: str = "") -> None:
    session.add(AuditLog(actor=actor.name[:160], action=action, target=target[:200], details=details[:2000]))


CurrentUser = Annotated[User, Depends(current_user)]
AdminActor = Annotated[Actor, Depends(admin_actor)]
OwnerActor = Annotated[Actor, Depends(owner_actor)]
