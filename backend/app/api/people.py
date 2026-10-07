from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from datetime import UTC, datetime

from ..models import Company, Status, Submission, Track, University, User
from ..schemas import (CompanyIn, CompanyOut, LeaderboardOut, LeaderRow, MeOut, MeUpdate, PeerOut,
                       StaffRequestIn, TrackOut, UniversityOut)
from ..services import notify
from ..services.career import completeness
from ..services.cv import build_cv
from ..services.progress import current_streak, rank_of
from .deps import CurrentUser, Session

router = APIRouter(tags=["people"])


async def me_out(session: Session, user: User) -> MeOut:
    return MeOut(
        id=user.id, full_name=user.full_name, username=user.username, photo_url=user.photo_url,
        role=user.role, track=TrackOut.model_validate(user.track) if user.track else None,
        university=user.university, group_name=user.group_name, bio=user.bio, goals=user.goals,
        github_url=user.github_url, linkedin_url=user.linkedin_url, points=user.points,
        streak=current_streak(user), rank_overall=await rank_of(session, user),
        cv_slug=user.cv_slug, cv_public=user.cv_public, is_owner=user.is_owner,
        account_type=user.account_type, has_consent=user.consent_at is not None,
        university_ref=UniversityOut.model_validate(user.university_ref) if user.university_ref else None,
        faculty=user.faculty, course=user.course, graduation_year=user.graduation_year, gpa=user.gpa,
        gpa_scale=user.gpa_scale, student_number=user.student_number, skills=user.skills,
        languages=user.languages, job_types=user.job_types, city=user.city, open_to_work=user.open_to_work,
        verification=user.verification, verified_by=user.verified_by, verification_note=user.verification_note,
        company=CompanyOut.model_validate(user.company) if user.company else None,
        staff_university=UniversityOut.model_validate(user.staff_university) if user.staff_university else None,
        staff_status=user.staff_status, staff_position=user.staff_position,
        completeness=completeness(user))


# Changing any of these after verification means the old check no longer covers the profile.
IDENTITY_FIELDS = ("university_id", "faculty", "course", "student_number")


@router.get("/me", response_model=MeOut)
async def get_me(user: CurrentUser, session: Session) -> MeOut:
    return await me_out(session, user)


@router.patch("/me", response_model=MeOut)
async def update_me(body: MeUpdate, user: CurrentUser, session: Session) -> MeOut:
    changes = body.model_dump(exclude_unset=True)
    if changes.get("track_id") is not None:
        track = await session.get(Track, changes["track_id"])
        if track is None or not track.is_active:
            raise HTTPException(404, "Bunday yo'l yo'q")
    if changes.get("university_id") is not None:
        uni = await session.get(University, changes["university_id"])
        if uni is None or not uni.is_active:
            raise HTTPException(404, "Universitet topilmadi")
    for key in ("goals", "skills", "languages", "job_types"):
        if changes.get(key) is not None:
            changes[key] = list(dict.fromkeys(changes[key]))
    if changes.pop("consent", None):
        user.consent_at = user.consent_at or datetime.now(UTC)
    if (gpa := changes.get("gpa")) is not None and gpa > (changes.get("gpa_scale") or user.gpa_scale):
        raise HTTPException(422, "O'rtacha baho shkaladan katta bo'lishi mumkin emas")
    if user.verification in ("pending", "verified") and any(
            k in changes and changes[k] != getattr(user, k) for k in IDENTITY_FIELDS):
        user.verification, user.verified_by, user.verified_at = "none", "", None
    for field, value in changes.items():
        if value is not None or field == "track_id":     # only the path can be cleared
            setattr(user, field, value)
    await session.commit()
    await session.refresh(user)
    return await me_out(session, user)


@router.get("/me/cv")
async def my_cv(user: CurrentUser, session: Session) -> dict:
    return await build_cv(session, user)


@router.get("/cv/{slug}")
async def public_cv(slug: str, session: Session) -> dict:
    user = (await session.execute(select(User).where(User.cv_slug == slug))).scalar_one_or_none()
    if user is None or not user.cv_public:
        raise HTTPException(404, "CV topilmadi yoki yopiq")
    return await build_cv(session, user)


def _verified_count():
    return (select(func.count()).where(Submission.user_id == User.id,
                                       Submission.status.in_([Status.peer_verified, Status.mentor_verified]))
            .correlate(User).scalar_subquery())


@router.get("/peers", response_model=list[PeerOut])
async def peers(user: CurrentUser, session: Session,
                goal: str | None = Query(default=None, max_length=40),
                track_id: int | None = None) -> list[PeerOut]:
    """Students on the same path by default; a goal search looks across all paths."""
    verified = _verified_count().label("verified")
    query = select(User, verified).where(User.id != user.id, User.is_blocked.is_(False), User.account_type == "student")
    if goal:
        query = query.where(User.goals.contains([goal.strip()]))
    else:
        wanted = track_id or user.track_id
        if wanted is None:
            return []
        query = query.where(User.track_id == wanted)
    rows = (await session.execute(query.order_by(User.points.desc(), User.id).limit(100))).all()
    return [PeerOut(id=u.id, full_name=u.full_name, username=u.username, photo_url=u.photo_url,
                    track_title=u.track.title if u.track else None, group_name=u.group_name, goals=u.goals,
                    points=u.points, streak=current_streak(u), verified_tasks=n) for u, n in rows]


@router.get("/leaderboard", response_model=LeaderboardOut)
async def leaderboard(user: CurrentUser, session: Session,
                      scope: Literal["all", "track", "group"] = "all") -> LeaderboardOut:
    query = select(User).where(User.is_blocked.is_(False), User.account_type == "student")
    rank_query = select(func.count()).select_from(User).where(User.points > user.points, User.is_blocked.is_(False),
                                                              User.account_type == "student")
    if scope == "track":
        query = query.where(User.track_id == user.track_id)
        rank_query = rank_query.where(User.track_id == user.track_id)
    elif scope == "group":
        query = query.where(User.group_name == user.group_name)
        rank_query = rank_query.where(User.group_name == user.group_name)
    users = (await session.execute(query.order_by(User.points.desc(), User.id).limit(50))).scalars().all()
    rows, rank, previous = [], 0, None
    for position, u in enumerate(users, start=1):
        if u.points != previous:          # equal points share a rank
            rank, previous = position, u.points
        rows.append(LeaderRow(rank=rank, id=u.id, full_name=u.full_name, group_name=u.group_name,
                              track_icon=u.track.icon if u.track else "", points=u.points, is_me=u.id == user.id))
    return LeaderboardOut(rows=rows, my_rank=(await session.scalar(rank_query)) + 1)


# --------------------------------------------------------------------------- universities, verification, roles

@router.get("/universities", response_model=list[UniversityOut])
async def universities(session: Session) -> list[University]:
    return list((await session.execute(select(University).where(University.is_active)
                                       .order_by(University.city != "Toshkent", University.name))).scalars())


@router.post("/me/verification", response_model=MeOut)
async def request_verification(user: CurrentUser, session: Session) -> MeOut:
    """Asks the student's university (its career centre staff) or a CareerFlow admin to confirm
    that the student really studies there. Needs the university, faculty, course and student ID."""
    if user.verification == "verified":
        raise HTTPException(409, "Siz allaqachon tasdiqlangansiz")
    missing = [label for label, ok in (("universitet", user.university_id), ("fakultet", user.faculty),
                                       ("kurs", user.course), ("talaba ID (HEMIS)", user.student_number)) if not ok]
    if missing:
        raise HTTPException(422, "To'ldiring: " + ", ".join(missing))
    if user.consent_at is None:
        raise HTTPException(422, "Avval shaxsiy ma'lumotlarni qayta ishlashga rozilik bering")
    user.verification, user.verification_note = "pending", ""
    await session.commit()
    staff = (await session.execute(select(User.telegram_id).where(
        User.staff_university_id == user.university_id, User.staff_status == "approved"))).scalars().all()
    notify.send(list(staff), f"Yangi talaba tasdiqlashni kutmoqda: {user.full_name}, {user.faculty}, {user.course}-kurs.")
    await session.refresh(user)
    return await me_out(session, user)


@router.post("/me/company", response_model=MeOut, status_code=201)
async def register_company(body: CompanyIn, user: CurrentUser, session: Session) -> MeOut:
    """Turns the account into an employer account. The company is hidden until an admin checks it
    (for example its STIR on orginfo.uz)."""
    if user.company_id:
        raise HTTPException(409, "Siz allaqachon kompaniyaga bog'langansiz")
    if body.stir and await session.scalar(select(func.count()).select_from(Company).where(Company.stir == body.stir)):
        raise HTTPException(409, "Bu STIR bilan kompaniya ro'yxatdan o'tgan. Jamoaga qo'shilish uchun adminga yozing.")
    company = Company(**body.model_dump())
    session.add(company)
    await session.flush()
    user.company_id, user.account_type = company.id, "employer"
    user.consent_at = user.consent_at or datetime.now(UTC)
    await session.commit()
    await session.refresh(user)
    return await me_out(session, user)


@router.post("/me/staff-request", response_model=MeOut, status_code=201)
async def request_staff(body: StaffRequestIn, user: CurrentUser, session: Session) -> MeOut:
    """University career-centre staff ask for access to their university's dashboard."""
    if not await session.get(University, body.university_id):
        raise HTTPException(404, "Universitet topilmadi")
    user.account_type, user.staff_university_id = "university", body.university_id
    user.staff_position, user.staff_status = body.position, "pending"
    user.consent_at = user.consent_at or datetime.now(UTC)
    await session.commit()
    await session.refresh(user)
    return await me_out(session, user)


@router.post("/me/account-type/student", response_model=MeOut)
async def back_to_student(user: CurrentUser, session: Session) -> MeOut:
    """Leaves a pending employer or staff request and returns to the student experience."""
    user.account_type = "student"
    if user.staff_status != "approved":
        user.staff_university_id, user.staff_status = None, ""
    await session.commit()
    await session.refresh(user)
    return await me_out(session, user)
