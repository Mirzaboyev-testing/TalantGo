"""Review rules the owner can tune in the admin page. Defaults come from the environment."""
import time

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..models import AppConfig

KEY = "review_rules"
_TTL = 30.0
_cache: tuple[float, "Rules"] | None = None


class Rules(BaseModel):
    peer_approvals_required: int = Field(default=settings.peer_approvals_required, ge=1, le=5)
    review_points: int = Field(default=settings.review_points, ge=0, le=20)
    mentor_bonus_percent: int = Field(default=50, ge=0, le=200)


async def get_rules(session: AsyncSession) -> Rules:
    global _cache
    if _cache and _cache[0] > time.monotonic():
        return _cache[1]
    row = await session.get(AppConfig, KEY)
    rules = Rules.model_validate(row.value) if row else Rules()
    _cache = (time.monotonic() + _TTL, rules)
    return rules


async def save_rules(session: AsyncSession, rules: Rules) -> Rules:
    global _cache
    row = await session.get(AppConfig, KEY)
    if row:
        row.value = rules.model_dump()
    else:
        session.add(AppConfig(key=KEY, value=rules.model_dump()))
    await session.commit()
    _cache = None
    return rules
