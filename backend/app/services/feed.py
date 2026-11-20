"""The posts feed ("Lenta", docs/12-talaba-postlar.md): who may read and post, who sees which post, and how posts,
authors and comments are shown. The routes are in api/feed.py.

Readers: signed-in students, people of an approved company and approved university staff. A post is shown when it
is visible (its author also sees it while reports keep it hidden), its author is not blocked, and a post limited to
one university reaches only people of that university: approved staff, and students whose studentship the university
VERIFIED (a student could otherwise pick any university in their profile and read its closed posts; live test
2026-11-20). Only reports from trusted people (a verified student, an approved company, approved staff) hide a post.
"""
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Company, Post, PostComment, PostReaction, PostReport, University, User
from . import catalog, files, uni_news
from .portfolio import media_url

REPORTS_TO_HIDE = 3            # open reports from different TRUSTED people that hide a post until an admin decides
MAX_POST_IMAGES = 200          # images one person keeps in live posts (with 10 posts a day, a bound on disk use)


@dataclass
class Viewer:
    user: User
    kind: str                       # "student" | "company" | "university": also the author kind of their posts
    university_id: int | None       # whose "only my university" posts they see
    company_id: int | None = None


def viewer_of(user: User) -> Viewer | None:
    if user.account_type == "student":
        # "only my university" needs the university's own confirmation, not just the profile field
        return Viewer(user, "student", user.university_id if user.verification == "verified" else None)
    if user.account_type == "employer" and user.company is not None and user.company.status == "approved":
        return Viewer(user, "company", None, user.company_id)
    if (user.account_type == "university" and user.staff_status == "approved" and user.staff_university is not None
            and user.staff_university.is_active):
        return Viewer(user, "university", user.staff_university_id)
    return None


def trusted(viewer: Viewer) -> bool:
    """A report that counts towards hiding a post: a verified student, a person of an approved company (a company
    viewer exists only when approved) or approved university staff. Anyone else's report waits for an admin."""
    return viewer.kind != "student" or viewer.user.verification == "verified"


async def trusted_reports(session: AsyncSession, post_id: int) -> int:
    """Open reports on a post from people who are trusted now (and not blocked)."""
    approved = select(Company.id).where(Company.status == "approved")
    who = or_(and_(User.account_type == "student", User.verification == "verified"),
              and_(User.account_type == "employer", User.company_id.in_(approved)),
              and_(User.account_type == "university", User.staff_status == "approved"))
    return await session.scalar(select(func.count()).select_from(PostReport).join(User, User.id == PostReport.reporter_id)
                                .where(PostReport.post_id == post_id, PostReport.status == "open",
                                       User.is_blocked.is_(False), who)) or 0


def require_viewer(user: User) -> Viewer:
    viewer = viewer_of(user)
    if viewer is None:
        raise HTTPException(403, "Lenta talabalar, tasdiqlangan korxonalar va universitet xodimlari uchun")
    return viewer


def seen_by(viewer: Viewer):
    """The WHERE part for posts this person may see (the query must join User on the author)."""
    mine = Post.author_id == viewer.user.id
    same_uni = Post.university_id == viewer.university_id if viewer.university_id else false()
    return and_(User.is_blocked.is_(False),
                or_(Post.status == "visible", and_(mine, Post.status == "hidden")),
                or_(Post.visibility == "all", mine, same_uni))


def visible_posts(viewer: Viewer):
    return select(Post).join(User, User.id == Post.author_id).where(seen_by(viewer))


async def get_seen(session: AsyncSession, viewer: Viewer, post_id: int) -> Post:
    post = (await session.execute(visible_posts(viewer).where(Post.id == post_id))).scalar_one_or_none()
    if post is None:
        raise HTTPException(404, "Post topilmadi")
    return post


def require_live(post: Post) -> None:
    """Reactions, comments and reports need a post others can see."""
    if post.status != "visible":
        raise HTTPException(409, "Post yashirilgan: admin ko'rib chiqmoqda")


def short(text: str, n: int = 80) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[:n - 1].rstrip() + "…"


# --------------------------------------------------------------------------- how authors, posts and comments look

def course_text(course: int | None) -> str:
    return "" if not course else ("Magistratura" if course >= 7 else f"{course}-kurs")


def study_line(u: User) -> str:
    """TDIU · Iqtisodiyot · 3-kurs"""
    return " · ".join(x for x in [u.university_ref.short_name if u.university_ref else "", u.faculty, course_text(u.course)] if x)


def author_out(kind: str, u: User | None, company: Company | None, uni: University | None) -> dict:
    base = {"kind": kind, "user_id": u.id if u else None, "company_id": None, "company_logo": None, "university_id": None}
    if kind == "company" and company is not None:
        logo = files.logo_url(company.id, company.logo_file_id, company.status)
        about = catalog.industry_label(company.industry) if company.industry else company.city
        return {**base, "name": company.name, "photo_url": logo,
                "subtitle": " · ".join(x for x in [u.full_name if u else "", about] if x),
                "verified": company.status == "approved", "company_id": company.id, "company_logo": logo}
    if kind == "university" and uni is not None:
        return {**base, "name": uni.short_name, "photo_url": uni_news.university_logo_url(uni), "subtitle": uni.name,
                "verified": True, "university_id": uni.id}
    if u is None:
        return {**base, "name": "", "photo_url": None, "subtitle": "", "verified": False}
    return {**base, "name": u.full_name, "photo_url": u.photo_url,
            "subtitle": study_line(u), "verified": u.verification == "verified", "university_id": u.university_id}


def account_kind(u: User) -> str:
    """How a person appears next to a comment: as their company, their university or themselves."""
    if u.account_type == "employer" and u.company is not None:
        return "company"
    if u.account_type == "university" and u.staff_university is not None:
        return "university"
    return "student"


def person_out(u: User) -> dict:
    kind = account_kind(u)
    return author_out(kind, u, u.company if kind == "company" else None, u.staff_university if kind == "university" else None)


async def _by_id(session: AsyncSession, model, ids) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {r.id: r for r in (await session.execute(select(model).where(model.id.in_(ids)))).scalars()}


async def posts_out(session: AsyncSession, posts: list[Post], viewer_id: int | None) -> list[dict]:
    """Posts as the app shows them, loaded in a fixed number of queries whatever the page size."""
    if not posts:
        return []
    users = await _by_id(session, User, (p.author_id for p in posts))
    companies = await _by_id(session, Company, (p.company_id for p in posts if p.author_kind == "company"))
    unis = await _by_id(session, University, (p.university_id for p in posts if p.author_kind == "university"))
    mine = {}
    if viewer_id:
        mine = dict((await session.execute(select(PostReaction.post_id, PostReaction.kind).where(
            PostReaction.user_id == viewer_id, PostReaction.post_id.in_([p.id for p in posts])))).all())
    return [{
        "id": p.id,
        "author": author_out(p.author_kind, users.get(p.author_id), companies.get(p.company_id), unis.get(p.university_id)),
        "kind": p.kind, "text": p.text, "media": [{"id": i, "url": media_url(i)} for i in p.media_ids],
        "visibility": p.visibility, "created_at": p.created_at, "edited_at": p.edited_at,
        "reactions": {"like": p.like_n, "congrats": p.congrats_n}, "my_reaction": mine.get(p.id),
        "comments_n": p.comments_n, "mine": viewer_id is not None and p.author_id == viewer_id, "status": p.status,
    } for p in posts]


async def post_out(session: AsyncSession, post: Post, viewer_id: int | None) -> dict:
    return (await posts_out(session, [post], viewer_id))[0]


async def comments_out(session: AsyncSession, comments: list[PostComment], post_author_id: int, viewer_id: int | None) -> list[dict]:
    users = await _by_id(session, User, (c.user_id for c in comments))
    out = []
    for c in comments:
        u = users.get(c.user_id)
        out.append({"id": c.id, "post_id": c.post_id, "parent_id": c.parent_id,
                    "author": person_out(u) if u else author_out("student", None, None, None),
                    "text": c.text, "created_at": c.created_at,
                    "mine": viewer_id is not None and c.user_id == viewer_id,
                    "can_delete": viewer_id is not None and viewer_id in (c.user_id, post_author_id)})
    return out


async def live_images(session: AsyncSession, user_id: int, except_post: int | None = None) -> int:
    """How many images the person keeps in posts that are not removed."""
    query = select(func.coalesce(func.sum(func.cardinality(Post.media_ids)), 0)).where(
        Post.author_id == user_id, Post.status != "removed")
    if except_post:
        query = query.where(Post.id != except_post)
    return int(await session.scalar(query) or 0)
