"""Student panel v2, phase 2: the profile photo and cover, projects and certificates, experience details and the
public image links (/media). Experience entries are employment outcomes (api/jobs.py adds and deletes them)."""
import hmac
from datetime import date

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select

from ..models import EmploymentOutcome, PortfolioItem, SubmissionFile
from ..schemas import MeOut, Tag, Url
from ..services import files
from ..services import portfolio as pf
from .deps import CurrentUser, Session

router = APIRouter(tags=["portfolio"])


def _student(user) -> None:
    if user.account_type != "student":
        raise HTTPException(403, "Faqat talabalar uchun")


@router.get("/me/portfolio")
async def my_portfolio(user: CurrentUser, session: Session) -> dict:
    return await pf.portfolio(session, user)


class ItemIn(BaseModel):
    kind: str = Field(pattern="^(project|certificate)$")
    title: str = Field(min_length=2, max_length=160)
    org: str = Field(default="", max_length=160)
    date_from: date | None = None
    date_to: date | None = None
    description: str = Field(default="", max_length=3000)
    link: Url = ""
    credential_id: str = Field(default="", max_length=120)
    skills: list[Tag] = Field(default_factory=list, max_length=12)
    cover_id: int | None = None
    file_ids: list[int] = Field(default_factory=list, max_length=pf.MAX_ITEM_FILES)

    @model_validator(mode="after")
    def _dates(self):
        if self.date_from and self.date_to and self.date_to < self.date_from:
            raise ValueError("Tugash sanasi boshlanishidan oldin bo'lmasin")
        if self.date_from and self.date_from > date.today():
            raise ValueError("Boshlanish (berilgan) sanasi kelajakda bo'lmasin")
        return self


async def _apply(session, user, item: PortfolioItem, body: ItemIn) -> list[int]:
    """Fills the item; returns the files it no longer uses (to release once flushed)."""
    before = [item.cover_file_id, *(item.file_ids or [])]
    cover = await pf.claim(session, user, [body.cover_id] if body.cover_id else [], pf.IMAGE_TYPES, "Muqova rasmi")
    attached = await pf.claim(session, user, body.file_ids, pf.ATTACH_TYPES, "Fayl")
    item.kind, item.title, item.org = body.kind, " ".join(body.title.split()), body.org.strip()
    item.date_from, item.date_to, item.description = body.date_from, body.date_to, body.description.strip()
    item.link, item.credential_id = body.link, body.credential_id.strip()
    item.skills = list(dict.fromkeys(body.skills))
    item.cover_file_id = cover[0].id if cover else None
    item.file_ids = [f.id for f in attached]
    return [i for i in before if i and i != item.cover_file_id and i not in item.file_ids]


@router.post("/me/portfolio", status_code=201)
async def add_item(body: ItemIn, user: CurrentUser, session: Session) -> dict:
    _student(user)
    n = await session.scalar(select(func.count()).select_from(PortfolioItem).where(PortfolioItem.user_id == user.id))
    if n >= pf.MAX_ITEMS:
        raise HTTPException(409, f"Portfolioga ko'pi bilan {pf.MAX_ITEMS} ta yozuv qo'shiladi")
    item = PortfolioItem(user_id=user.id, kind=body.kind, title=body.title)
    await _apply(session, user, item, body)
    session.add(item)
    await session.flush()
    await pf.refresh_count(session, user)
    await session.commit()
    return await pf.portfolio(session, user)


async def _own(session, user, item_id: int) -> PortfolioItem:
    item = await session.get(PortfolioItem, item_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(404, "Yozuv topilmadi")
    return item


@router.put("/me/portfolio/{item_id}")
async def edit_item(item_id: int, body: ItemIn, user: CurrentUser, session: Session) -> dict:
    item = await _own(session, user, item_id)
    dropped = await _apply(session, user, item, body)
    await session.flush()
    await pf.release(session, user, dropped)
    await session.commit()
    return await pf.portfolio(session, user)


@router.delete("/me/portfolio/{item_id}")
async def delete_item(item_id: int, user: CurrentUser, session: Session) -> dict:
    item = await _own(session, user, item_id)
    used = [item.cover_file_id, *(item.file_ids or [])]
    await session.delete(item)
    await session.flush()
    await pf.release(session, user, used)
    await pf.refresh_count(session, user)
    await session.commit()
    return await pf.portfolio(session, user)


class ExperiencePatch(BaseModel):
    position: str | None = Field(default=None, max_length=160)
    started_on: date | None = None
    ended_on: date | None = None
    description: str | None = Field(default=None, max_length=2000)


@router.patch("/me/outcomes/{outcome_id}")
async def edit_experience(outcome_id: int, body: ExperiencePatch, user: CurrentUser, session: Session) -> dict:
    """Details of an experience entry. A confirmed one keeps its position and start date: the company confirmed those."""
    o = await session.get(EmploymentOutcome, outcome_id)
    if o is None or o.student_id != user.id:
        raise HTTPException(404, "Yozuv topilmadi")
    changes = body.model_dump(exclude_unset=True)
    if o.confirmed and any(k in changes and changes[k] != getattr(o, k) for k in ("position", "started_on")):
        raise HTTPException(409, "Tasdiqlangan ish joyining lavozimi va boshlanish sanasi o'zgarmaydi")
    start = changes.get("started_on", o.started_on)
    end = changes.get("ended_on", o.ended_on)
    if start and end and end < start:
        raise HTTPException(422, "Tugash sanasi boshlanishidan oldin bo'lmasin")
    for k, v in changes.items():
        if k in ("position", "description"):
            v = (v or "").strip()                        # these columns are NOT NULL: an empty value clears them
        setattr(o, k, v)
    await session.commit()
    return pf.experience_out(o)


class ImageIn(BaseModel):
    file_id: int | None = None          # None removes it


@router.put("/me/photo", response_model=MeOut)
async def set_photo(body: ImageIn, user: CurrentUser, session: Session) -> MeOut:
    from .people import me_out
    old = user.avatar_file_id
    if body.file_id:
        row = (await pf.claim(session, user, [body.file_id], pf.IMAGE_TYPES, "Profil rasmi"))[0]
        user.avatar_file_id, user.photo_url = row.id, pf.media_url(row.id)
    else:
        user.avatar_file_id, user.photo_url = None, None
    await session.flush()
    if old != user.avatar_file_id:
        await pf.release(session, user, [old])
    await session.commit()
    await session.refresh(user)
    return await me_out(session, user)


@router.put("/me/cover", response_model=MeOut)
async def set_cover(body: ImageIn, user: CurrentUser, session: Session) -> MeOut:
    from .people import me_out
    old = user.cover_file_id
    if body.file_id:
        user.cover_file_id = (await pf.claim(session, user, [body.file_id], pf.IMAGE_TYPES, "Muqova rasmi"))[0].id
    else:
        user.cover_file_id = None
    await session.flush()
    if old != user.cover_file_id:
        await pf.release(session, user, [old])
    await session.commit()
    await session.refresh(user)
    return await me_out(session, user)


@router.get("/media/{file_id}", include_in_schema=False)
async def media(file_id: int, s: str, session: Session) -> FileResponse:
    """A profile image or portfolio file: the signature is the permission (see services/portfolio.py)."""
    if not hmac.compare_digest(s, pf.media_sig(file_id)):
        raise HTTPException(403, "Havola noto'g'ri")
    row = await session.get(SubmissionFile, file_id)
    path = files.root() / row.stored_name if row else None
    # only files checked when they were kept, and only while something still uses them (a deleted item,
    # a replaced photo or an edited task entry takes the link down with it)
    if row is None or not row.kept or not path.is_file() or not await pf.referenced(session, file_id):
        raise HTTPException(404, "Fayl topilmadi")
    inline = row.mime in pf.ATTACH_TYPES                                  # images and PDF show, the rest downloads
    return FileResponse(path, media_type=row.mime if inline else "application/octet-stream", filename=row.filename,
                        content_disposition_type="inline" if inline else "attachment",
                        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox",
                                 "Cache-Control": "private, max-age=604800"})
