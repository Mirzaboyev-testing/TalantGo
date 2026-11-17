"""The student's portfolio (student panel v2, phase 2): projects and certificates the student adds, experience
(employment outcomes, which companies confirm) and work verified on the platform, with three trust levels:
- "platform": verified on Careerup (peer/mentor-checked tasks, accepted company tasks) — generated, not editable;
- "company": an experience entry a company confirmed (or a hire on the platform);
- "self": what the student declared — shown with an "o'zi kiritgan" label.

Images on the profile (photo, cover, project pictures) are served from /api/v1/media/{id}?s=<signature>: a stable,
cacheable link that only the people shown the profile receive (the signature cannot be guessed)."""
import hashlib
import hmac

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.security import _subkey
from ..models import (ChallengeEntry, EmploymentOutcome, PortfolioItem, Status, Submission, SubmissionFile, Task,
                      User)

IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
ATTACH_TYPES = IMAGE_TYPES | {"application/pdf"}
# work files with a company task: spreadsheets, documents, archives (opened by download, never inline)
WORK_TYPES = {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword",
              "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip",
              "text/csv", "text/plain", "application/x-ipynb+json", "application/json"}
WORK_EXTS = {".xlsx", ".xls", ".csv", ".docx", ".doc", ".pptx", ".ppt", ".zip", ".ipynb", ".txt", ".json", ".py", ".sql",
             ".r", ".pbix", ".twbx", ".fig", ".pdf", ".png", ".jpg", ".jpeg", ".webp"}
MAX_ITEMS = 30
MAX_ITEM_FILES = 6
MAX_KEPT = 80              # files one person can keep on the profile and task entries (uploads are capped too)
VERIFIED = (Status.peer_verified, Status.mentor_verified)


def media_sig(file_id: int) -> str:
    return hmac.new(_subkey("media"), str(file_id).encode(), hashlib.sha256).hexdigest()[:20]


def media_url(file_id: int | None) -> str | None:
    return f"/api/v1/media/{file_id}?s={media_sig(file_id)}" if file_id else None


async def claim(session: AsyncSession, user: User, file_ids: list[int], kinds: set[str], what: str,
                exts: set[str] | None = None) -> list[SubmissionFile]:
    """Files the person uploaded themselves, of an allowed type (or extension), kept on the profile from now on."""
    ids = list(dict.fromkeys(i for i in file_ids if i))
    if not ids:
        return []
    kept = await session.scalar(select(func.count()).select_from(SubmissionFile).where(
        SubmissionFile.user_id == user.id, SubmissionFile.kept.is_(True), SubmissionFile.id.notin_(ids)))
    if kept + len(ids) > MAX_KEPT:
        raise HTTPException(409, "Profilda fayllar juda ko'p: eskilarini o'chirib, keyin qo'shing")
    rows = (await session.execute(select(SubmissionFile).where(SubmissionFile.id.in_(ids)))).scalars().all()
    by_id = {r.id: r for r in rows}
    out = []
    for i in ids:
        row = by_id.get(i)
        if row is None or row.user_id != user.id or row.submission_id is not None:
            raise HTTPException(422, f"{what}: fayl topilmadi, qayta yuklang")
        ext = ("." + row.filename.rsplit(".", 1)[-1].lower()) if "." in row.filename else ""
        if row.mime not in kinds and not (exts and ext in exts):
            raise HTTPException(422, f"{what}: faqat " + ("PNG, JPG yoki WEBP rasm" if kinds == IMAGE_TYPES else "rasm yoki PDF"))
        row.kept = True
        out.append(row)
    return out


async def referenced(session: AsyncSession, file_id: int) -> bool:
    """Whether a profile photo or cover, a portfolio item or a task entry still uses the file."""
    for query in (select(User.id).where((User.avatar_file_id == file_id) | (User.cover_file_id == file_id)),
                  select(PortfolioItem.id).where((PortfolioItem.cover_file_id == file_id) | PortfolioItem.file_ids.contains([file_id])),
                  select(ChallengeEntry.id).where(ChallengeEntry.file_ids.contains([file_id]))):
        if await session.scalar(query.limit(1)) is not None:
            return True
    return False


async def release(session: AsyncSession, user: User, file_ids) -> None:
    """Files no longer used anywhere stop being kept: their /media links stop working (call after the change is flushed)."""
    for file_id in {i for i in file_ids if i}:
        row = await session.get(SubmissionFile, file_id)
        if row is not None and row.user_id == user.id and row.kept and not await referenced(session, file_id):
            row.kept = False


async def refresh_count(session: AsyncSession, user: User) -> None:
    """How many portfolio entries (projects, certificates, experience) the profile has: drives completeness."""
    items = await session.scalar(select(func.count()).select_from(PortfolioItem).where(PortfolioItem.user_id == user.id))
    jobs = await session.scalar(select(func.count()).select_from(EmploymentOutcome).where(EmploymentOutcome.student_id == user.id))
    user.portfolio_n = (items or 0) + (jobs or 0)


def experience_out(o: EmploymentOutcome) -> dict:
    trust = "company" if o.confirmed and o.confirmed_by == "company" else "university" if o.confirmed else "self"
    return {"id": o.id, "company": o.company_name, "company_id": o.company_id, "position": o.position, "kind": o.kind,
            "started_on": o.started_on, "ended_on": o.ended_on, "description": o.description, "source": o.source,
            "confirmed": o.confirmed, "confirmed_by": o.confirmed_by, "trust": trust}


def item_out(item: PortfolioItem, files: dict[int, SubmissionFile]) -> dict:
    attached = [files[i] for i in item.file_ids if i in files]
    return {"id": item.id, "kind": item.kind, "title": item.title, "org": item.org, "date_from": item.date_from,
            "date_to": item.date_to, "description": item.description, "link": item.link,
            "credential_id": item.credential_id, "skills": item.skills, "trust": "self",
            "cover_id": item.cover_file_id, "cover_url": media_url(item.cover_file_id),
            "files": [{"id": f.id, "name": f.filename, "mime": f.mime, "size": f.size, "url": media_url(f.id)} for f in attached]}


async def verified_work(session: AsyncSession, user_id: int) -> list[dict]:
    """Work verified on the platform: weekly tasks peers or a mentor approved, accepted company tasks and wins."""
    subs = (await session.execute(select(Submission).join(Task).where(
        Submission.user_id == user_id, Submission.status.in_(VERIFIED)).order_by(Submission.verified_at.desc()))).scalars().all()
    out = [{"key": f"t{s.id}", "kind": "task", "title": s.task.title, "by": s.task.track.title.split(":")[0],
            "level": s.status.value, "date": s.verified_at, "link": s.proof_url, "points": s.points_awarded,
            "place": None, "trust": "platform"} for s in subs]
    entries = (await session.execute(select(ChallengeEntry).where(
        ChallengeEntry.user_id == user_id, ChallengeEntry.status == "accepted")
        .order_by(ChallengeEntry.reviewed_at.desc()))).scalars().all()
    out += [{"key": f"c{e.id}", "kind": "company_task" if e.challenge.company_id else "challenge", "title": e.challenge.title,
             "by": e.challenge.company.name if e.challenge.company else (e.challenge.created_by.full_name if e.challenge.created_by else "Careerup"),
             "level": "company" if e.challenge.company_id else "mentor", "date": e.reviewed_at, "link": e.proof_url,
             "points": e.points_awarded, "place": e.place, "score": e.score, "trust": "platform"} for e in entries]
    return sorted(out, key=lambda x: (x["date"] is None, -(x["date"].timestamp() if x["date"] else 0)))


async def portfolio(session: AsyncSession, user: User) -> dict:
    items = (await session.execute(select(PortfolioItem).where(PortfolioItem.user_id == user.id)
                                   .order_by(PortfolioItem.date_from.desc().nulls_last(), PortfolioItem.id.desc()))).scalars().all()
    ids = {i for it in items for i in it.file_ids}
    files = {f.id: f for f in (await session.execute(select(SubmissionFile).where(SubmissionFile.id.in_(ids)))).scalars()} if ids else {}
    jobs = (await session.execute(select(EmploymentOutcome).where(EmploymentOutcome.student_id == user.id)
                                  .order_by(EmploymentOutcome.ended_on.desc().nulls_first(),
                                            EmploymentOutcome.started_on.desc().nulls_last()))).scalars().all()
    return {
        "projects": [item_out(i, files) for i in items if i.kind == "project"],
        "certificates": [item_out(i, files) for i in items if i.kind == "certificate"],
        "experience": [experience_out(o) for o in jobs],
        "verified": await verified_work(session, user.id),
    }
