from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
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


# what moderators may change, and what neither moderators nor analysts may open (paths after /api/v1)
MODERATION_WRITES = ("/admin/verifications/", "/admin/companies/", "/admin/jobs/", "/admin/tests/", "/admin/group-messages/",
                     "/admin/groups/", "/admin/challenges/", "/admin/complaints/")
PRIVATE_AREAS = ("/admin/export/", "/admin/assistant/", "/admin/bot", "/admin/ai", "/admin/accounts", "/admin/audit",
                 "/admin/rules", "/admin/announcements", "/admin/ranking/")


def check_role(account: AdminAccount, method: str, path: str) -> None:
    """Least privilege for the two limited roles; owner and admin keep their current rights."""
    if account.role not in ("moderator", "analyst") or path.startswith("/admin-auth/"):
        return
    if path.startswith(PRIVATE_AREAS) or (path.startswith("/admin/ranking") and method != "GET"):
        raise HTTPException(403, "Bu bo'lim sizning rolingiz uchun yopiq")
    if method != "GET" and (account.role == "analyst" or not path.startswith(MODERATION_WRITES)):
        raise HTTPException(403, "Rolingiz faqat ko'rishga ruxsat beradi" if account.role == "analyst"
                            else "Moderator faqat tekshiruv va moderatsiya qiladi")


async def admin_actor(request: Request, session: Session, authorization: Annotated[str | None, Header()] = None) -> Actor:
    sub = read_token(_bearer(authorization), "admin") or ""
    parts = sub.split(":")
    if len(parts) != 3 or parts[0] != "acct" or not parts[1].isdigit():
        raise HTTPException(401, "Admin sifatida kiring")
    account = await session.get(AdminAccount, int(parts[1]))
    if account is None or account.status != "active" or parts[2] != fingerprint(account):
        raise HTTPException(401, "Sessiya tugagan. Qayta kiring.")
    check_role(account, request.method, request.url.path.removeprefix("/api/v1"))
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
