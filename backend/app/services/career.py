"""Student career profile: completeness, the anonymous card employers see, and verification."""
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Status, Submission, User
from . import notify

VERIFIED_WORK = (Status.peer_verified, Status.mentor_verified)

JOB_KIND_LABEL = {"internship": "Amaliyot", "part_time": "Yarim stavka", "junior": "Junior", "project": "Loyiha"}
WORK_MODE_LABEL = {"office": "Ofisda", "remote": "Masofaviy", "hybrid": "Aralash"}


def completeness(user: User) -> dict:
    """What is still missing before employers can find the student. Drives the profile checklist."""
    checks = {
        "university": user.university_id is not None,
        "faculty": bool(user.faculty),
        "course": user.course is not None,
        "track": user.track_id is not None,
        "skills": len(user.skills) >= 3,
        "languages": bool(user.languages),
        "job_types": bool(user.job_types),
        "verification": user.verification in ("pending", "verified"),
    }
    return {"percent": round(100 * sum(checks.values()) / len(checks)), "missing": [k for k, ok in checks.items() if not ok]}


def anonymous_code(user: User) -> str:
    return f"T-{user.id:05d}"


async def verified_work_count(session: AsyncSession, user_id: int) -> int:
    return await session.scalar(select(func.count()).where(Submission.user_id == user_id,
                                                           Submission.status.in_(VERIFIED_WORK)))


def anonymous_card(user: User, verified_tasks: int) -> dict:
    """Everything an employer may see before the student agrees to share their identity:
    skills and verified results, never name, photo, username or student number."""
    return {
        "id": user.id,
        "code": anonymous_code(user),
        "university": user.university_ref.short_name if user.university_ref else None,
        "university_name": user.university_ref.name if user.university_ref else None,
        "faculty": user.faculty,
        "course": user.course,
        "graduation_year": user.graduation_year,
        "gpa": user.gpa,
        "gpa_scale": user.gpa_scale,
        "track": user.track.title if user.track else None,
        "track_icon": user.track.icon if user.track else "",
        "skills": user.skills,
        "languages": user.languages,
        "job_types": user.job_types,
        "city": user.city,
        "points": user.points,
        "verified_tasks": verified_tasks,
        "verification": user.verification,
        "verified_by": user.verified_by if user.verification == "verified" else "",
    }


def identity(user: User) -> dict:
    """Shared only after the student applied to the company or accepted its contact request."""
    from ..core.config import settings
    return {
        "full_name": user.full_name,
        "username": user.username,
        "photo_url": user.photo_url,
        "cv_url": f"{settings.public_url}/cv/{user.cv_slug}" if user.cv_public else None,
        "github_url": user.github_url,
        "linkedin_url": user.linkedin_url,
    }


async def decide_verification(session: AsyncSession, student: User, approve: bool, verifier: str, note: str) -> User:
    if student.verification != "pending":
        raise HTTPException(409, "Bu talaba tasdiqlash navbatida emas")
    student.verification = "verified" if approve else "rejected"
    student.verified_by = verifier if approve else ""
    student.verified_at = datetime.now(UTC) if approve else None
    student.verification_note = note
    await session.commit()
    reason = note or "ko'rsatilmagan"
    notify.send([student.telegram_id],
                f"✅ Talabaligingiz tasdiqlandi ({verifier}). Endi ish beruvchilar sizni ishonchli nomzod sifatida ko'radi."
                if approve else
                f"Talabalik ma'lumotlaringiz tasdiqlanmadi. Sabab: {reason}. Profilda tuzatib, qayta yuboring.")
    return student
