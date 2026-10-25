"""Complaints (anyone signed in reports a vacancy, company, task or person) and the university ranking."""
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..core import ratelimit
from ..models import Challenge, Company, Complaint, EmploymentOutcome, Job, Partnership, University, User
from ..services import partnerships, ranking
from .deps import AdminActor, CurrentUser, Session, audit

router = APIRouter(tags=["trust"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])

REASONS = ("fake", "wrong_info", "spam", "offensive", "unpaid", "other")


class ComplaintIn(BaseModel):
    target_kind: Literal["job", "company", "task", "user"]
    target_id: int
    reason: Literal["fake", "wrong_info", "spam", "offensive", "unpaid", "other"]
    text: str = Field(default="", max_length=2000)


async def _target_title(session: Session, kind: str, target_id: int) -> str | None:
    model = {"job": Job, "company": Company, "task": Challenge, "user": User}[kind]
    obj = await session.get(model, target_id)
    if obj is None:
        return None
    if kind == "job":
        return f"{obj.title} ({obj.company.name})"
    if kind == "task":
        return f"{obj.title}" + (f" ({obj.company.name})" if obj.company else "")
    return obj.name if kind == "company" else obj.full_name


@router.post("/complaints", status_code=201)
async def complain(body: ComplaintIn, user: CurrentUser, session: Session) -> dict:
    ratelimit.limit(f"complaint:{user.id}", 10, 24 * 3600, "Bir kunda 10 tadan ortiq shikoyat yuborib bo'lmaydi")
    if await _target_title(session, body.target_kind, body.target_id) is None:
        raise HTTPException(404, "Shikoyat qilinayotgan narsa topilmadi")
    if body.target_kind == "user" and body.target_id == user.id:
        raise HTTPException(422, "O'zingizga shikoyat qila olmaysiz")
    session.add(Complaint(reporter_id=user.id, target_kind=body.target_kind, target_id=body.target_id,
                          reason=body.reason, text=body.text.strip()))
    await session.commit()
    return {"status": "open"}


@admin_router.get("/complaints")
async def complaints(_: AdminActor, session: Session, status: str | None = Query(default="open", max_length=10)) -> list[dict]:
    query = select(Complaint)
    if status:
        query = query.where(Complaint.status == status)
    rows = (await session.execute(query.order_by(Complaint.created_at.desc()).limit(300))).scalars().all()
    return [{"id": c.id, "target_kind": c.target_kind, "target_id": c.target_id,
             "target": await _target_title(session, c.target_kind, c.target_id) or "(o'chirilgan)",
             "reason": c.reason, "text": c.text, "status": c.status, "admin_note": c.admin_note,
             "reporter": c.reporter.full_name if c.reporter else None, "created_at": c.created_at,
             "resolved_at": c.resolved_at} for c in rows]


class ComplaintDecisionIn(BaseModel):
    status: Literal["resolved", "dismissed"]
    note: str = Field(default="", max_length=1000)


@admin_router.post("/complaints/{complaint_id}")
async def decide_complaint(complaint_id: int, body: ComplaintDecisionIn, actor: AdminActor, session: Session) -> dict:
    c = await session.get(Complaint, complaint_id)
    if c is None:
        raise HTTPException(404, "Shikoyat topilmadi")
    c.status, c.admin_note, c.resolved_at = body.status, body.note.strip(), datetime.now(UTC)
    audit(session, actor, "complaint.decide", f"{c.target_kind} #{c.target_id}", f"{body.status}: {body.note}")
    await session.commit()
    return {"status": c.status}


# --------------------------------------------------------------------------- ranking

def _method(config: ranking.RankingConfig) -> dict:
    return {**config.model_dump(), "formula": "100 * (employed + internship_weight * interned) / verified students"}


@router.get("/public/ranking")
async def public_ranking(session: Session) -> dict:
    """The latest published ranking (if any) and the live figures with the method behind them."""
    config = await ranking.get_config(session)
    snap = await ranking.latest(session)
    return {"published": ranking.snapshot_out(snap) if snap else None,
            "live": {"method": _method(config), "rows": await ranking.public_rows(session, config),
                     "computed_at": datetime.now(UTC)}}


@admin_router.get("/ranking")
async def admin_ranking(_: AdminActor, session: Session) -> dict:
    config = await ranking.get_config(session)
    snaps = (await session.execute(select(ranking.RankingSnapshot).order_by(ranking.RankingSnapshot.published_at.desc())
                                   .limit(50))).scalars().all()
    return {"method": _method(config), "rows": await ranking.compute(session, config),
            "snapshots": [ranking.snapshot_out(s, with_rows=False) for s in snaps]}


@admin_router.put("/ranking/config")
async def save_ranking_config(body: ranking.RankingConfig, actor: AdminActor, session: Session) -> dict:
    audit(session, actor, "ranking.config", "", f"internship_weight={body.internship_weight}, min_sample={body.min_sample}")
    return _method(await ranking.save_config(session, body))


class PublishIn(BaseModel):
    period: str = Field(min_length=3, max_length=60)


@admin_router.post("/ranking/publish", status_code=201)
async def publish_ranking(body: PublishIn, actor: AdminActor, session: Session) -> dict:
    audit(session, actor, "ranking.publish", body.period)
    snap = await ranking.publish(session, body.period, actor.name)
    return ranking.snapshot_out(snap)


# --------------------------------------------------------------------------- admin overviews (read only)

@admin_router.get("/partnerships")
async def all_partnerships(_: AdminActor, session: Session, status: str | None = Query(default=None, max_length=10)) -> list[dict]:
    query = select(Partnership)
    if status:
        query = query.where(Partnership.status == status)
    rows = (await session.execute(query.order_by(Partnership.created_at.desc()).limit(300))).scalars().all()
    return [partnerships.out(p) for p in rows]


@admin_router.get("/outcomes")
async def all_outcomes(_: AdminActor, session: Session, confirmed: bool | None = None) -> list[dict]:
    query = select(EmploymentOutcome)
    if confirmed is not None:
        query = query.where(EmploymentOutcome.confirmed.is_(confirmed))
    rows = (await session.execute(query.order_by(EmploymentOutcome.created_at.desc()).limit(500))).scalars().all()
    ids = {o.university_id for o in rows if o.university_id}
    unis = dict((await session.execute(select(University.id, University.short_name).where(University.id.in_(ids)))).all()) if ids else {}
    return [{"id": o.id, "student": o.student.full_name, "university": unis.get(o.university_id), "company": o.company_name,
             "position": o.position, "kind": o.kind, "source": o.source, "confirmed": o.confirmed,
             "confirmed_by": o.confirmed_by, "created_at": o.created_at} for o in rows]
