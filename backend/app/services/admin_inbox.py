"""The admin website's bell: what waits for an admin decision reaches the accounts allowed to decide it.

`permission` is a key of admin_access.PERMISSIONS: every active account that has it gets the notice (the owner has
all of them). `permission=None` means the owner only (new admin accounts, password requests).

The bot copy goes to the allowed accounts that linked Telegram in "Profilim" (admin_accounts.telegram_id), and, as
before, to the Telegram users who still carry the old admin role or owner flag (owner-only notices: the old owner flag
alone). Its button opens the admin page on the website.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AdminAccount, AdminNotification, Role, User
from . import admin_access, notify


async def recipients(session: AsyncSession, permission: str | None) -> list[AdminAccount]:
    accounts = (await session.execute(select(AdminAccount).where(AdminAccount.status == "active"))).scalars().all()
    if permission is None:
        return [a for a in accounts if a.role == "owner"]
    return [a for a in accounts if permission in admin_access.effective(a)]


async def push(session: AsyncSession, permission: str | None, kind: str, text: str, link: str = "") -> None:
    """Stores one notice per allowed account and commits. Call it after the change it announces is committed."""
    accounts = await recipients(session, permission)
    session.add_all(AdminNotification(account_id=a.id, kind=kind, text=text, link=link) for a in accounts)
    await session.commit()
    legacy = User.is_owner if permission is None else (User.role == Role.admin) | User.is_owner
    telegram_ids = (await session.execute(select(User.telegram_id).where(legacy, User.is_blocked.is_(False)))).scalars().all()
    telegram_ids = [a.telegram_id for a in accounts if a.telegram_id] + list(telegram_ids)
    notify.send(telegram_ids, text, path=f"/admin#{link}" if link else "/admin", browser=True)
