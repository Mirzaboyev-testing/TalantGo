from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.db import get_session
from ..core.security import read_token
from ..models import User

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
    return user


async def require_admin(authorization: Annotated[str | None, Header()] = None) -> None:
    if read_token(_bearer(authorization), "admin") is None:
        raise HTTPException(401, "Admin sifatida kiring")


CurrentUser = Annotated[User, Depends(current_user)]
