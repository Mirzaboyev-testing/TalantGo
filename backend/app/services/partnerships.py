"""Company and university partnerships: one row per pair; either side asks, the other side answers."""
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Company, Partnership, University


def out(p: Partnership) -> dict:
    return {"id": p.id, "company_id": p.company_id, "company": p.company.name, "industry": p.company.industry,
            "university_id": p.university_id, "university": p.university.name,
            "university_short": p.university.short_name, "status": p.status, "initiated_by": p.initiated_by,
            "message": p.message, "created_at": p.created_at, "decided_at": p.decided_at}


async def open_request(session: AsyncSession, company: Company, university: University, side: str, message: str) -> Partnership:
    """Asks the other side. A rejected request can be sent again; an open or accepted one cannot."""
    p = (await session.execute(select(Partnership).where(Partnership.company_id == company.id,
                                                          Partnership.university_id == university.id))).scalar_one_or_none()
    if p is not None and p.status in ("pending", "accepted"):
        raise HTTPException(409, "Hamkorlik allaqachon bor yoki so'rov javob kutmoqda")
    if p is None:
        p = Partnership(company_id=company.id, university_id=university.id)
        session.add(p)
    p.status, p.initiated_by, p.message, p.decided_at = "pending", side, message.strip(), None
    await session.commit()
    await session.refresh(p)
    return p


async def decide(session: AsyncSession, p: Partnership, side: str, accept: bool) -> None:
    """Only the side that was asked answers, and only while the request is open."""
    if p.status != "pending":
        raise HTTPException(409, "Bu so'rovga javob berilgan")
    if p.initiated_by == side:
        raise HTTPException(403, "O'zingiz yuborgan so'rovga javob bera olmaysiz")
    p.status, p.decided_at = ("accepted" if accept else "rejected"), datetime.now(UTC)
    await session.commit()
