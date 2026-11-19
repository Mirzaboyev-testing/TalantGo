"""Server-side commands for the person who runs the server.

    docker compose exec api python -m app.manage reset-admin-password owner@example.com

Prints a temporary password for an admin-site account (the owner's included, who has nobody to ask) and signs
that account's old sessions out. Change it at once in "Profilim".
"""
import asyncio
import secrets
import sys

from sqlalchemy import select

from .core.db import SessionLocal
from .models import AdminAccount, AuditLog
from .services.admin_accounts import hash_password


async def reset_admin_password(email: str) -> int:
    async with SessionLocal() as session:
        account = (await session.execute(select(AdminAccount).where(
            AdminAccount.email == email.strip().lower()))).scalar_one_or_none()
        if account is None:
            print(f"Bunday admin hisobi yo'q: {email}")
            return 1
        temporary = secrets.token_urlsafe(9)
        account.password_hash = hash_password(temporary)           # the token fingerprint changes: old sessions end
        account.must_change_password = True                        # replaced on the next sign-in
        session.add(AuditLog(actor="server", action="account.reset", target=account.email, details="manage.py"))
        await session.commit()
        print(f"{account.name} ({account.email}, {account.role}) uchun vaqtinchalik parol: {temporary}")
        return 0


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] == "reset-admin-password":
        return asyncio.run(reset_admin_password(argv[1]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
