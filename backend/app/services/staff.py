"""University staff: the access request, the team of a university and who decides on whom.

The first person of a university is checked by the app owner (a phone call to the university). That person
becomes the university's lead and decides on colleagues who ask later; the owner still sees every request
and can decide or revoke. Staff can verify students, so access is never granted automatically.
"""
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import ratelimit
from ..models import Role, SubmissionFile, University, User
from . import files, inbox, notify

# what the university is ready to do on the platform (asked in the request, shown on its profile)
COOPERATION = ("invite_students", "verify_students", "ambassadors", "introduce_companies", "dual", "venue",
               "job_fair", "hackathon", "announce")
POSITIONS = ("career_head", "career_staff", "vice_rector", "dean_deputy")      # anything else is typed by hand
OPEN_STATES = ("pending", "needs_info")


def _clean(text: str | None) -> str:
    return " ".join((text or "").split())


async def leads(session: AsyncSession, university_id: int, exclude: int | None = None) -> list[User]:
    query = select(User).where(User.staff_university_id == university_id, User.staff_status == "approved",
                               User.staff_role == "lead", User.is_blocked.is_(False))
    if exclude:
        query = query.where(User.id != exclude)
    return list((await session.execute(query.order_by(User.id))).scalars())


async def _file(session: AsyncSession, file_id: int | None) -> dict | None:
    row = await session.get(SubmissionFile, file_id) if file_id else None
    return files.file_out(row) if row else None


async def _details(session: AsyncSession, user: User) -> dict:
    extra = user.staff_extra or {}
    uni_id = user.staff_university_id
    return {
        "department": user.staff_department, "work_email": user.staff_work_email,
        "doc": await _file(session, user.staff_doc_id), "cooperation": extra.get("cooperation", []),
        "website": extra.get("website", ""), "telegram": extra.get("telegram", ""), "social": extra.get("social", ""),
        "show_as_partner": bool(extra.get("show_as_partner")), "mou": await _file(session, extra.get("mou_id")),
        "review_note": user.staff_review_note, "reviewed_by": user.staff_reviewed_by,
        "submitted_at": user.staff_submitted_at, "reviewed_at": user.staff_reviewed_at,
        "leads": [u.full_name for u in await leads(session, uni_id, exclude=user.id)] if uni_id else [],
    }


async def info(session: AsyncSession, user: User) -> dict:
    """What the person sees about their own request (and their role once approved)."""
    uni = user.staff_university
    students = verified = 0
    if uni is not None:
        students, verified = (await session.execute(select(
            func.count(), func.count().filter(User.verification == "verified")).where(
            User.university_id == uni.id, User.account_type == "student", User.is_blocked.is_(False)))).one()
    details = await _details(session, user)
    return {
        "role": user.staff_role, **details,
        "decided_by_lead": bool(details["leads"]) and user.staff_status in OPEN_STATES,
        "university_active": bool(uni and uni.is_active), "university_students": students,
        "university_verified": verified,
    }


async def _university(session: AsyncSession, user: User, university_id: int | None, name: str | None,
                      region: str) -> University:
    if university_id:
        uni = await session.get(University, university_id)
        # an inactive university is allowed only when this person proposed it and is sending the request again
        if uni is None or (not uni.is_active and user.staff_university_id != uni.id):
            raise HTTPException(404, "Universitet topilmadi")
        return uni
    name = _clean(name)
    existing = (await session.execute(select(University).where(func.lower(University.name) == name.lower()))).scalar_one_or_none()
    if existing:
        if not existing.is_active and user.staff_university_id != existing.id:
            raise HTTPException(409, "Bu universitet tekshiruvda yoki ro'yxatdan olingan. Administratorga yozing.")
        return existing
    ratelimit.limit(f"university-create:{user.id}", 3, 24 * 3600, "Bir kunda 3 tadan ortiq yangi universitet qo'shib bo'lmaydi")
    # waits for the owner's check together with the request; activated when the request is approved
    uni = University(name=name, short_name=name[:40], city=_clean(region)[:60], region=_clean(region)[:60], is_active=False)
    session.add(uni)
    await session.flush()
    return uni


async def submit(session: AsyncSession, user: User, body) -> None:
    """Creates or re-sends the request. `body` is schemas.StaffRequestIn.

    The website form sends the full name, phone (saved before), the position document and a pledge;
    an older client sending only the university and position is still accepted."""
    if user.staff_status == "approved":
        raise HTTPException(409, "Siz allaqachon universitet panelidasiz")
    if user.company_id:
        raise HTTPException(409, "Bu hisob kompaniyaga bog'langan. Universitet uchun alohida hisob oching.")
    detailed = body.full_name is not None
    if detailed:
        if not user.phone:
            raise HTTPException(422, "Ish telefoningizni kiriting")
        if not body.data_pledge:
            raise HTTPException(422, "Faqat o'z talabalaringizni tasdiqlash majburiyatini belgilang")
        if not body.doc_id and not user.staff_doc_id:
            raise HTTPException(422, "Lavozimni tasdiqlovchi hujjatni yuklang")
        if not [c for c in body.cooperation if c in COOPERATION]:
            raise HTTPException(422, "Hamkorlikda nima qila olishingizni kamida bitta belgilang")
    uni = await _university(session, user, body.university_id, body.new_university, body.new_university_region)
    if body.full_name:
        user.full_name, user.name_set_by_user = _clean(body.full_name), True
    doc_id = await files.company_file(session, user.id, body.doc_id, files.DOC_TYPES, "Lavozim hujjati")
    mou_id = await files.company_file(session, user.id, body.mou_id, files.DOC_TYPES, "Hamkorlik xati")
    old_extra = user.staff_extra or {}
    user.account_type, user.staff_university_id = "university", uni.id
    user.staff_position = _clean(body.position)[:120]
    user.staff_department = _clean(body.department)[:120]
    user.staff_work_email = body.work_email.strip()[:120]
    user.staff_doc_id = doc_id or (user.staff_doc_id if detailed else None)
    user.staff_extra = {
        "cooperation": [c for c in dict.fromkeys(body.cooperation) if c in COOPERATION],
        "website": body.website.strip(), "telegram": body.telegram.strip(), "social": body.social.strip(),
        "mou_id": mou_id or old_extra.get("mou_id"), "show_as_partner": body.show_as_partner,
    }
    user.staff_status, user.staff_role = "pending", ""
    user.staff_review_note, user.staff_reviewed_by, user.staff_reviewed_at = "", "", None
    user.staff_submitted_at = datetime.now(UTC)
    user.consent_at = user.consent_at or datetime.now(UTC)
    await session.commit()
    await session.refresh(user)

    deciders = await leads(session, uni.id, exclude=user.id)
    if deciders:
        await inbox.push(session, [u.id for u in deciders], "staff_request",
                         f"{user.full_name} {uni.short_name} paneliga kirish so'radi. Jamoa bo'limida tasdiqlang.",
                         link="/universitet/profil?tab=team", params={"student": user.full_name, "university": uni.short_name})
    admins = (await session.execute(select(User.telegram_id).where(
        (User.role == Role.admin) | User.is_owner, User.is_blocked.is_(False)))).scalars().all()
    notify.send(list(admins), f"Universitet xodimi tekshiruvni kutmoqda: {user.full_name} ({uni.name})"
                + ("" if uni.is_active else " · yangi universitet"))


def _apply_extras(uni: University, extra: dict) -> None:
    """Fills what the university's profile is still missing; never overwrites what staff already set."""
    for field in ("website", "telegram", "social"):
        if extra.get(field) and not getattr(uni, field):
            setattr(uni, field, str(extra[field])[:256 if field != "telegram" else 128])
    if extra.get("cooperation") and not uni.cooperation:
        uni.cooperation = list(extra["cooperation"])
    if extra.get("mou_id") and not uni.mou_file_id:
        uni.mou_file_id = extra["mou_id"]
    if extra.get("show_as_partner"):
        uni.show_as_partner = True


async def decide(session: AsyncSession, target: User, decision: str, note: str, by: str) -> None:
    """approve / needs_info / reject an open request. `by` is who decided (shown to the person)."""
    if target.staff_status not in OPEN_STATES or target.staff_university is None:
        raise HTTPException(409, "Bu so'rov allaqachon ko'rib chiqilgan")
    note = note.strip()
    if decision in ("needs_info", "reject") and len(note) < 3:
        raise HTTPException(422, "Sababini yozing: u foydalanuvchiga boradi")
    uni = target.staff_university
    if decision == "approve":
        target.staff_status = "approved"
        target.staff_role = "member" if await leads(session, uni.id, exclude=target.id) else "lead"
        if not uni.is_active:
            uni.is_active = True
        _apply_extras(uni, target.staff_extra or {})
    else:
        target.staff_status = "needs_info" if decision == "needs_info" else "rejected"
        target.staff_role = ""
    target.staff_review_note, target.staff_reviewed_by = note, by[:160]
    target.staff_reviewed_at = datetime.now(UTC)
    await session.commit()
    if decision == "needs_info":
        await inbox.push(session, [target.id], "staff_review",
                         f"{uni.short_name}: so'rovingizga qo'shimcha ma'lumot kerak. {note}",
                         link="/universitet", params={"status": "needs_info", "university": uni.short_name, "note": note})
    else:
        approved = decision == "approve"
        await inbox.push(session, [target.id], "staff_review",
                         f"{uni.name} karyera markazi paneliga kirish berildi." if approved
                         else f"Universitet xodimi sifatidagi so'rovingiz tasdiqlanmadi. {note}".strip(),
                         link="/universitet", params={"approved": approved, "university": uni.name, "note": note})


async def revoke(session: AsyncSession, target: User, note: str, by: str) -> None:
    """Takes panel access away (a person who left the university). They can ask again later."""
    if target.staff_status != "approved":
        raise HTTPException(409, "Bu xodimning kirish huquqi yo'q")
    if target.staff_role == "lead" and not await leads(session, target.staff_university_id, exclude=target.id):
        others = await session.scalar(select(func.count()).select_from(User).where(
            User.staff_university_id == target.staff_university_id, User.staff_status == "approved", User.id != target.id))
        if others:
            raise HTTPException(409, "Avval boshqa xodimni rahbar qiling: universitet rahbarsiz qolmasin")
    target.staff_status, target.staff_role = "rejected", ""
    target.staff_review_note = note.strip() or "Panelga kirish huquqi olib tashlandi"
    target.staff_reviewed_by, target.staff_reviewed_at = by[:160], datetime.now(UTC)
    await session.commit()
    await inbox.push(session, [target.id], "staff_review", f"Universitet paneliga kirish huquqingiz olib tashlandi. {note}".strip(),
                     link="/universitet", params={"approved": False, "university": target.staff_university.name if target.staff_university else "", "note": note})


async def set_role(session: AsyncSession, target: User, role: str) -> None:
    if target.staff_status != "approved" or role not in ("lead", "member"):
        raise HTTPException(409, "Rolni faqat tasdiqlangan xodimga berish mumkin")
    if role == "member" and target.staff_role == "lead" and not await leads(session, target.staff_university_id, exclude=target.id):
        raise HTTPException(409, "Universitetda kamida bitta rahbar qolishi kerak")
    target.staff_role = role
    await session.commit()


async def team(session: AsyncSession, university_id: int) -> list[dict]:
    rows = (await session.execute(select(User).where(
        User.staff_university_id == university_id,
        User.staff_status.in_(("approved", *OPEN_STATES))).order_by(
        (User.staff_status == "approved").desc(), (User.staff_role == "lead").desc(), User.staff_submitted_at))).scalars().all()
    return [await row(session, u) for u in rows]


async def row(session: AsyncSession, u: User) -> dict:
    """One staff member or request, as the admin queue and the university's team list show it."""
    uni = u.staff_university
    return {
        "id": u.id, "full_name": u.full_name, "username": u.username, "phone": u.phone, "email": u.email,
        "photo_url": u.photo_url, "position": u.staff_position, "status": u.staff_status, "role": u.staff_role,
        "university": uni.name if uni else None, "university_id": uni.id if uni else None,
        "new_university": bool(uni and not uni.is_active), "university_region": uni.region if uni else "",
        **await _details(session, u),
        "last_seen_at": u.last_seen_at, "created_at": u.created_at,
    }
