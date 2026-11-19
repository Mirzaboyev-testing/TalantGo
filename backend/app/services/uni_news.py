"""University announcements as students, companies and the public see them (one place for who sees what).

- students: their own university's announcements on the "students" channel whose filters match them, and the
  university's public ones;
- companies: announcements on the "companies" channel of universities they are accepted partners of, and the
  public ones of any active university;
- the public page: only the "public" channel.
Photos are files the staff uploaded; they are shown through signed links, because an <img> cannot send a token.
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Company, Partnership, SubmissionFile, University, UniversityAnnouncement, User
from . import files

MAX_PHOTOS = 6


def university_logo_url(uni: University) -> str | None:
    """Public once the university is active; ?v= changes with the file, so a new logo is never stuck in a cache."""
    return f"/api/v1/public/universities/{uni.id}/logo?v={uni.logo_file_id}" if uni.logo_file_id else None


def clean_link(link: str) -> str:
    """A page inside the app (/talaba/vakansiyalar) or an https:// address (a registration form). A browser reads
    "//x", "/\\x" or a tab inside as another site, so those are refused."""
    link = link.strip()
    if not link:
        return ""
    if any(c == "\\" or ord(c) <= 32 for c in link):
        raise HTTPException(422, "Havolada bo'sh joy yoki \\ bo'lmasin")
    if link.startswith("/") and not link.startswith("//"):
        return link
    if link.lower().startswith("https://") and len(link) > len("https://") + 3:
        return link
    raise HTTPException(422, "Havola ilova ichidagi sahifa (/vakansiyalar) yoki https:// bilan boshlansin")


async def check_photos(session: AsyncSession, user_id: int, ids: list[int]) -> list[int]:
    """Images the staff member uploaded themselves (PNG, JPG, WEBP), at most six, in the order given."""
    ids = list(dict.fromkeys(ids))
    if len(ids) > MAX_PHOTOS:
        raise HTTPException(422, f"Ko'pi bilan {MAX_PHOTOS} ta rasm")
    return [await files.company_file(session, user_id, i, files.LOGO_TYPES, "Rasm") for i in ids]


async def photos_by_id(session: AsyncSession, rows: list[UniversityAnnouncement]) -> dict[int, dict]:
    ids = {i for a in rows for i in (a.photo_ids or [])}
    if not ids:
        return {}
    found = (await session.execute(select(SubmissionFile).where(SubmissionFile.id.in_(ids)))).scalars()
    return {f.id: files.file_out(f) for f in found}


def item_out(a: UniversityAnnouncement, photos: dict[int, dict], uni: University | None = None) -> dict:
    """An announcement as a reader sees it (no filters, counts or author)."""
    u = uni or a.university
    return {"id": a.id, "title": a.title, "text": a.text, "link": a.link, "category": a.category,
            "photos": [photos[i] for i in (a.photo_ids or []) if i in photos], "created_at": a.created_at,
            "university": {"id": u.id, "name": u.name, "short_name": u.short_name, "logo_url": university_logo_url(u)} if u else None}


def _published():
    return select(UniversityAnnouncement).where(UniversityAnnouncement.status == "published")


async def student_items(session: AsyncSession, user: User, matches, limit: int = 8) -> list[dict]:
    """`matches(audience_dict, user)` decides the faculty/course filters (uni_comms.Audience)."""
    if not user.university_id:
        return []
    rows = (await session.execute(_published().where(UniversityAnnouncement.university_id == user.university_id)
                                  .order_by(UniversityAnnouncement.created_at.desc()).limit(40))).scalars().all()
    mine = [a for a in rows if ("students" in a.channels and matches(a.audience, user)) or "public" in a.channels][:limit]
    photos = await photos_by_id(session, mine)
    return [item_out(a, photos) for a in mine]


async def partner_university_ids(session: AsyncSession, company_id: int) -> set[int]:
    return set((await session.execute(select(Partnership.university_id).where(
        Partnership.company_id == company_id, Partnership.status == "accepted"))).scalars())


async def partner_company_ids(session: AsyncSession, university_id: int) -> list[int]:
    return list((await session.execute(select(Partnership.company_id).join(Company, Company.id == Partnership.company_id).where(
        Partnership.university_id == university_id, Partnership.status == "accepted", Company.status == "approved"))).scalars())


async def company_items(session: AsyncSession, company_id: int, university_id: int | None = None, limit: int = 30) -> list[dict]:
    partners = await partner_university_ids(session, company_id)
    query = (_published().join(University, University.id == UniversityAnnouncement.university_id)
             .where(University.is_active.is_(True)))
    if university_id is not None:
        query = query.where(UniversityAnnouncement.university_id == university_id)
    seen = UniversityAnnouncement.channels.contains(["public"])
    if partners:
        seen = seen | (UniversityAnnouncement.channels.contains(["companies"]) & UniversityAnnouncement.university_id.in_(partners))
    rows = (await session.execute(query.where(seen).order_by(UniversityAnnouncement.created_at.desc()).limit(limit))).scalars().all()
    photos = await photos_by_id(session, rows)
    return [{**item_out(a, photos), "partner": a.university_id in partners} for a in rows]


async def public_items(session: AsyncSession, uni: University, limit: int = 6) -> list[dict]:
    rows = (await session.execute(_published().where(UniversityAnnouncement.university_id == uni.id,
                                                     UniversityAnnouncement.channels.contains(["public"]))
                                  .order_by(UniversityAnnouncement.created_at.desc()).limit(limit))).scalars().all()
    photos = await photos_by_id(session, rows)
    return [item_out(a, photos, uni) for a in rows]
