"""Competitions ("Musobaqalar"), teams ("Jamoalar") and rankings: the rules, the live leaderboard, final places and
points, test statistics (docs/13-musobaqalar.md; the API contract is its section 6, the routes are in
api/competitions.py).

Decisions (2026-11-20): persistent teams (season points, teammates can be replaced) and one-time teams (made for one
competition); a student is in at most MAX_PERSISTENT persistent teams and in one team per competition; joining is
instant with a 6-character code; teams may mix universities; leaderboards are live with names; companies,
universities and admins create competitions without pre-approval (an admin can hide one); place points (50/30/20 by
default) go to the individual or to every member credited on the team's last submission; persistent teams collect
the same points as season points; test statistics are anonymous.

Ranking (live and final): stage reached ↓, the score of the current stage (or of the stage the entry stopped in) ↓,
total score ↓; equal keys share a rank. Final places are the same order over entries that sent at least one work.
"""
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import and_, false, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..models import (AppConfig, Company, Competition, CompetitionEntry, CompetitionStage, StageSubmission, Team,
                      TeamMembership, TestAttempt, University, User)
from . import inbox
from .feed import study_line

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"      # no 0/O and 1/I: read aloud or typed from a phone
CODE_LEN = 6
MAX_PERSISTENT = 2               # persistent teams one student may be in
PERSISTENT_SIZE = 5
HOME_KEY = "competitions_home"   # AppConfig: {"show": bool}, the «G'oliblar va top jamoalar» block on the site
COMP_LINK = "/talaba/topshiriqlar/musobaqalar?id={id}"
TEAM_LINK = "/talaba/topshiriqlar/jamoa?id={id}"
JOIN_LINK = "/talaba/topshiriqlar/jamoa?kod={code}"


def now() -> datetime:
    return datetime.now(UTC)


def aware(dt: datetime) -> datetime:
    """Times without a zone are read as UTC (the contract sends ISO UTC)."""
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


# --------------------------------------------------------------------------- phases and audience

def stage_phase(s: CompetitionStage, t: datetime) -> str:
    if s.closed_at is not None:
        return "closed"
    if t < s.starts_at:
        return "upcoming"
    return "open" if t <= s.ends_at else "reviewing"


def stage_open(s: CompetitionStage, t: datetime) -> bool:
    return stage_phase(s, t) == "open"


def competition_phase(c: Competition, t: datetime) -> str:
    if c.status in ("results", "archived"):
        return "finished"
    if c.status == "draft":
        return "upcoming"
    if t < c.starts_at:
        return "registration" if t <= c.registration_ends_at else "upcoming"
    return "running" if t <= c.ends_at else "reviewing"


def registration_open(c: Competition, t: datetime) -> bool:
    return c.status == "published" and t <= c.registration_ends_at


def current_stage(c: Competition, t: datetime) -> CompetitionStage:
    """The latest stage that has started (the first one before anything started)."""
    started = [s for s in c.stages if s.starts_at <= t]
    return started[-1] if started else c.stages[0]


def in_audience(c: Competition, u: User) -> bool:
    if c.audience == "all":
        return True
    if c.audience == "fields":
        return bool(set(c.job_fields or []) & set(u.job_fields or []))
    return c.university_id is not None and c.university_id == u.university_id


def audience_clause(u: User):
    same_uni = Competition.university_id == u.university_id if u.university_id else false()
    return or_(Competition.audience == "all",
               and_(Competition.audience == "fields", Competition.job_fields.overlap(u.job_fields or [])),
               and_(Competition.audience == "university", same_uni))


def organizer_live():
    """A company's competitions show while the company is approved, a university's while it is active."""
    return or_(Competition.organizer_kind == "platform",
               and_(Competition.organizer_kind == "company", Competition.company.has(Company.status == "approved")),
               and_(Competition.organizer_kind == "university",
                    Competition.university.has(University.is_active.is_(True))))


def my_team_ids(user_id: int):
    return select(TeamMembership.team_id).where(TeamMembership.user_id == user_id, TeamMembership.left_at.is_(None))


def mine_clause(user_id: int):
    """Entries of this person: their own (individual) or of a team they are an active member of."""
    return or_(CompetitionEntry.user_id == user_id, CompetitionEntry.team_id.in_(my_team_ids(user_id)))


def visible(user: User):
    """Competitions a signed-in person may open: published or with results, not hidden by an admin, of a live
    organizer; a student also only those for their audience (or ones they are already in)."""
    conditions = [Competition.hidden.is_(False), Competition.status.in_(("published", "results")), organizer_live()]
    if user.account_type == "student":
        mine = select(CompetitionEntry.competition_id).where(mine_clause(user.id))
        conditions.append(or_(audience_clause(user), Competition.id.in_(mine)))
    return select(Competition).where(*conditions)


def require_student(user: User) -> None:
    if user.account_type != "student":
        raise HTTPException(403, "Musobaqa va jamoalar talabalar uchun")


# --------------------------------------------------------------------------- teams

async def new_code(session: AsyncSession) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))
        if await session.scalar(select(Team.id).where(Team.invite_code == code)) is None:
            return code
    raise HTTPException(503, "Kod yaratib bo'lmadi, qayta urinib ko'ring")


def clean_code(code: str) -> str | None:
    code = (code or "").strip().upper()
    return code if len(code) == CODE_LEN and all(ch in CODE_ALPHABET for ch in code) else None


def invite_url(code: str) -> str:
    return settings.public_url.rstrip("/") + JOIN_LINK.format(code=code)


async def active_memberships(session: AsyncSession, team_ids) -> dict[int, list[TeamMembership]]:
    ids = list({i for i in team_ids if i})
    out: dict[int, list[TeamMembership]] = {i: [] for i in ids}
    if not ids:
        return out
    rows = (await session.execute(select(TeamMembership).where(
        TeamMembership.team_id.in_(ids), TeamMembership.left_at.is_(None))
        .order_by((TeamMembership.role == "captain").desc(), TeamMembership.joined_at, TeamMembership.id))).scalars()
    for m in rows:
        out[m.team_id].append(m)
    return out


async def member_ids(session: AsyncSession, team_id: int) -> list[int]:
    return [m.user_id for m in (await active_memberships(session, [team_id]))[team_id]]


async def membership(session: AsyncSession, team_id: int, user_id: int) -> TeamMembership | None:
    return (await session.execute(select(TeamMembership).where(
        TeamMembership.team_id == team_id, TeamMembership.user_id == user_id,
        TeamMembership.left_at.is_(None)))).scalar_one_or_none()


async def persistent_count(session: AsyncSession, user_id: int) -> int:
    return await session.scalar(select(func.count()).select_from(TeamMembership).join(Team, Team.id == TeamMembership.team_id)
                                .where(TeamMembership.user_id == user_id, TeamMembership.left_at.is_(None),
                                       Team.kind == "persistent", Team.archived_at.is_(None))) or 0


async def lock_user(session: AsyncSession, user_id: int) -> None:
    """Serialises one person's team changes (two quick taps must not pass the limits twice)."""
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())


async def lock_team(session: AsyncSession, team_id: int) -> Team | None:
    return (await session.execute(select(Team).where(Team.id == team_id).with_for_update())).scalar_one_or_none()


async def taken(session: AsyncSession, competition_id: int, user_ids: list[int], except_team: int | None = None) -> list[int]:
    """Who among these people already takes part in this competition: their own entry, or an active membership in
    another team entered in it (withdrawn entries do not count)."""
    if not user_ids:
        return []
    own = select(CompetitionEntry.user_id).where(CompetitionEntry.competition_id == competition_id,
                                                 CompetitionEntry.status != "withdrawn",
                                                 CompetitionEntry.user_id.in_(user_ids))
    in_team = (select(TeamMembership.user_id).join(CompetitionEntry, CompetitionEntry.team_id == TeamMembership.team_id)
               .where(CompetitionEntry.competition_id == competition_id, CompetitionEntry.status != "withdrawn",
                      TeamMembership.left_at.is_(None), TeamMembership.user_id.in_(user_ids)))
    if except_team is not None:
        in_team = in_team.where(CompetitionEntry.team_id != except_team)
    return sorted(set((await session.execute(own)).scalars()) | set((await session.execute(in_team)).scalars()))


async def other_one_time_team(session: AsyncSession, competition_id: int, user_id: int, except_team: int | None = None) -> Team | None:
    """A live one-time team for this competition the person is already in."""
    query = (select(Team).join(TeamMembership, TeamMembership.team_id == Team.id).where(
        Team.kind == "one_time", Team.competition_id == competition_id, Team.archived_at.is_(None),
        TeamMembership.user_id == user_id, TeamMembership.left_at.is_(None)))
    if except_team is not None:
        query = query.where(Team.id != except_team)
    return (await session.execute(query.limit(1))).scalar_one_or_none()


async def names(session: AsyncSession, user_ids) -> dict[int, str]:
    ids = {i for i in user_ids if i}
    if not ids:
        return {}
    return dict((await session.execute(select(User.id, User.full_name).where(User.id.in_(ids)))).all())


async def check_join(session: AsyncSession, team: Team, user: User, size_now: int) -> None:
    """Joining refused (409) when the team is full, when it would break a running competition (another team of the
    joiner is in it, it is limited to one university, or its team size would be exceeded) or the persistent limit."""
    if size_now >= team.size_max:
        raise HTTPException(409, f"Jamoa to'lgan: ko'pi bilan {team.size_max} kishi")
    if team.kind == "persistent" and await persistent_count(session, user.id) >= MAX_PERSISTENT:
        raise HTTPException(409, f"Siz allaqachon {MAX_PERSISTENT} ta doimiy jamoadasiz: avval biridan chiqing")
    if team.kind == "one_time" and team.competition_id:
        c = await session.get(Competition, team.competition_id)
        if c is not None and c.status == "published":
            if await other_one_time_team(session, c.id, user.id, except_team=team.id) or \
                    await taken(session, c.id, [user.id], except_team=team.id):
                raise HTTPException(409, f"Siz «{c.title}» musobaqasida boshqa jamoadasiz")
            if not in_audience(c, user):
                raise HTTPException(409, f"«{c.title}» musobaqasi sizning auditoriyangiz uchun emas")
    running = (await session.execute(select(Competition).join(CompetitionEntry, CompetitionEntry.competition_id == Competition.id)
                                     .where(CompetitionEntry.team_id == team.id, CompetitionEntry.status == "registered",
                                            Competition.status == "published"))).scalars().all()
    for c in running:
        if await taken(session, c.id, [user.id], except_team=team.id):
            raise HTTPException(409, f"Siz «{c.title}» musobaqasida boshqa jamoa bilan qatnashyapsiz")
        if c.audience == "university" and user.university_id != c.university_id:
            raise HTTPException(409, f"«{c.title}» faqat bitta universitet talabalari uchun")
        if size_now + 1 > c.team_max:
            raise HTTPException(409, f"«{c.title}» musobaqasida jamoada ko'pi bilan {c.team_max} kishi bo'ladi")


async def withdraw_team_entries(session: AsyncSession, team_id: int) -> None:
    """An archived team leaves the competitions it is still registered in."""
    running = select(Competition.id).where(Competition.status == "published")
    await session.execute(update(CompetitionEntry).where(
        CompetitionEntry.team_id == team_id, CompetitionEntry.status == "registered",
        CompetitionEntry.competition_id.in_(running)).values(status="withdrawn"))


# --------------------------------------------------------------------------- entries, the leaderboard and places

@dataclass
class Board:
    """Everything one competition's standings need, loaded in a fixed number of queries."""
    competition: Competition
    entries: list[CompetitionEntry]
    subs: dict[int, dict[int, StageSubmission]]                 # entry id → stage id → submission
    members: dict[int, list[TeamMembership]]                     # team id → active memberships
    teams: dict[int, Team]
    users: dict[int, User]
    rows: list[dict] = field(default_factory=list)


async def load_board(session: AsyncSession, c: Competition) -> Board:
    entries = (await session.execute(select(CompetitionEntry).where(
        CompetitionEntry.competition_id == c.id, CompetitionEntry.status != "withdrawn")
        .order_by(CompetitionEntry.created_at, CompetitionEntry.id))).scalars().all()
    subs: dict[int, dict[int, StageSubmission]] = {e.id: {} for e in entries}
    if entries:
        for s in (await session.execute(select(StageSubmission).where(
                StageSubmission.entry_id.in_([e.id for e in entries])))).scalars():
            subs[s.entry_id][s.stage_id] = s
    team_ids = [e.team_id for e in entries if e.team_id]
    members = await active_memberships(session, team_ids)
    teams = {t.id: t for t in (await session.execute(select(Team).where(Team.id.in_(team_ids))))
             .scalars()} if team_ids else {}
    user_ids = {e.user_id for e in entries if e.user_id} | {m.user_id for ms in members.values() for m in ms}
    users = {u.id: u for u in (await session.execute(select(User).where(User.id.in_(user_ids)))).scalars()} if user_ids else {}
    return Board(c, list(entries), subs, members, teams, users)


def score_at(board: Board, e: CompetitionEntry, position: int) -> int | None:
    stage = next((s for s in board.competition.stages if s.position == position), None)
    sub = board.subs.get(e.id, {}).get(stage.id) if stage else None
    return sub.score if sub else None


def _neg(v: int | None) -> int:
    return -(v if v is not None else -1)


def standing_key(board: Board, e: CompetitionEntry, current_position: int) -> tuple:
    """Stage reached ↓, the score of the current stage (or the stage the entry stopped in) ↓, total score ↓."""
    return (-e.stage_reached, _neg(score_at(board, e, min(e.stage_reached, current_position))), _neg(e.total_score))


def _ranked(items: list, key) -> list[tuple[int, object]]:
    """(rank, item) best first; equal keys share a rank (1, 1, 3)."""
    ordered = sorted(items, key=key)
    out, rank, previous = [], 0, object()
    for position, item in enumerate(ordered, start=1):
        k = key(item)
        if k != previous:
            rank, previous = position, k
        out.append((rank, item))
    return out


def entry_people(board: Board, e: CompetitionEntry) -> list[int]:
    if e.user_id:
        return [e.user_id]
    return [m.user_id for m in board.members.get(e.team_id, [])]


def leaderboard(board: Board, viewer_id: int | None, stage: CompetitionStage | None, t: datetime) -> dict:
    c = board.competition
    if stage is not None:
        pool = [e for e in board.entries if e.stage_reached >= stage.position]
        score_of = {e.id: score_at(board, e, stage.position) for e in pool}
        ranked = _ranked(pool, lambda e: (_neg(score_of[e.id]), _neg(e.total_score)))
        shown = stage
    else:
        shown = c.stages[-1] if c.status == "results" else current_stage(c, t)
        score_of = {e.id: score_at(board, e, min(e.stage_reached, shown.position)) for e in board.entries}
        ranked = _ranked(board.entries, lambda e: standing_key(board, e, shown.position))
    rows, my_rank = [], None
    for rank, e in ranked:
        people = entry_people(board, e)
        me = viewer_id is not None and viewer_id in people
        if e.team_id:
            team = board.teams.get(e.team_id)
            unis = sorted({u.university_ref.short_name for u in (board.users.get(i) for i in people)
                           if u and u.university_ref})
            name, photo = (team.name if team else ""), None
            subtitle = " · ".join(x for x in [f"{len(people)} kishi", ", ".join(unis)] if x)
        else:
            u = board.users.get(e.user_id)
            name, photo, subtitle = (u.full_name, u.photo_url, study_line(u)) if u else ("", None, "")
        score = score_of[e.id]
        rows.append({"rank": rank, "entry_id": e.id, "name": name, "subtitle": subtitle, "photo_url": photo,
                     "team_id": e.team_id, "members": [board.users[i].full_name for i in people if i in board.users],
                     "score": score, "percent": score, "stage_reached": e.stage_reached, "status": e.status,
                     "place": e.place, "is_me": me})
        if me:
            my_rank = rank
    scores = [r["score"] for r in rows if r["score"] is not None]
    return {"rows": rows, "total": len(rows), "my_rank": my_rank,
            "my_percentile": percentile(my_rank, len(rows)) if my_rank else None,
            "average_percent": round(sum(scores) / len(scores), 1) if scores else None,
            "stage_id": shown.id}


def percentile(rank: int, of: int) -> int:
    """«Eng yaxshi X%»: the share of participants at or above this rank (5th of 48 → 10)."""
    return max(1, min(100, round(100 * rank / of))) if of else 100


async def recompute_total(session: AsyncSession, entry: CompetitionEntry) -> None:
    total = await session.scalar(select(func.sum(StageSubmission.score)).where(StageSubmission.entry_id == entry.id))
    entry.total_score = int(total) if total is not None else None


async def add_points(session: AsyncSession, user_ids, delta: int) -> None:
    """The same SQL as challenges._set_award and progress._add_points: never below zero, safe under concurrency."""
    ids = list({i for i in user_ids if i})
    if delta and ids:
        await session.execute(update(User).where(User.id.in_(ids)).values(points=func.greatest(User.points + delta, 0)))


def credited(board: Board, e: CompetitionEntry) -> list[int]:
    """Who gets the place points: the individual, or the members recorded on the team's last submission
    (the active members when the team sent nothing)."""
    if e.user_id:
        return [e.user_id]
    positions = {s.id: s.position for s in board.competition.stages}
    subs = sorted(board.subs.get(e.id, {}).values(), key=lambda s: positions.get(s.stage_id, 0))
    if subs and subs[-1].members:
        return list(dict.fromkeys(subs[-1].members))
    return entry_people(board, e)


async def finalize(session: AsyncSession, c: Competition, t: datetime) -> list[tuple[CompetitionEntry, list[int]]]:
    """Final places and points (the caller commits): places by the standing order over entries that sent at least one
    work, place_points[place-1] to each credited person, the same to a persistent team's season points and a win
    for first place. Returns (entry, credited people) for every non-withdrawn entry."""
    board = await load_board(session, c)
    last = c.stages[-1].position
    worked = [e for e in board.entries if board.subs.get(e.id)]
    out = []
    for rank, e in _ranked(worked, lambda e: standing_key(board, e, last)):
        e.place = rank
    for e in board.entries:
        people = credited(board, e)
        if e.status == "registered":
            e.status = "finished"
        points = c.place_points[e.place - 1] if e.place and e.place <= len(c.place_points or []) else 0
        if points and not e.points_awarded:
            await add_points(session, people, points)
            e.points_awarded = points
            team = board.teams.get(e.team_id) if e.team_id else None
            if team is not None and team.kind == "persistent":
                team.points += points
        if e.place == 1 and e.team_id:
            team = board.teams.get(e.team_id)
            if team is not None and team.kind == "persistent":
                team.wins += 1
        out.append((e, people))
    c.status, c.results_at = "results", t
    return out


# --------------------------------------------------------------------------- test statistics (anonymous)

async def test_stats(session: AsyncSession, test_id: int, user_id: int) -> dict:
    mine = (await session.execute(select(TestAttempt).where(
        TestAttempt.test_id == test_id, TestAttempt.user_id == user_id, TestAttempt.status == "graded"))).scalar_one_or_none()
    if mine is None or not mine.max_score:
        raise HTTPException(404, "Natija hali baholanmagan")
    rows = (await session.execute(select(TestAttempt.score, TestAttempt.max_score).where(
        TestAttempt.test_id == test_id, TestAttempt.status == "graded", TestAttempt.max_score > 0))).all()
    percents = [100 * score / top for score, top in rows]
    my = 100 * mine.score / mine.max_score
    rank = 1 + sum(1 for p in percents if p > my + 1e-9)
    distribution = [0] * 10
    for p in percents:
        distribution[min(max(int(p // 10), 0), 9)] += 1
    return {"my_score": mine.score, "max_score": mine.max_score, "percent": round(my, 1), "rank": rank,
            "of": len(percents), "percentile": percentile(rank, len(percents)),
            "average_percent": round(sum(percents) / len(percents), 1), "best_percent": round(max(percents), 1),
            "distribution": distribution}


# --------------------------------------------------------------------------- team ranking and the site's block

async def team_ranking(session: AsyncSession, university_id: int | None = None, limit: int = 100) -> list[dict]:
    """Persistent teams by season points (wins break ties); a university filter keeps teams with a member there."""
    query = select(Team).where(Team.kind == "persistent", Team.archived_at.is_(None))
    if university_id:
        query = query.where(Team.id.in_(select(TeamMembership.team_id).join(User, User.id == TeamMembership.user_id)
                                        .where(TeamMembership.left_at.is_(None), User.university_id == university_id)))
    teams = (await session.execute(query.order_by(Team.points.desc(), Team.wins.desc(), Team.created_at, Team.id)
                                   .limit(limit))).scalars().all()
    if not teams:
        return []
    ids = [t.id for t in teams]
    members = await active_memberships(session, ids)
    unis: dict[int, set[str]] = {i: set() for i in ids}
    for team_id, short in (await session.execute(
            select(TeamMembership.team_id, University.short_name).join(User, User.id == TeamMembership.user_id)
            .join(University, University.id == User.university_id)
            .where(TeamMembership.team_id.in_(ids), TeamMembership.left_at.is_(None)))).all():
        unis[team_id].add(short)
    counts = await competitions_count(session, ids)
    return [{"rank": rank, "team_id": t.id, "name": t.name, "members_n": len(members[t.id]), "points": t.points,
             "competitions_n": counts.get(t.id, 0), "wins": t.wins, "universities": sorted(unis[t.id])}
            for rank, t in _ranked(teams, lambda t: (-t.points, -t.wins))]


async def competitions_count(session: AsyncSession, team_ids: list[int]) -> dict[int, int]:
    if not team_ids:
        return {}
    return dict((await session.execute(select(CompetitionEntry.team_id, func.count()).where(
        CompetitionEntry.team_id.in_(team_ids), CompetitionEntry.status != "withdrawn")
        .group_by(CompetitionEntry.team_id))).all())


async def home_shown(session: AsyncSession) -> bool:
    row = await session.get(AppConfig, HOME_KEY)
    return bool(row and (row.value or {}).get("show"))


async def set_home(session: AsyncSession, show: bool) -> None:
    row = await session.get(AppConfig, HOME_KEY)
    if row:
        row.value = {"show": show}
    else:
        session.add(AppConfig(key=HOME_KEY, value={"show": show}))


# --------------------------------------------------------------------------- notices

async def notify_people(session: AsyncSession, user_ids, kind: str, text: str, competition_id: int, params: dict) -> None:
    await inbox.push(session, user_ids, kind, text, link=COMP_LINK.format(id=competition_id), params=params)


async def audience_ids(session: AsyncSession, c: Competition) -> list[int]:
    query = select(User.id).where(User.account_type == "student", User.is_blocked.is_(False))
    if c.audience == "fields":
        query = query.where(User.job_fields.overlap(c.job_fields or []))
    elif c.audience == "university":
        query = query.where(User.university_id == c.university_id) if c.university_id else query.where(false())
    return list((await session.execute(query)).scalars())


async def university_staff_ids(session: AsyncSession, university_id: int | None) -> list[int]:
    if not university_id:
        return []
    return list((await session.execute(select(User.id).where(
        User.account_type == "university", User.staff_university_id == university_id, User.staff_status == "approved",
        User.is_blocked.is_(False)))).scalars())
