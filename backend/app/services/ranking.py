"""The university ranking. User rule (2026-10-26): for now it measures only placement, the share of
verified students with a confirmed job or internship, never quality measures.

score = 100 * (employed + internship_weight * interned) / verified students
A university with fewer than `min_sample` verified students gets no score ("not enough data") instead of
a low one, so a small or new university is never ranked below a big one for lack of data.
"""
import time
from datetime import UTC, datetime

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AppConfig, RankingSnapshot, University, User
from .outcomes import university_stats

KEY = "ranking"
_TTL = 30.0
_cache: tuple[float, "RankingConfig"] | None = None


class RankingConfig(BaseModel):
    internship_weight: float = Field(default=1.0, ge=0, le=1)     # 1: an internship counts like a job
    min_sample: int = Field(default=10, ge=5, le=200)


async def get_config(session: AsyncSession) -> RankingConfig:
    global _cache
    if _cache and _cache[0] > time.monotonic():
        return _cache[1]
    row = await session.get(AppConfig, KEY)
    config = RankingConfig.model_validate(row.value) if row else RankingConfig()
    _cache = (time.monotonic() + _TTL, config)
    return config


async def save_config(session: AsyncSession, config: RankingConfig) -> RankingConfig:
    global _cache
    row = await session.get(AppConfig, KEY)
    if row:
        row.value = config.model_dump()
    else:
        session.add(AppConfig(key=KEY, value=config.model_dump()))
    await session.commit()
    _cache = None
    return config


async def compute(session: AsyncSession, config: RankingConfig | None = None) -> list[dict]:
    """Every active university that has verified students, best score first; no score last."""
    config = config or await get_config(session)
    with_students = (await session.execute(
        select(University).join(User, User.university_id == University.id)
        .where(University.is_active.is_(True), User.account_type == "student", User.verification == "verified",
               User.is_blocked.is_(False)).group_by(University.id).having(func.count(User.id) > 0))).scalars().all()
    rows = []
    for uni in with_students:
        s = await university_stats(session, uni.id)
        enough = s["students"] >= config.min_sample
        score = round(100 * (s["employed"] + config.internship_weight * s["interned"]) / s["students"], 1) if enough else None
        rows.append({"university_id": uni.id, "name": uni.name, "short_name": uni.short_name, "city": uni.city,
                     "students": s["students"], "employed": s["employed"], "interned": s["interned"], "score": score})
    rows.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0), -r["students"], r["name"]))
    rank, previous = 0, None
    for position, r in enumerate(rows, start=1):
        if r["score"] is None:
            r["rank"] = None
            continue
        if r["score"] != previous:            # equal scores share a place
            rank, previous = position, r["score"]
        r["rank"] = rank
    return rows


async def publish(session: AsyncSession, period: str, published_by: str) -> RankingSnapshot:
    config = await get_config(session)
    snap = RankingSnapshot(period=period.strip(), config=config.model_dump(), rows=await compute(session, config),
                           published_by=published_by[:160], published_at=datetime.now(UTC))
    session.add(snap)
    await session.commit()
    await session.refresh(snap)
    return snap


def snapshot_out(s: RankingSnapshot, with_rows: bool = True) -> dict:
    out = {"id": s.id, "period": s.period, "config": s.config, "published_by": s.published_by, "published_at": s.published_at}
    return {**out, "rows": s.rows} if with_rows else out


async def latest(session: AsyncSession) -> RankingSnapshot | None:
    return (await session.execute(select(RankingSnapshot).order_by(RankingSnapshot.published_at.desc(), RankingSnapshot.id.desc())
                                  .limit(1))).scalar_one_or_none()
