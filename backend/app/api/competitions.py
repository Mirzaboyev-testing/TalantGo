"""Competitions ("Musobaqalar"), teams ("Jamoalar") and rankings: the routes of docs/13-musobaqalar.md section 6
(the TypeScript side is frontend/src/competitionsApi.ts). Rules, standings and statistics: services/competitions.py.

Students: /competitions, /teams, /tests/{id}/stats. Organizers: /organizer/competitions for people of an approved
company and approved university staff (their own competitions), /admin/competitions for admin-site accounts (all of
them, plus hide/restore and the site's home block; permission "tests"). The site: /public/competitions/highlights.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy import func, or_, select

from ..core import ratelimit, shortcache
from ..core.brand import BRAND
from ..models import (Company, Competition, CompetitionEntry, CompetitionStage, StageSubmission, Team, TeamMembership,
                      University, User)
from ..schemas import Url
from ..services import competitions as svc
from ..services import files, inbox, uni_news
from ..services.applications import company_staff_ids
from ..services.catalog import JOB_FIELDS
from ..services.feed import study_line
from ..services.portfolio import media_url
from . import employer as employer_api
from . import university as university_api
from .challenges import file_names
from .deps import Actor, AdminActor, CurrentUser, Session, audit

router = APIRouter(tags=["competitions"])
organizer_router = APIRouter(prefix="/organizer/competitions", tags=["competitions"])
admin_router = APIRouter(prefix="/admin/competitions", tags=["competitions"])
public_router = APIRouter(prefix="/public/competitions", tags=["competitions"])
TASHKENT = ZoneInfo("Asia/Tashkent")
DEFAULT_PLACE_POINTS = [50, 30, 20]
MAX_SPAN = timedelta(days=366)                 # first stage start to last stage end


# --------------------------------------------------------------------------- how things look

def person_out(u: User) -> dict:
    return {"user_id": u.id, "name": u.full_name, "photo_url": u.photo_url, "subtitle": study_line(u)}


def stage_out(s: CompetitionStage, t: datetime) -> dict:
    return {"id": s.id, "order": s.position, "title": s.title, "description": s.description, "starts_at": s.starts_at,
            "ends_at": s.ends_at, "advance_count": s.advance_count, "phase": svc.stage_phase(s, t)}


def submission_out(s: StageSubmission, fnames: dict[int, str], who: dict[int, str]) -> dict:
    return {"stage_id": s.stage_id, "proof_url": s.proof_url, "note": s.note,
            "files": [{"id": i, "url": media_url(i), "name": fnames.get(i, "")} for i in (s.file_ids or [])],
            "score": s.score, "comment": s.comment, "submitted_at": s.submitted_at, "reviewed_at": s.reviewed_at,
            "submitted_by": who.get(s.submitted_by_id, "")}


async def teams_out(session: Session, teams: list[Team], viewer_id: int | None, history: bool = False) -> list[dict]:
    """TeamOut; the invite code and link only for the team's own active members."""
    if not teams:
        return []
    ids = [t.id for t in teams]
    members = await svc.active_memberships(session, ids)
    user_ids = {m.user_id for ms in members.values() for m in ms}
    users = {u.id: u for u in (await session.execute(select(User).where(User.id.in_(user_ids)))).scalars()} if user_ids else {}
    comp_ids = {t.competition_id for t in teams if t.competition_id}
    titles = dict((await session.execute(select(Competition.id, Competition.title).where(
        Competition.id.in_(comp_ids)))).all()) if comp_ids else {}
    counts = await svc.competitions_count(session, ids)
    out = []
    for t in teams:
        ms = [m for m in members[t.id] if m.user_id in users]
        mine = viewer_id is not None and any(m.user_id == viewer_id for m in ms)
        code = t.invite_code if mine and t.archived_at is None else None
        row = {"id": t.id, "name": t.name, "kind": t.kind, "competition_id": t.competition_id,
               "competition_title": titles.get(t.competition_id), "description": t.description,
               "captain_id": t.captain_id,
               "members": [{**person_out(users[m.user_id]), "role": m.role, "joined_at": m.joined_at} for m in ms],
               "size_max": t.size_max, "points": t.points, "competitions_n": counts.get(t.id, 0), "wins": t.wins,
               "created_at": t.created_at, "mine": mine, "is_captain": mine and t.captain_id == viewer_id,
               "invite_code": code, "invite_url": svc.invite_url(code) if code else None,
               "archived": t.archived_at is not None}
        if history:
            rows = (await session.execute(select(CompetitionEntry, Competition).join(
                Competition, Competition.id == CompetitionEntry.competition_id).where(
                CompetitionEntry.team_id == t.id, CompetitionEntry.status != "withdrawn",
                Competition.status != "draft", Competition.hidden.is_(False))
                .order_by(CompetitionEntry.created_at.desc()))).all()
            row["history"] = [{"competition_id": c.id, "title": c.title, "place": e.place, "score": e.total_score}
                              for e, c in rows]
        out.append(row)
    return out


async def team_out(session: Session, team: Team, viewer_id: int | None, history: bool = False) -> dict:
    return (await teams_out(session, [team], viewer_id, history))[0]


def organizer_out(c: Competition, companies: dict[int, Company], unis: dict[int, University]) -> dict:
    if c.organizer_kind == "company" and c.company_id in companies:
        co = companies[c.company_id]
        return {"kind": "company", "id": co.id, "name": co.name, "logo_url": files.logo_url(co.id, co.logo_file_id, co.status)}
    if c.organizer_kind == "university" and c.university_id in unis:
        uni = unis[c.university_id]
        return {"kind": "university", "id": uni.id, "name": uni.short_name, "logo_url": uni_news.university_logo_url(uni)}
    return {"kind": "platform", "id": None, "name": BRAND, "logo_url": None}


async def _orgs(session: Session, comps: list[Competition]) -> tuple[dict[int, Company], dict[int, University]]:
    co_ids = {c.company_id for c in comps if c.company_id}
    uni_ids = {c.university_id for c in comps if c.university_id}
    companies = {x.id: x for x in (await session.execute(select(Company).where(Company.id.in_(co_ids)))).scalars()} if co_ids else {}
    unis = {x.id: x for x in (await session.execute(select(University).where(University.id.in_(uni_ids)))).scalars()} if uni_ids else {}
    return companies, unis


async def organizer_name(session: Session, c: Competition) -> str:
    companies, unis = await _orgs(session, [c])
    return organizer_out(c, companies, unis)["name"]


async def my_entries(session: Session, comp_ids: list[int], user_id: int) -> dict[int, CompetitionEntry]:
    """The person's live entry in each competition; for finished ones also an entry they were credited on
    (a former teammate keeps the result they worked for)."""
    out: dict[int, CompetitionEntry] = {}
    for e in (await session.execute(select(CompetitionEntry).where(
            CompetitionEntry.competition_id.in_(comp_ids), CompetitionEntry.status != "withdrawn",
            svc.mine_clause(user_id)).order_by(CompetitionEntry.id))).scalars():
        out.setdefault(e.competition_id, e)
    missing = [i for i in comp_ids if i not in out]
    if missing:
        for e in (await session.execute(select(CompetitionEntry).join(
                StageSubmission, StageSubmission.entry_id == CompetitionEntry.id).where(
                CompetitionEntry.competition_id.in_(missing), CompetitionEntry.status != "withdrawn",
                StageSubmission.members.contains([user_id])).order_by(CompetitionEntry.id))).scalars():
            out.setdefault(e.competition_id, e)
    return out


async def my_entry_out(session: Session, c: Competition, e: CompetitionEntry, viewer: User) -> dict:
    team = await session.get(Team, e.team_id) if e.team_id else None
    positions = {s.id: s.position for s in c.stages}
    subs = sorted((await session.execute(select(StageSubmission).where(StageSubmission.entry_id == e.id))).scalars(),
                  key=lambda s: positions.get(s.stage_id, 0))
    fnames = await file_names(session, subs)
    who = await svc.names(session, [s.submitted_by_id for s in subs])
    board = svc.leaderboard(await svc.load_board(session, c), viewer.id, None, svc.now())
    rank = next((r["rank"] for r in board["rows"] if r["entry_id"] == e.id), None)
    return {"id": e.id, "team": await team_out(session, team, viewer.id) if team else None, "status": e.status,
            "place": e.place, "rank": rank, "total_score": e.total_score,
            "submissions": [submission_out(s, fnames, who) for s in subs]}


def why_not(c: Competition, viewer: User, entry: CompetitionEntry | None, t: datetime) -> str | None:
    if viewer.account_type != "student":
        return "Musobaqada talabalar qatnashadi"
    if entry is not None:
        return "Siz allaqachon ro'yxatdan o'tgansiz"
    if c.status != "published":
        return "Ro'yxatdan o'tish yopiq"
    if t > c.registration_ends_at:
        return "Ro'yxatdan o'tish muddati tugagan"
    if not svc.in_audience(c, viewer):
        return "Bu musobaqa boshqa auditoriya uchun"
    return None


async def competitions_out(session: Session, comps: list[Competition], viewer: User | None,
                           organizer: bool = False) -> list[dict]:
    if not comps:
        return []
    t = svc.now()
    ids = [c.id for c in comps]
    entries_n = dict((await session.execute(select(CompetitionEntry.competition_id, func.count()).where(
        CompetitionEntry.competition_id.in_(ids), CompetitionEntry.status != "withdrawn")
        .group_by(CompetitionEntry.competition_id))).all())
    companies, unis = await _orgs(session, comps)
    to_score: dict[int, int] = {}
    if organizer:
        to_score = dict((await session.execute(
            select(CompetitionEntry.competition_id, func.count()).select_from(StageSubmission)
            .join(CompetitionEntry, CompetitionEntry.id == StageSubmission.entry_id)
            .join(CompetitionStage, CompetitionStage.id == StageSubmission.stage_id)
            .where(CompetitionEntry.competition_id.in_(ids), StageSubmission.score.is_(None),
                   CompetitionStage.closed_at.is_(None), CompetitionEntry.status == "registered")
            .group_by(CompetitionEntry.competition_id))).all())
    mine = await my_entries(session, ids, viewer.id) if viewer is not None and viewer.account_type == "student" else {}
    out = []
    for c in comps:
        entry = mine.get(c.id)
        reason = why_not(c, viewer, entry, t) if viewer is not None else None
        row = {"id": c.id, "title": c.title, "description": c.description, "prize": c.prize,
               "organizer": organizer_out(c, companies, unis), "mode": c.mode, "team_kind": c.team_kind,
               "team_min": c.team_min, "team_max": c.team_max, "audience": c.audience, "job_fields": c.job_fields or [],
               "university_id": c.university_id, "registration_ends_at": c.registration_ends_at,
               "starts_at": c.starts_at, "ends_at": c.ends_at, "status": c.status, "phase": svc.competition_phase(c, t),
               "stages": [stage_out(s, t) for s in c.stages], "entries_n": entries_n.get(c.id, 0),
               "my_entry": await my_entry_out(session, c, entry, viewer) if entry is not None else None,
               "can_register": viewer is not None and reason is None, "why_not": reason,
               "place_points": c.place_points or []}
        if organizer:
            row |= {"to_score": to_score.get(c.id, 0), "is_hidden": c.hidden}
        out.append(row)
    return out


async def competition_out(session: Session, c: Competition, viewer: User | None, organizer: bool = False) -> dict:
    return (await competitions_out(session, [c], viewer, organizer))[0]


# --------------------------------------------------------------------------- students: competitions

async def _visible(session: Session, user: User, competition_id: int) -> Competition:
    c = (await session.execute(svc.visible(user).where(Competition.id == competition_id))).scalar_one_or_none()
    if c is None:
        raise HTTPException(404, "Musobaqa topilmadi")
    return c


def _stage(c: Competition, stage_id: int) -> CompetitionStage:
    stage = next((s for s in c.stages if s.id == stage_id), None)
    if stage is None:
        raise HTTPException(404, "Bosqich topilmadi")
    return stage


@router.get("/competitions")
async def list_competitions(user: CurrentUser, session: Session,
                            scope: Literal["open", "mine", "finished"] = "open") -> list[dict]:
    query = svc.visible(user)
    if scope == "open":
        query = query.where(Competition.status == "published").order_by(Competition.starts_at, Competition.id)
    elif scope == "finished":
        query = query.where(Competition.status == "results").order_by(Competition.results_at.desc().nulls_last(),
                                                                     Competition.id.desc())
    else:
        live = select(CompetitionEntry.competition_id).where(svc.mine_clause(user.id), CompetitionEntry.status != "withdrawn")
        worked = (select(CompetitionEntry.competition_id).join(StageSubmission, StageSubmission.entry_id == CompetitionEntry.id)
                  .where(StageSubmission.members.contains([user.id])))
        query = query.where(or_(Competition.id.in_(live), Competition.id.in_(worked))).order_by(
            Competition.starts_at.desc(), Competition.id.desc())
    comps = (await session.execute(query.limit(100))).scalars().all()
    return await competitions_out(session, list(comps), user)


@router.get("/competitions/{competition_id}")
async def competition_detail(competition_id: int, user: CurrentUser, session: Session) -> dict:
    return await competition_out(session, await _visible(session, user, competition_id), user)


class RegisterIn(BaseModel):
    team_id: int | None = None


@router.post("/competitions/{competition_id}/register")
async def register(competition_id: int, user: CurrentUser, session: Session,
                   body: Annotated[RegisterIn | None, Body()] = None) -> dict:
    svc.require_student(user)
    c = await _visible(session, user, competition_id)
    t = svc.now()
    if c.status != "published":
        raise HTTPException(409, "Ro'yxatdan o'tish yopiq")
    if t > c.registration_ends_at:
        raise HTTPException(409, "Ro'yxatdan o'tish muddati tugagan")
    if not svc.in_audience(c, user):
        raise HTTPException(403, "Bu musobaqa sizning auditoriyangiz uchun emas")
    if c.mode == "individual":
        await svc.lock_user(session, user.id)
        entry = (await session.execute(select(CompetitionEntry).where(
            CompetitionEntry.competition_id == c.id, CompetitionEntry.user_id == user.id))).scalar_one_or_none()
        if entry is not None and entry.status != "withdrawn":
            raise HTTPException(409, "Siz allaqachon ro'yxatdan o'tgansiz")
        if entry is None:
            session.add(CompetitionEntry(competition_id=c.id, user_id=user.id, status="registered", stage_reached=1,
                                         points_awarded=0, created_at=t))
        else:
            entry.status, entry.stage_reached = "registered", 1
    else:
        if body is None or not body.team_id:
            raise HTTPException(422, "Jamoani tanlang: jamoa musobaqasiga sardor jamoasini yozadi")
        team = await svc.lock_team(session, body.team_id)
        if team is None or team.archived_at is not None:
            raise HTTPException(404, "Jamoa topilmadi")
        if team.captain_id != user.id:
            raise HTTPException(403, "Jamoani musobaqaga faqat sardor yozadi")
        if c.team_kind == "persistent" and team.kind != "persistent":
            raise HTTPException(409, "Bu musobaqada faqat doimiy jamoalar qatnashadi")
        if c.team_kind == "one_time" and team.kind != "one_time":
            raise HTTPException(409, "Bu musobaqada faqat shu musobaqa uchun tuzilgan bir martalik jamoalar qatnashadi")
        if team.kind == "one_time" and team.competition_id != c.id:
            raise HTTPException(409, "Bu bir martalik jamoa boshqa musobaqa uchun tuzilgan")
        members = await svc.member_ids(session, team.id)
        if not c.team_min <= len(members) <= c.team_max:
            raise HTTPException(409, f"Jamoada {c.team_min}–{c.team_max} kishi bo'lishi kerak (hozir {len(members)})")
        people = {u.id: u for u in (await session.execute(select(User).where(User.id.in_(members)))).scalars()}
        if c.audience == "university":
            outside = [people[i].full_name for i in members if people[i].university_id != c.university_id]
            if outside:
                raise HTTPException(409, f"Musobaqa bitta universitet talabalari uchun: {', '.join(outside)} boshqa universitetdan")
        clash = await svc.taken(session, c.id, members, except_team=team.id)
        if clash:
            raise HTTPException(409, f"{', '.join(people[i].full_name for i in clash)} bu musobaqada boshqa jamoada qatnashyapti")
        entry = (await session.execute(select(CompetitionEntry).where(
            CompetitionEntry.competition_id == c.id, CompetitionEntry.team_id == team.id))).scalar_one_or_none()
        if entry is not None and entry.status != "withdrawn":
            raise HTTPException(409, "Jamoangiz allaqachon ro'yxatdan o'tgan")
        if entry is None:
            session.add(CompetitionEntry(competition_id=c.id, team_id=team.id, status="registered", stage_reached=1,
                                         points_awarded=0, created_at=t))
        else:
            entry.status, entry.stage_reached = "registered", 1
    await session.commit()
    return await competition_out(session, c, user)


async def _my_live_entry(session: Session, c: Competition, user: User, lock: bool = False) -> CompetitionEntry | None:
    query = select(CompetitionEntry).where(CompetitionEntry.competition_id == c.id, CompetitionEntry.status != "withdrawn",
                                           svc.mine_clause(user.id)).order_by(CompetitionEntry.id).limit(1)
    return (await session.execute(query.with_for_update() if lock else query)).scalar_one_or_none()


@router.post("/competitions/{competition_id}/withdraw")
async def withdraw(competition_id: int, user: CurrentUser, session: Session) -> dict:
    svc.require_student(user)
    c = await _visible(session, user, competition_id)
    entry = await _my_live_entry(session, c, user, lock=True)
    if entry is None:
        raise HTTPException(404, "Siz bu musobaqada ro'yxatdan o'tmagansiz")
    if c.status != "published" or svc.now() >= c.starts_at:
        raise HTTPException(409, "Musobaqa boshlangan: endi chiqib bo'lmaydi")
    if entry.team_id:
        team = await session.get(Team, entry.team_id)
        if team is None or team.captain_id != user.id:
            raise HTTPException(403, "Jamoani musobaqadan faqat sardor chiqaradi")
    entry.status = "withdrawn"
    await session.commit()
    return await competition_out(session, c, user)


class SubmitIn(BaseModel):
    proof_url: Url = ""
    note: str = Field(default="", max_length=2000)
    file_ids: list[int] = Field(default_factory=list, max_length=5)


@router.post("/competitions/{competition_id}/stages/{stage_id}/submit")
async def submit(competition_id: int, stage_id: int, body: SubmitIn, user: CurrentUser, session: Session) -> dict:
    """Any member sends the team's work; sent again before the deadline it replaces the earlier one (and its score)."""
    svc.require_student(user)
    c = await _visible(session, user, competition_id)
    stage = _stage(c, stage_id)
    t = svc.now()
    if c.status != "published" or not svc.stage_open(stage, t):
        raise HTTPException(409, "Bu bosqich hozir ish qabul qilmaydi")
    entry = await _my_live_entry(session, c, user, lock=True)
    if entry is None:
        raise HTTPException(404, "Siz bu musobaqada ro'yxatdan o'tmagansiz")
    if entry.status != "registered":
        raise HTTPException(409, "Musobaqa siz uchun yakunlangan" if entry.status == "eliminated" else "Siz musobaqadan chiqqansiz")
    if entry.stage_reached < stage.position:
        waiting = any(s.closed_at is None for s in c.stages if s.position < stage.position)
        raise HTTPException(409, "Tashkilotchi oldingi bosqich natijalarini hali e'lon qilmagan" if waiting
                            else "Siz bu bosqichga o'tmagansiz")
    team = None
    if entry.team_id:
        team = await session.get(Team, entry.team_id)
        members = await svc.member_ids(session, entry.team_id)
        if not c.team_min <= len(members) <= c.team_max:
            raise HTTPException(409, f"Jamoada {c.team_min}–{c.team_max} kishi bo'lishi kerak (hozir {len(members)}): "
                                     "jamoadoshni almashtiring")
    else:
        members = [user.id]
    from ..services import portfolio as pf
    claimed = await pf.claim(session, user, body.file_ids, pf.ATTACH_TYPES | pf.WORK_TYPES, "Fayl", pf.WORK_EXTS)
    if len(body.proof_url) < 10 and not claimed:
        raise HTTPException(422, "Ish havolasini qo'shing yoki kamida bitta fayl yuklang")
    sub = (await session.execute(select(StageSubmission).where(
        StageSubmission.stage_id == stage.id, StageSubmission.entry_id == entry.id))).scalar_one_or_none()
    first = sub is None
    if first:
        sub = StageSubmission(stage_id=stage.id, entry_id=entry.id, comment="")
        session.add(sub)
    sub.proof_url, sub.note, sub.file_ids = body.proof_url, body.note.strip(), [f.id for f in claimed]
    sub.submitted_by_id, sub.submitted_at, sub.members = user.id, t, members
    if not first and sub.score is not None:         # new work: the old score no longer applies
        sub.score, sub.reviewed_at = None, None
        await session.flush()
        await svc.recompute_total(session, entry)
    await session.commit()
    out = await my_entry_out(session, c, entry, user)
    if first:
        await _tell_organizer(session, c, stage, team.name if team else user.full_name)
    return out


async def _tell_organizer(session: Session, c: Competition, stage: CompetitionStage, name: str) -> None:
    if c.organizer_kind == "company" and c.company_id:
        ids, link = await company_staff_ids(session, c.company_id), f"/korxona/musobaqalar?c={c.id}"
    elif c.organizer_kind == "university":
        ids, link = await svc.university_staff_ids(session, c.university_id), f"/universitet/musobaqalar?c={c.id}"
    else:
        return                                       # platform competitions: the admins look in their panel
    await inbox.push(session, ids, "competition_submission", f"«{c.title}»: {name} {stage.title} bosqichiga ish yubordi.",
                     link=link, params={"competition": c.title, "stage": stage.title, "name": name},
                     group=f"comp:{c.id}", many=" · {count} ta yangi ish")


@router.get("/competitions/{competition_id}/leaderboard")
async def competition_leaderboard(competition_id: int, user: CurrentUser, session: Session,
                                  stage_id: int | None = None) -> dict:
    c = await _visible(session, user, competition_id)
    stage = _stage(c, stage_id) if stage_id else None
    return svc.leaderboard(await svc.load_board(session, c), user.id, stage, svc.now())


@router.get("/tests/{test_id}/stats")
async def test_stats(test_id: int, user: CurrentUser, session: Session) -> dict:
    """Where the student's graded attempt stands among all graded attempts of the test: no names."""
    return await svc.test_stats(session, test_id, user.id)


# --------------------------------------------------------------------------- students: teams

class TeamIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    kind: Literal["persistent", "one_time"]
    competition_id: int | None = None
    description: str = Field(default="", max_length=500)


class TeamPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=60)
    description: str | None = Field(default=None, max_length=500)


class JoinIn(BaseModel):
    code: str = Field(max_length=16)


class CaptainIn(BaseModel):
    user_id: int


def _clean_name(name: str) -> str:
    name = " ".join(name.split())
    if len(name) < 2:
        raise HTTPException(422, "Jamoa nomi kamida 2 belgi")
    return name


@router.get("/teams/mine")
async def my_teams(user: CurrentUser, session: Session) -> list[dict]:
    teams = (await session.execute(select(Team).join(TeamMembership, TeamMembership.team_id == Team.id).where(
        TeamMembership.user_id == user.id, TeamMembership.left_at.is_(None), Team.archived_at.is_(None))
        .order_by((Team.kind == "persistent").desc(), Team.created_at.desc(), Team.id.desc()))).scalars().all()
    return await teams_out(session, list(teams), user.id)


@router.get("/teams/ranking")
async def team_ranking(user: CurrentUser, session: Session, university_id: int | None = None) -> list[dict]:
    return await svc.team_ranking(session, university_id)


@router.post("/teams", status_code=201)
async def create_team(body: TeamIn, user: CurrentUser, session: Session) -> dict:
    svc.require_student(user)
    ratelimit.limit(f"teams:create:{user.id}", 10, 3600, "Juda ko'p jamoa yaratildi. Birozdan keyin urinib ko'ring.")
    name = _clean_name(body.name)
    await svc.lock_user(session, user.id)
    t = svc.now()
    if body.kind == "persistent":
        if body.competition_id:
            raise HTTPException(422, "Doimiy jamoa bitta musobaqaga bog'lanmaydi")
        if await svc.persistent_count(session, user.id) >= svc.MAX_PERSISTENT:
            raise HTTPException(409, f"Siz allaqachon {svc.MAX_PERSISTENT} ta doimiy jamoadasiz: avval biridan chiqing")
        size_max, competition_id = svc.PERSISTENT_SIZE, None
    else:
        if not body.competition_id:
            raise HTTPException(422, "Bir martalik jamoa uchun musobaqani tanlang")
        c = await _visible(session, user, body.competition_id)
        if c.mode != "team" or c.team_kind == "persistent":
            raise HTTPException(409, "Bu musobaqa uchun bir martalik jamoa tuzib bo'lmaydi")
        if not svc.registration_open(c, t):
            raise HTTPException(409, "Ro'yxatdan o'tish yopiq")
        if not svc.in_audience(c, user):
            raise HTTPException(403, "Bu musobaqa sizning auditoriyangiz uchun emas")
        if await svc.taken(session, c.id, [user.id]) or await svc.other_one_time_team(session, c.id, user.id):
            raise HTTPException(409, "Siz bu musobaqada allaqachon jamoadasiz")
        size_max, competition_id = c.team_max, c.id
    team = Team(name=name, kind=body.kind, competition_id=competition_id, captain_id=user.id,
                invite_code=await svc.new_code(session), size_max=size_max, description=body.description.strip(),
                points=0, wins=0, created_at=t)
    session.add(team)
    await session.flush()
    session.add(TeamMembership(team_id=team.id, user_id=user.id, role="captain", joined_at=t))
    await session.commit()
    return await team_out(session, team, user.id)


async def _by_code(session: Session, code: str) -> Team:
    clean = svc.clean_code(code)
    team = (await session.execute(select(Team).where(Team.invite_code == clean, Team.archived_at.is_(None)))).scalar_one_or_none() \
        if clean else None
    if team is None:
        raise HTTPException(404, "Jamoa topilmadi: kodni tekshiring")
    return team


@router.get("/teams/join/{code}")
async def preview_team(code: str, user: CurrentUser, session: Session) -> dict:
    ratelimit.limit(f"teams:preview:{user.id}", 40, 600)
    team = await _by_code(session, code)
    members = await svc.member_ids(session, team.id)
    captain = await session.get(User, team.captain_id) if team.captain_id else None
    title = await session.scalar(select(Competition.title).where(Competition.id == team.competition_id)) \
        if team.competition_id else None
    return {"id": team.id, "name": team.name, "kind": team.kind, "members_n": len(members), "size_max": team.size_max,
            "competition_title": title, "captain_name": captain.full_name if captain else ""}


@router.post("/teams/join")
async def join_team(body: JoinIn, user: CurrentUser, session: Session) -> dict:
    svc.require_student(user)
    ratelimit.limit(f"teams:join:{user.id}", 20, 600)
    team_id = (await _by_code(session, body.code)).id
    await svc.lock_user(session, user.id)
    team = await svc.lock_team(session, team_id)
    if team is None or team.archived_at is not None:
        raise HTTPException(404, "Jamoa topilmadi: kodni tekshiring")
    if await svc.membership(session, team.id, user.id):
        return await team_out(session, team, user.id)          # a second tap: already in
    await svc.check_join(session, team, user, len(await svc.member_ids(session, team.id)))
    session.add(TeamMembership(team_id=team.id, user_id=user.id, role="member", joined_at=svc.now()))
    await session.commit()
    if team.captain_id:
        await inbox.push(session, [team.captain_id], "team_joined", f"«{team.name}» jamoasiga {user.full_name} qo'shildi.",
                         link=svc.TEAM_LINK.format(id=team.id), params={"name": user.full_name, "team": team.name})
    return await team_out(session, team, user.id)


async def _captain_team(session: Session, team_id: int, user: User) -> Team:
    team = await svc.lock_team(session, team_id)
    if team is None or team.archived_at is not None:
        raise HTTPException(404, "Jamoa topilmadi")
    if team.captain_id != user.id:
        raise HTTPException(403, "Buni faqat jamoa sardori qila oladi")
    return team


@router.get("/teams/{team_id}")
async def team_detail(team_id: int, user: CurrentUser, session: Session) -> dict:
    team = await session.get(Team, team_id)
    if team is None:
        raise HTTPException(404, "Jamoa topilmadi")
    return await team_out(session, team, user.id, history=True)


@router.post("/teams/{team_id}/leave")
async def leave_team(team_id: int, user: CurrentUser, session: Session) -> dict:
    team = await svc.lock_team(session, team_id)
    mine = await svc.membership(session, team_id, user.id) if team is not None else None
    if mine is None:
        raise HTTPException(404, "Siz bu jamoada emassiz")
    members = await svc.member_ids(session, team_id)
    if mine.role == "captain" and len(members) > 1:
        raise HTTPException(409, "Avval sardorlikni boshqa a'zoga bering")
    t = svc.now()
    mine.left_at = t
    if len(members) == 1:                            # the last person leaves: the team is archived
        team.archived_at = t
        await svc.withdraw_team_entries(session, team.id)
    await session.commit()
    return {"ok": True}


@router.delete("/teams/{team_id}/members/{member_id}")
async def remove_member(team_id: int, member_id: int, user: CurrentUser, session: Session) -> dict:
    """Replacing a teammate = removing them here + the new one joining with the code (allowed while competitions run;
    each stage submission keeps who was on the team)."""
    team = await _captain_team(session, team_id, user)
    if member_id == user.id:
        raise HTTPException(422, "O'zingizni chiqara olmaysiz: «Jamoadan chiqish»ni bosing")
    target = await svc.membership(session, team.id, member_id)
    if target is None:
        raise HTTPException(404, "Bu kishi jamoada emas")
    target.left_at = svc.now()
    await session.commit()
    await inbox.push(session, [member_id], "team_removed", f"Sardor sizni «{team.name}» jamoasidan chiqardi.",
                     link="/talaba/topshiriqlar/jamoa", params={"team": team.name})
    return await team_out(session, team, user.id)


@router.post("/teams/{team_id}/captain")
async def make_captain(team_id: int, body: CaptainIn, user: CurrentUser, session: Session) -> dict:
    team = await _captain_team(session, team_id, user)
    if body.user_id != user.id:
        target = await svc.membership(session, team.id, body.user_id)
        if target is None:
            raise HTTPException(404, "Bu kishi jamoada emas")
        mine = await svc.membership(session, team.id, user.id)
        if mine is not None:
            mine.role = "member"
        target.role, team.captain_id = "captain", body.user_id
        await session.commit()
    return await team_out(session, team, user.id)


@router.post("/teams/{team_id}/code")
async def renew_code(team_id: int, user: CurrentUser, session: Session) -> dict:
    team = await _captain_team(session, team_id, user)
    team.invite_code = await svc.new_code(session)
    await session.commit()
    return await team_out(session, team, user.id)


@router.patch("/teams/{team_id}")
async def edit_team(team_id: int, body: TeamPatch, user: CurrentUser, session: Session) -> dict:
    team = await _captain_team(session, team_id, user)
    if body.name is not None:
        team.name = _clean_name(body.name)
    if body.description is not None:
        team.description = body.description.strip()
    await session.commit()
    return await team_out(session, team, user.id)


# --------------------------------------------------------------------------- organizers

@dataclass
class Org:
    """Who manages competitions: a company's people, a university's approved staff, or an admin (platform)."""
    kind: str
    company_id: int | None = None
    university_id: int | None = None
    user: User | None = None
    actor: Actor | None = None

    def owns(self, c: Competition) -> bool:
        if self.kind == "platform":
            return True
        if self.kind == "company":
            return c.organizer_kind == "company" and c.company_id == self.company_id
        return c.organizer_kind == "university" and c.university_id == self.university_id


async def organizer(user: CurrentUser) -> Org:
    if user.account_type == "employer":
        person = await employer_api.approved_employer(await employer_api.employer(user))
        return Org("company", company_id=person.company_id, user=person)
    if user.account_type == "university":
        person = await university_api.staff(user)
        return Org("university", university_id=person.staff_university_id, user=person)
    raise HTTPException(403, "Musobaqani tasdiqlangan korxona yoki universitet xodimi e'lon qiladi")


async def platform(actor: AdminActor) -> Org:
    return Org("platform", actor=actor)


class StageIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=4000)
    starts_at: datetime
    ends_at: datetime
    advance_count: int | None = Field(default=None, ge=1, le=100000)


class CompetitionIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(default="", max_length=8000)
    prize: str = Field(default="", max_length=300)
    mode: Literal["individual", "team"] = "individual"
    team_kind: Literal["any", "persistent", "one_time"] = "any"
    team_min: int = Field(default=1, ge=1, le=10)
    team_max: int = Field(default=1, ge=1, le=10)
    audience: Literal["all", "fields", "university"] = "all"
    job_fields: list[str] = Field(default_factory=list, max_length=12)
    university_id: int | None = None
    registration_ends_at: datetime
    place_points: list[int] | None = Field(default=None, max_length=10)
    stages: list[StageIn] = Field(min_length=1, max_length=5)
    publish: bool = False

    @model_validator(mode="after")
    def _rules(self):
        self.title, self.prize, self.description = " ".join(self.title.split()), self.prize.strip(), self.description.strip()
        if len(self.title) < 3:
            raise ValueError("Nomi kamida 3 belgi")
        self.registration_ends_at = svc.aware(self.registration_ends_at)
        for s in self.stages:
            s.title, s.description = " ".join(s.title.split()), s.description.strip()
            s.starts_at, s.ends_at = svc.aware(s.starts_at), svc.aware(s.ends_at)
            if s.ends_at <= s.starts_at:
                raise ValueError("Bosqich tugashi boshlanishidan keyin bo'lsin")
        for a, b in zip(self.stages, self.stages[1:]):
            if b.starts_at < a.ends_at:
                raise ValueError("Bosqichlar ketma-ket bo'lsin: keyingisi oldingisi tugagach boshlanadi")
        self.stages[-1].advance_count = None
        if self.stages[-1].ends_at - self.stages[0].starts_at > MAX_SPAN:
            raise ValueError("Musobaqa ko'pi bilan bir yil davom etadi")
        if self.registration_ends_at > self.stages[0].ends_at:
            raise ValueError("Ro'yxatdan o'tish birinchi bosqich tugashidan oldin yopilsin")
        if self.mode == "individual":
            self.team_kind, self.team_min, self.team_max = "any", 1, 1
        elif self.team_max < 2 or self.team_min > self.team_max:
            raise ValueError("Jamoa hajmi: kamida 1, ko'pi bilan 10 kishi, eng kattasi kamida 2")
        unknown = [f for f in self.job_fields if f not in JOB_FIELDS]
        if unknown:
            raise ValueError(f"Noma'lum kasb yo'nalishi: {', '.join(unknown)}")
        self.job_fields = list(dict.fromkeys(self.job_fields)) if self.audience == "fields" else []
        if self.audience == "fields" and not self.job_fields:
            raise ValueError("Kasb yo'nalishlarini tanlang")
        if self.place_points is not None and any(p < 0 or p > 100 for p in self.place_points):
            raise ValueError("O'rin ballari 0 dan 100 gacha")
        return self


class CompetitionPatch(BaseModel):
    """Partial<CompetitionInput>: merged with the current values and checked like a new competition."""
    title: str | None = None
    description: str | None = None
    prize: str | None = None
    mode: str | None = None
    team_kind: str | None = None
    team_min: int | None = None
    team_max: int | None = None
    audience: str | None = None
    job_fields: list[str] | None = None
    university_id: int | None = None
    registration_ends_at: datetime | None = None
    place_points: list[int] | None = None
    stages: list[dict] | None = None
    publish: bool | None = None


class ScoreIn(BaseModel):
    entry_id: int
    score: int = Field(ge=0, le=100)
    comment: str = Field(default="", max_length=2000)


class CloseIn(BaseModel):
    advance_entry_ids: list[int] | None = Field(default=None, max_length=10000)


class HomeIn(BaseModel):
    show: bool


def _audit(session: Session, org: Org, action: str, c: Competition, details: str = "") -> None:
    if org.actor is not None:
        audit(session, org.actor, action, f"{c.title} (#{c.id})", details)


async def _own(session: Session, org: Org, competition_id: int) -> Competition:
    c = await session.get(Competition, competition_id)
    if c is None or not org.owns(c):
        raise HTTPException(404, "Musobaqa topilmadi")
    return c


async def _audience_university(session: Session, org: Org, body: CompetitionIn) -> int | None:
    """A university's competition belongs to it (and «university» audience means its own students); a company or
    the platform names the audience university only for audience «university»."""
    if org.kind == "university":
        if body.audience == "university" and body.university_id not in (None, org.university_id):
            raise HTTPException(403, "Universitet faqat o'z talabalari uchun musobaqa e'lon qiladi")
        return org.university_id
    if body.audience != "university":
        return None
    uni = await session.get(University, body.university_id) if body.university_id else None
    if uni is None or not uni.is_active:
        raise HTTPException(422, "Universitetni tanlang")
    return uni.id


def _as_input(c: Competition) -> dict:
    return {"title": c.title, "description": c.description, "prize": c.prize, "mode": c.mode, "team_kind": c.team_kind,
            "team_min": c.team_min, "team_max": c.team_max, "audience": c.audience, "job_fields": list(c.job_fields or []),
            "university_id": c.university_id, "registration_ends_at": c.registration_ends_at,
            "place_points": list(c.place_points or []), "publish": False,
            "stages": [{"title": s.title, "description": s.description, "starts_at": s.starts_at, "ends_at": s.ends_at,
                        "advance_count": s.advance_count} for s in c.stages]}


def _validated(data: dict) -> CompetitionIn:
    try:
        return CompetitionIn.model_validate(data)
    except ValidationError as e:
        raise RequestValidationError(e.errors(include_url=False, include_context=False)) from None


async def _announce(session: Session, c: Competition) -> None:
    org = await organizer_name(session, c)
    deadline = c.registration_ends_at.astimezone(TASHKENT).strftime("%d.%m.%Y")
    prize = f" Sovrin: {c.prize}." if c.prize else ""
    await svc.notify_people(session, await svc.audience_ids(session, c), "competition_new",
                            f"Yangi musobaqa: «{c.title}» ({org}). Ro'yxatdan o'tish {deadline} gacha.{prize}", c.id,
                            {"competition": c.title, "organizer": org, "deadline": deadline, "mode": c.mode,
                             "prize": c.prize})


async def org_list(org: Org, session: Session) -> list[dict]:
    query = select(Competition)
    if org.kind == "company":
        query = query.where(Competition.organizer_kind == "company", Competition.company_id == org.company_id)
    elif org.kind == "university":
        query = query.where(Competition.organizer_kind == "university", Competition.university_id == org.university_id)
    comps = (await session.execute(query.order_by(Competition.created_at.desc(), Competition.id.desc()).limit(300))).scalars().all()
    return await competitions_out(session, list(comps), None, organizer=True)


async def org_create(org: Org, body: CompetitionIn, session: Session) -> dict:
    t = svc.now()
    university_id = await _audience_university(session, org, body)
    if body.publish and body.registration_ends_at <= t:
        raise HTTPException(422, "Ro'yxatdan o'tish muddati kelajakda bo'lsin")
    c = Competition(organizer_kind=org.kind, company_id=org.company_id, university_id=university_id,
                    created_by_id=org.user.id if org.user else None,
                    created_by_admin=org.actor.name[:160] if org.actor else "", title=body.title,
                    description=body.description, prize=body.prize, mode=body.mode, team_kind=body.team_kind,
                    team_min=body.team_min, team_max=body.team_max, audience=body.audience, job_fields=body.job_fields,
                    registration_ends_at=body.registration_ends_at, starts_at=body.stages[0].starts_at,
                    ends_at=body.stages[-1].ends_at,
                    place_points=body.place_points if body.place_points is not None else list(DEFAULT_PLACE_POINTS),
                    status="published" if body.publish else "draft", hidden=False, created_at=t)
    c.stages = [CompetitionStage(position=i, title=s.title, description=s.description, starts_at=s.starts_at,
                                 ends_at=s.ends_at, advance_count=s.advance_count)
                for i, s in enumerate(body.stages, start=1)]
    session.add(c)
    await session.flush()
    _audit(session, org, "competition.create", c, c.status)
    await session.commit()
    await session.refresh(c)
    if c.status == "published":
        await _announce(session, c)
    return await competition_out(session, c, None, organizer=True)


async def org_edit(org: Org, competition_id: int, body: CompetitionPatch, session: Session) -> dict:
    """Before the first stage starts everything can change; afterwards only the title, description and prize."""
    c = await _own(session, org, competition_id)
    if c.status == "archived":
        raise HTTPException(409, "Arxivdagi musobaqani o'zgartirib bo'lmaydi")
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if k != "publish"}
    if changes.get("place_points", 0) is None:
        changes.pop("place_points")
    current = _as_input(c)
    new = _validated({**current, **changes})
    t = svc.now()
    if c.status == "results" or t >= c.starts_at:
        before = _validated(current).model_dump(exclude={"title", "description", "prize", "publish", "university_id"})
        if new.model_dump(exclude={"title", "description", "prize", "publish", "university_id"}) != before or \
                await _audience_university(session, org, new) != c.university_id:
            raise HTTPException(409, "Musobaqa boshlangan: endi faqat nomi, tavsifi va sovrini o'zgaradi")
        c.title, c.description, c.prize = new.title, new.description, new.prize
    else:
        has_entries = await session.scalar(select(func.count()).select_from(CompetitionEntry).where(
            CompetitionEntry.competition_id == c.id, CompetitionEntry.status != "withdrawn"))
        if has_entries and (new.mode != c.mode or new.team_kind != c.team_kind):
            raise HTTPException(409, "Ishtirokchilar bor: musobaqa turi va jamoa turi o'zgarmaydi")
        if c.status == "published" and new.registration_ends_at <= t:
            raise HTTPException(422, "Ro'yxatdan o'tish muddati kelajakda bo'lsin")
        c.university_id = await _audience_university(session, org, new)
        for name in ("title", "description", "prize", "mode", "team_kind", "team_min", "team_max", "audience",
                     "job_fields", "registration_ends_at"):
            setattr(c, name, getattr(new, name))
        if new.place_points is not None:
            c.place_points = new.place_points
        stages = list(c.stages)
        for i, s in enumerate(new.stages, start=1):        # in place: (competition, position) stays unique
            if i <= len(stages):
                st = stages[i - 1]
                st.title, st.description, st.starts_at, st.ends_at, st.advance_count = (
                    s.title, s.description, s.starts_at, s.ends_at, s.advance_count)
            else:
                c.stages.append(CompetitionStage(position=i, title=s.title, description=s.description,
                                                 starts_at=s.starts_at, ends_at=s.ends_at, advance_count=s.advance_count))
        for st in stages[len(new.stages):]:
            c.stages.remove(st)
        c.starts_at, c.ends_at = new.stages[0].starts_at, new.stages[-1].ends_at
    _audit(session, org, "competition.edit", c, ", ".join(sorted(changes)))
    await session.commit()
    await session.refresh(c)
    return await competition_out(session, c, None, organizer=True)


async def org_publish(org: Org, competition_id: int, session: Session) -> dict:
    c = await _own(session, org, competition_id)
    if c.status == "draft":
        if c.registration_ends_at <= svc.now():
            raise HTTPException(409, "Ro'yxatdan o'tish muddati o'tib ketgan: avval sanani yangilang")
        c.status = "published"
        _audit(session, org, "competition.publish", c)
        await session.commit()
        await _announce(session, c)
    elif c.status != "published":
        raise HTTPException(409, "Faqat qoralama e'lon qilinadi")
    return await competition_out(session, c, None, organizer=True)


async def org_archive(org: Org, competition_id: int, session: Session) -> dict:
    c = await _own(session, org, competition_id)
    if c.status != "archived":
        c.status = "archived"
        _audit(session, org, "competition.archive", c)
        await session.commit()
    return await competition_out(session, c, None, organizer=True)


async def entry_rows(session: Session, c: Competition, stage: CompetitionStage, only: int | None = None) -> list[dict]:
    query = select(CompetitionEntry).where(CompetitionEntry.competition_id == c.id)
    if only is not None:
        query = query.where(CompetitionEntry.id == only)
    entries = (await session.execute(query.order_by(CompetitionEntry.created_at, CompetitionEntry.id))).scalars().all()
    if not entries:
        return []
    subs = {s.entry_id: s for s in (await session.execute(select(StageSubmission).where(
        StageSubmission.stage_id == stage.id, StageSubmission.entry_id.in_([e.id for e in entries])))).scalars()}
    team_ids = [e.team_id for e in entries if e.team_id]
    teams = {t.id: t for t in (await session.execute(select(Team).where(Team.id.in_(team_ids)))).scalars()} if team_ids else {}
    team_rows = {r["id"]: r for r in await teams_out(session, list(teams.values()), None)}
    user_ids = [e.user_id for e in entries if e.user_id]
    users = {u.id: u for u in (await session.execute(select(User).where(User.id.in_(user_ids)))).scalars()} if user_ids else {}
    fnames = await file_names(session, subs.values())
    who = await svc.names(session, [s.submitted_by_id for s in subs.values()])
    rows = []
    for e in entries:
        sub = subs.get(e.id)
        if e.team_id:
            team = team_rows.get(e.team_id)
            name = team["name"] if team else ""
            members = [{k: m[k] for k in ("user_id", "name", "photo_url", "subtitle")} for m in (team["members"] if team else [])]
        else:
            u = users.get(e.user_id)
            team, name, members = None, u.full_name if u else "", [person_out(u)] if u else []
        rows.append({"entry_id": e.id, "name": name, "team": team, "members": members, "status": e.status,
                     "submission": submission_out(sub, fnames, who) if sub else None, "total_score": e.total_score,
                     "stage_reached": e.stage_reached, "place": e.place})
    order = {"registered": 0, "finished": 0, "eliminated": 1, "withdrawn": 2}
    rows.sort(key=lambda r: (order.get(r["status"], 3), r["submission"] is None,
                             r["submission"] is not None and r["submission"]["score"] is not None,
                             -(r["submission"]["score"] or 0) if r["submission"] else 0))
    return rows


async def org_entries(org: Org, competition_id: int, stage_id: int | None, session: Session) -> list[dict]:
    c = await _own(session, org, competition_id)
    stage = _stage(c, stage_id) if stage_id else svc.current_stage(c, svc.now())
    return await entry_rows(session, c, stage)


async def org_score(org: Org, competition_id: int, stage_id: int, body: ScoreIn, session: Session) -> dict:
    c = await _own(session, org, competition_id)
    stage = _stage(c, stage_id)
    if c.status != "published":
        raise HTTPException(409, "Musobaqa yakunlangan: ballar endi o'zgarmaydi")
    if stage.closed_at is not None:
        raise HTTPException(409, "Bosqich yopilgan: ballar endi o'zgarmaydi")
    if svc.now() < stage.starts_at:
        raise HTTPException(409, "Bosqich hali boshlanmagan")
    entry = await session.get(CompetitionEntry, body.entry_id)
    if entry is None or entry.competition_id != c.id or entry.status == "withdrawn":
        raise HTTPException(404, "Ishtirokchi topilmadi")
    sub = (await session.execute(select(StageSubmission).where(
        StageSubmission.stage_id == stage.id, StageSubmission.entry_id == entry.id))).scalar_one_or_none()
    if sub is None:
        raise HTTPException(404, "Bu ishtirokchi bu bosqichda ish yubormagan")
    before = (sub.score, sub.comment)
    sub.score, sub.comment, sub.reviewed_at = body.score, body.comment.strip(), svc.now()
    await session.flush()
    await svc.recompute_total(session, entry)
    _audit(session, org, "competition.score", c, f"{stage.title}: #{entry.id} = {body.score}")
    await session.commit()
    if (sub.score, sub.comment) != before:
        people = [entry.user_id] if entry.user_id else await svc.member_ids(session, entry.team_id)
        await svc.notify_people(session, people, "competition_scored",
                                f"«{c.title}»: «{stage.title}» bosqichidagi ishingiz baholandi: {body.score}/100.", c.id,
                                {"competition": c.title, "stage": stage.title, "score": body.score,
                                 "comment": sub.comment})
    return (await entry_rows(session, c, stage, only=entry.id))[0]


async def org_close(org: Org, competition_id: int, stage_id: int, body: CloseIn | None, session: Session) -> dict:
    """Closes a finished stage: the top advance_count by this stage's score (or the given list; without either, everyone
    who sent work) go on to the next stage, the rest are eliminated. The last stage just closes (results follow)."""
    c = await _own(session, org, competition_id)
    stage = _stage(c, stage_id)
    t = svc.now()
    if c.status != "published":
        raise HTTPException(409, "Musobaqa yakunlangan")
    if stage.closed_at is not None:
        raise HTTPException(409, "Bosqich allaqachon yopilgan")
    if t <= stage.ends_at:
        raise HTTPException(409, "Bosqich hali tugamagan")
    if any(s.closed_at is None for s in c.stages if s.position < stage.position):
        raise HTTPException(409, "Avval oldingi bosqichni yoping")
    board = await svc.load_board(session, c)
    pool = [e for e in board.entries if e.status == "registered" and e.stage_reached >= stage.position]
    later = [s for s in c.stages if s.position > stage.position]
    advanced, eliminated = [], []
    if later:
        subs = {e.id: board.subs[e.id].get(stage.id) for e in pool}
        if body is not None and body.advance_entry_ids is not None:
            chosen = set(body.advance_entry_ids)
            if chosen - {e.id for e in pool}:
                raise HTTPException(422, "Ro'yxatda bu bosqich ishtirokchisi bo'lmagan yozuv bor")
        elif stage.advance_count:
            scored = [e for e in pool if subs[e.id] is not None and subs[e.id].score is not None]
            scored.sort(key=lambda e: (-subs[e.id].score, subs[e.id].submitted_at, e.id))
            chosen = {e.id for e in scored[:stage.advance_count]}
        else:
            chosen = {e.id for e in pool if subs[e.id] is not None}
        for e in pool:
            if e.id in chosen:
                e.stage_reached = stage.position + 1
                advanced.append(e)
            else:
                e.status = "eliminated"
                eliminated.append(e)
    stage.closed_at = t
    _audit(session, org, "competition.close_stage", c, f"{stage.title}: {len(advanced)} o'tdi, {len(eliminated)} chiqdi")
    await session.commit()
    if later:
        nxt = later[0].title
        await svc.notify_people(session, [p for e in advanced for p in svc.entry_people(board, e)], "stage_advanced",
                                f"Tabriklaymiz! «{c.title}»: siz «{stage.title}» bosqichidan o'tdingiz, keyingisi «{nxt}».",
                                c.id, {"competition": c.title, "stage": stage.title, "next_stage": nxt})
        await svc.notify_people(session, [p for e in eliminated for p in svc.entry_people(board, e)], "stage_eliminated",
                                f"«{c.title}»: «{stage.title}» bosqichidan keyin musobaqa siz uchun yakunlandi. "
                                "Qatnashganingiz uchun rahmat!", c.id, {"competition": c.title, "stage": stage.title})
    return await competition_out(session, c, None, organizer=True)


async def org_results(org: Org, competition_id: int, session: Session) -> dict:
    c = await _own(session, org, competition_id)
    t = svc.now()
    if c.status == "results":
        raise HTTPException(409, "Natijalar allaqachon e'lon qilingan")
    if c.status != "published":
        raise HTTPException(409, "Avval musobaqani e'lon qiling")
    if t <= c.ends_at:
        raise HTTPException(409, "Oxirgi bosqich hali tugamagan")
    if any(s.closed_at is None for s in c.stages[:-1]):
        raise HTTPException(409, "Avval oldingi bosqichlarni yoping")
    if c.stages[-1].closed_at is None:
        c.stages[-1].closed_at = t
    results = await svc.finalize(session, c, t)
    _audit(session, org, "competition.results", c, f"{sum(1 for e, _ in results if e.place)} o'rin")
    await session.commit()
    by_outcome: dict[tuple, list[int]] = {}
    for e, people in results:
        by_outcome.setdefault((e.place, e.points_awarded), []).extend(people)
    for (place, points), people in by_outcome.items():
        got = f" Siz {place}-o'rinni egalladingiz" + (f" (+{points} ball)." if points else ".") if place else ""
        await svc.notify_people(session, people, "competition_results", f"«{c.title}» natijalari e'lon qilindi.{got}",
                                c.id, {"competition": c.title, "place": place, "points": points})
    return await competition_out(session, c, None, organizer=True)


# admin-only routes first: "/home" must not be read as a competition id
@admin_router.get("/home")
async def admin_home(actor: AdminActor, session: Session) -> dict:
    return {"show": await svc.home_shown(session)}


@admin_router.put("/home")
async def admin_set_home(body: HomeIn, actor: AdminActor, session: Session) -> dict:
    await svc.set_home(session, body.show)
    audit(session, actor, "competitions.home", "site", "on" if body.show else "off")
    await session.commit()
    shortcache.clear()
    return {"show": body.show}


def _organizer_routes(r: APIRouter, dep) -> None:
    """The same manager for /organizer/competitions (company, university) and /admin/competitions (platform)."""
    OrgDep = Annotated[Org, Depends(dep)]

    @r.get("")
    async def competitions_list(org: OrgDep, session: Session) -> list[dict]:
        return await org_list(org, session)

    @r.post("", status_code=201)
    async def competitions_create(body: CompetitionIn, org: OrgDep, session: Session) -> dict:
        return await org_create(org, body, session)

    @r.patch("/{competition_id}")
    async def competitions_edit(competition_id: int, body: CompetitionPatch, org: OrgDep, session: Session) -> dict:
        return await org_edit(org, competition_id, body, session)

    @r.post("/{competition_id}/publish")
    async def competitions_publish(competition_id: int, org: OrgDep, session: Session) -> dict:
        return await org_publish(org, competition_id, session)

    @r.post("/{competition_id}/archive")
    async def competitions_archive(competition_id: int, org: OrgDep, session: Session) -> dict:
        return await org_archive(org, competition_id, session)

    @r.get("/{competition_id}/entries")
    async def competitions_entries(competition_id: int, org: OrgDep, session: Session,
                                   stage_id: int | None = None) -> list[dict]:
        return await org_entries(org, competition_id, stage_id, session)

    @r.post("/{competition_id}/stages/{stage_id}/score")
    async def competitions_score(competition_id: int, stage_id: int, body: ScoreIn, org: OrgDep, session: Session) -> dict:
        return await org_score(org, competition_id, stage_id, body, session)

    @r.post("/{competition_id}/stages/{stage_id}/close")
    async def competitions_close(competition_id: int, stage_id: int, org: OrgDep, session: Session,
                                 body: Annotated[CloseIn | None, Body()] = None) -> dict:
        return await org_close(org, competition_id, stage_id, body, session)

    @r.post("/{competition_id}/results")
    async def competitions_results(competition_id: int, org: OrgDep, session: Session) -> dict:
        return await org_results(org, competition_id, session)


_organizer_routes(organizer_router, organizer)
_organizer_routes(admin_router, platform)


async def _hide(actor: Actor, competition_id: int, hidden: bool, session: Session) -> dict:
    c = await session.get(Competition, competition_id)
    if c is None:
        raise HTTPException(404, "Musobaqa topilmadi")
    c.hidden = hidden
    audit(session, actor, "competition.hide" if hidden else "competition.restore", f"{c.title} (#{c.id})")
    await session.commit()
    shortcache.clear()
    return await competition_out(session, c, None, organizer=True)


@admin_router.post("/{competition_id}/hide")
async def admin_hide(competition_id: int, actor: AdminActor, session: Session) -> dict:
    return await _hide(actor, competition_id, True, session)


@admin_router.post("/{competition_id}/restore")
async def admin_restore(competition_id: int, actor: AdminActor, session: Session) -> dict:
    return await _hide(actor, competition_id, False, session)


# --------------------------------------------------------------------------- the public site

@public_router.get("/highlights")
@shortcache.public("competition_highlights")
async def highlights(session: Session) -> dict:
    """«G'oliblar va top jamoalar» on the home page, only while an admin has it switched on. Students who have not
    given their consent are left out of the public list."""
    if not await svc.home_shown(session):
        return {"show": False, "winners": [], "teams": []}
    comps = (await session.execute(select(Competition).where(
        Competition.status == "results", Competition.hidden.is_(False), svc.organizer_live())
        .order_by(Competition.results_at.desc().nulls_last(), Competition.id.desc()).limit(6))).scalars().all()
    companies, unis = await _orgs(session, list(comps))
    winners = []
    for c in comps:
        entries = (await session.execute(select(CompetitionEntry).where(
            CompetitionEntry.competition_id == c.id, CompetitionEntry.place.isnot(None), CompetitionEntry.place <= 3)
            .order_by(CompetitionEntry.place, CompetitionEntry.id))).scalars().all()
        for e in entries:
            if e.team_id:
                team = await session.get(Team, e.team_id)
                name, kind = (team.name if team else None), "team"
            else:
                u = await session.get(User, e.user_id)
                name = u.full_name if u and u.consent_at and not u.is_blocked else None
                kind = "student"
            if name:
                winners.append({"competition_id": c.id, "title": c.title, "organizer": organizer_out(c, companies, unis)["name"],
                                "place": e.place, "name": name, "kind": kind})
    return {"show": True, "winners": winners, "teams": await svc.team_ranking(session, limit=5)}
