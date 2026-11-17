"""The public website's own content, managed in the admin site: the moving strip of companies and universities
that trust us, the team on the "About us" page, the page photos and the contact details.

Everything here is public on purpose, so only what an admin typed or uploaded for the website is shown.
Uploaded images are PNG, JPG or WEBP (checked by their first bytes, never SVG) and served with nosniff.
"""
import re
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select

from ..core.config import settings
from ..models import AppConfig, Company, SiteMedia, SitePartner, TeamMember, University
from ..services import files
from .deps import AdminActor, Session, audit
from .university import logo_url as university_logo_url

public_router = APIRouter(prefix="/public/site", tags=["public"])
admin_router = APIRouter(prefix="/admin/site", tags=["admin"])

CONFIG_KEY = "site"
IMAGE_SLOTS = ("hero", "students", "about")           # the photos on the home and "About us" pages
CONTACT_FIELDS = ("email", "phone", "address", "telegram", "instagram", "linkedin", "facebook", "youtube")
MAGIC = {b"\x89PNG\r\n\x1a\n": "image/png", b"\xff\xd8\xff": "image/jpeg"}
EXT = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


def media_url(media_id: int | None) -> str | None:
    return f"/api/v1/public/site/media/{media_id}" if media_id else None


def _sniff(head: bytes) -> str | None:
    for magic, mime in MAGIC.items():
        if head.startswith(magic):
            return mime
    return "image/webp" if head[:4] == b"RIFF" and head[8:12] == b"WEBP" else None


# --------------------------------------------------------------------------- shapes

def _url(value: str | None) -> str | None:
    """A web address; "nursoft.uz" becomes https://nursoft.uz (as elsewhere in the app), other schemes are refused."""
    value = (value or "").strip()
    if not value:
        return None
    if not re.match(r"[a-z][a-z0-9+.-]*:", value, re.I):
        value = f"https://{value}"
    if not re.fullmatch(r"https?://[^\s<>\"']{3,290}", value):
        raise ValueError("Havola http:// yoki https:// bilan boshlansin")
    return value


class PartnerIn(BaseModel):
    kind: Literal["company", "university"]
    name: str = Field(min_length=1, max_length=160)
    website: str | None = Field(default=None, max_length=300)
    company_id: int | None = None
    university_id: int | None = None
    logo_media_id: int | None = None
    is_visible: bool = True

    @field_validator("website")
    @classmethod
    def _site(cls, v: str | None) -> str | None:
        return _url(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Nomini yozing")
        return v


class TeamIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=120)
    role_ru: str = Field(default="", max_length=120)
    role_en: str = Field(default="", max_length=120)
    link: str | None = Field(default=None, max_length=300)
    photo_media_id: int | None = None
    is_visible: bool = True

    @field_validator("link")
    @classmethod
    def _link(cls, v: str | None) -> str | None:
        return _url(v)

    @field_validator("full_name", "role", "role_ru", "role_en")
    @classmethod
    def _text(cls, v: str) -> str:
        return " ".join(v.split())


class OrderIn(BaseModel):
    ids: list[int] = Field(max_length=500)


class SettingsIn(BaseModel):
    images: dict[Literal["hero", "students", "about"], int | None] = {}
    contacts: dict[str, str] = {}

    @field_validator("contacts")
    @classmethod
    def _contacts(cls, v: dict[str, str]) -> dict[str, str]:
        out = {}
        for key, value in v.items():
            if key not in CONTACT_FIELDS:
                raise ValueError(f"Noma'lum maydon: {key}")
            value = " ".join((value or "").split())[:200]
            if value and key in ("instagram", "linkedin", "facebook", "youtube", "telegram") and value.startswith("http"):
                _url(value)
            if value:
                out[key] = value
        return out


# --------------------------------------------------------------------------- reading

def partner_logo(p: SitePartner) -> str | None:
    """An uploaded logo wins; otherwise the logo the company or university keeps on the platform."""
    if p.logo_media_id:
        return media_url(p.logo_media_id)
    if p.company and p.company.status == "approved" and p.company.logo_file_id:
        return files.logo_url(p.company.id, p.company.logo_file_id, p.company.status)
    if p.university and p.university.is_active and p.university.logo_file_id:
        return university_logo_url(p.university)
    return None


def partner_out(p: SitePartner, admin: bool = False) -> dict:
    out = {"id": p.id, "kind": p.kind, "name": p.name, "website": p.website, "logo_url": partner_logo(p),
           "short": (p.university.short_name if p.university else "") or ""}
    if admin:
        out |= {"company_id": p.company_id, "university_id": p.university_id, "logo_media_id": p.logo_media_id,
                "is_visible": p.is_visible, "position": p.position,
                "linked_name": (p.company.name if p.company else p.university.name if p.university else None)}
    return out


def team_out(m: TeamMember, admin: bool = False) -> dict:
    out = {"id": m.id, "full_name": m.full_name, "role": m.role, "role_ru": m.role_ru, "role_en": m.role_en,
           "link": m.link, "photo_url": media_url(m.photo_media_id)}
    if admin:
        out |= {"photo_media_id": m.photo_media_id, "is_visible": m.is_visible, "position": m.position}
    return out


async def _config(session) -> dict:
    row = await session.get(AppConfig, CONFIG_KEY)
    value = dict(row.value) if row else {}
    images = {slot: value.get("images", {}).get(slot) for slot in IMAGE_SLOTS}
    return {"images": images, "contacts": {k: v for k, v in value.get("contacts", {}).items() if k in CONTACT_FIELDS}}


async def _partners(session, visible_only: bool) -> list[SitePartner]:
    query = select(SitePartner).order_by(SitePartner.position, SitePartner.id)
    if visible_only:
        query = query.where(SitePartner.is_visible.is_(True))
    return list(await session.scalars(query))


async def _team(session, visible_only: bool) -> list[TeamMember]:
    query = select(TeamMember).order_by(TeamMember.position, TeamMember.id)
    if visible_only:
        query = query.where(TeamMember.is_visible.is_(True))
    return list(await session.scalars(query))


@public_router.get("")
async def public_site(session: Session) -> dict:
    config = await _config(session)
    return {"partners": [partner_out(p) for p in await _partners(session, True)],
            "team": [team_out(m) for m in await _team(session, True)],
            "images": {slot: media_url(mid) for slot, mid in config["images"].items()},
            "contacts": config["contacts"]}


@public_router.get("/media/{media_id}", include_in_schema=False)
async def site_media(media_id: int, session: Session) -> FileResponse:
    row = await session.get(SiteMedia, media_id)
    path = files.root() / row.stored_name if row else None
    if row is None or row.mime not in files.LOGO_TYPES or not path.is_file():
        raise HTTPException(404, "Rasm topilmadi")
    # a media id never changes its file (a new upload gets a new id), so browsers may keep it for long
    return FileResponse(path, media_type=row.mime, headers={
        "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=2592000, immutable"})


# --------------------------------------------------------------------------- admin

@admin_router.get("")
async def admin_site(_: AdminActor, session: Session) -> dict:
    config = await _config(session)
    return {"partners": [partner_out(p, admin=True) for p in await _partners(session, False)],
            "team": [team_out(m, admin=True) for m in await _team(session, False)],
            "images": {slot: {"media_id": mid, "url": media_url(mid)} for slot, mid in config["images"].items()},
            "contacts": config["contacts"]}


@admin_router.get("/choices")
async def choices(_: AdminActor, session: Session, kind: Literal["company", "university"], q: str = "") -> list[dict]:
    """Approved companies or active universities to pick for the strip (their logo comes along)."""
    like = f"%{q.strip()[:80]}%"
    if kind == "company":
        rows = await session.scalars(select(Company).where(Company.status == "approved", Company.name.ilike(like))
                                     .order_by(Company.logo_file_id.is_(None), Company.name).limit(20))
        return [{"id": c.id, "name": c.name, "logo_url": files.logo_url(c.id, c.logo_file_id, c.status)} for c in rows]
    rows = await session.scalars(select(University).where(
        University.is_active.is_(True), or_(University.name.ilike(like), University.short_name.ilike(like)))
        .order_by(University.logo_file_id.is_(None), University.name).limit(20))
    return [{"id": u.id, "name": u.name, "short": u.short_name, "logo_url": university_logo_url(u)} for u in rows]


@admin_router.post("/media")
async def upload_media(actor: AdminActor, session: Session, file: UploadFile) -> dict:
    limit = settings.max_upload_mb * 1024 * 1024
    head = await file.read(16)
    mime = _sniff(head)
    if mime is None:
        raise HTTPException(422, "Faqat PNG, JPG yoki WEBP rasm yuklang")
    stored = f"site-{uuid.uuid4().hex}{EXT[mime]}"
    path = files.root() / stored
    size = len(head)
    try:
        with path.open("wb") as out:
            out.write(head)
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"Rasm {settings.max_upload_mb} MB dan katta bo'lmasin")
                out.write(chunk)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    name = Path((file.filename or "rasm").replace("\\", "/")).name[-200:] or "rasm"
    row = SiteMedia(filename=name, stored_name=stored, mime=mime, size=size)
    session.add(row)
    await session.flush()
    audit(session, actor, "site_media_upload", f"media:{row.id}", name)
    await session.commit()
    return {"id": row.id, "url": media_url(row.id)}


async def _check_media(session, media_id: int | None) -> None:
    if media_id is not None and await session.get(SiteMedia, media_id) is None:
        raise HTTPException(422, "Rasm topilmadi, qayta yuklang")


async def _apply_partner(session, p: SitePartner, body: PartnerIn) -> None:
    company_id = body.company_id if body.kind == "company" else None
    university_id = body.university_id if body.kind == "university" else None
    if company_id is not None:
        found = await session.get(Company, company_id)
        if found is None or found.status != "approved":
            raise HTTPException(422, "Kompaniya topilmadi yoki hali tasdiqlanmagan")
    if university_id is not None and await session.get(University, university_id) is None:
        raise HTTPException(422, "Universitet topilmadi")
    await _check_media(session, body.logo_media_id)
    p.kind, p.name, p.website, p.is_visible = body.kind, body.name, body.website, body.is_visible
    p.company_id, p.university_id, p.logo_media_id = company_id, university_id, body.logo_media_id


@admin_router.post("/partners")
async def add_partner(body: PartnerIn, actor: AdminActor, session: Session) -> dict:
    last = await session.scalar(select(func.max(SitePartner.position))) or 0
    p = SitePartner(position=last + 1)
    await _apply_partner(session, p, body)
    session.add(p)
    await session.flush()
    audit(session, actor, "site_partner_add", f"partner:{p.id}", p.name)
    await session.commit()
    await session.refresh(p, ["company", "university"])
    return partner_out(p, admin=True)


@admin_router.put("/partners/order")
async def order_partners(body: OrderIn, actor: AdminActor, session: Session) -> dict:
    rows = {p.id: p for p in await _partners(session, False)}
    for i, pid in enumerate(body.ids):
        if pid in rows:
            rows[pid].position = i + 1
    audit(session, actor, "site_partner_order", "partners")
    await session.commit()
    return {"ok": True}


@admin_router.put("/partners/{partner_id}")
async def edit_partner(partner_id: int, body: PartnerIn, actor: AdminActor, session: Session) -> dict:
    p = await session.get(SitePartner, partner_id)
    if p is None:
        raise HTTPException(404, "Topilmadi")
    await _apply_partner(session, p, body)
    audit(session, actor, "site_partner_edit", f"partner:{p.id}", p.name)
    await session.commit()
    await session.refresh(p, ["company", "university"])
    return partner_out(p, admin=True)


@admin_router.delete("/partners/{partner_id}")
async def delete_partner(partner_id: int, actor: AdminActor, session: Session) -> dict:
    p = await session.get(SitePartner, partner_id)
    if p is None:
        raise HTTPException(404, "Topilmadi")
    audit(session, actor, "site_partner_delete", f"partner:{p.id}", p.name)
    await session.delete(p)
    await session.commit()
    return {"ok": True}


async def _apply_team(session, m: TeamMember, body: TeamIn) -> None:
    if not body.full_name or not body.role:
        raise HTTPException(422, "Ism va lavozim kerak")
    await _check_media(session, body.photo_media_id)
    m.full_name, m.role, m.role_ru, m.role_en = body.full_name, body.role, body.role_ru, body.role_en
    m.link, m.photo_media_id, m.is_visible = body.link, body.photo_media_id, body.is_visible


@admin_router.post("/team")
async def add_member(body: TeamIn, actor: AdminActor, session: Session) -> dict:
    last = await session.scalar(select(func.max(TeamMember.position))) or 0
    m = TeamMember(position=last + 1)
    await _apply_team(session, m, body)
    session.add(m)
    await session.flush()
    audit(session, actor, "site_team_add", f"team:{m.id}", m.full_name)
    await session.commit()
    return team_out(m, admin=True)


@admin_router.put("/team/order")
async def order_team(body: OrderIn, actor: AdminActor, session: Session) -> dict:
    rows = {m.id: m for m in await _team(session, False)}
    for i, mid in enumerate(body.ids):
        if mid in rows:
            rows[mid].position = i + 1
    audit(session, actor, "site_team_order", "team")
    await session.commit()
    return {"ok": True}


@admin_router.put("/team/{member_id}")
async def edit_member(member_id: int, body: TeamIn, actor: AdminActor, session: Session) -> dict:
    m = await session.get(TeamMember, member_id)
    if m is None:
        raise HTTPException(404, "Topilmadi")
    await _apply_team(session, m, body)
    audit(session, actor, "site_team_edit", f"team:{m.id}", m.full_name)
    await session.commit()
    return team_out(m, admin=True)


@admin_router.delete("/team/{member_id}")
async def delete_member(member_id: int, actor: AdminActor, session: Session) -> dict:
    m = await session.get(TeamMember, member_id)
    if m is None:
        raise HTTPException(404, "Topilmadi")
    audit(session, actor, "site_team_delete", f"team:{m.id}", m.full_name)
    await session.delete(m)
    await session.commit()
    return {"ok": True}


@admin_router.put("/settings")
async def save_settings(body: SettingsIn, actor: AdminActor, session: Session) -> dict:
    for media_id in body.images.values():
        await _check_media(session, media_id)
    current = await _config(session)
    value = {"images": current["images"] | dict(body.images), "contacts": body.contacts}
    row = await session.get(AppConfig, CONFIG_KEY)
    if row:
        row.value = value
    else:
        session.add(AppConfig(key=CONFIG_KEY, value=value))
    audit(session, actor, "site_settings", "site", ", ".join(sorted(body.contacts)))
    await session.commit()
    return await admin_site(actor, session)
