"""The posts feed ("Lenta", docs/12-talaba-postlar.md): posts with up to 4 images, reactions, one-level comments,
reports and the admin queue. Who may read, post and see what is in services/feed.py.

Moderation is report-based: a post appears at once; three open reports from different people hide it until an admin
hides it for good (with a note to the author) or restores it. Comment reports go to the same admin queue.
"""
import re
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import aliased

from ..core import ratelimit
from ..models import Post, PostComment, PostReaction, PostReport, User
from ..services import admin_inbox, inbox
from ..services import feed as fd
from ..services import portfolio as pf
from .deps import AdminActor, CurrentUser, Session, audit

router = APIRouter(tags=["feed"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])

PostKind = Literal["experience", "project", "achievement", "event", "question", "news"]
Visibility = Literal["all", "university"]
ReactionKind = Literal["like", "congrats"]
Reason = Literal["spam", "offensive", "false", "private", "other"]
MAX_TEXT = 3000
COMMENTS_A_DAY = 100          # comments one person writes in a day (live test 2026-11-20)
MAX_COMMENT = 1000
MAX_IMAGES = 4
COUNTER = {"like": "like_n", "congrats": "congrats_n"}


async def feed_viewer(user: CurrentUser) -> fd.Viewer:
    return fd.require_viewer(user)


Reader = Annotated[fd.Viewer, Depends(feed_viewer)]


def _clean(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text.replace("\r\n", "\n").strip())


def _may_write(viewer: fd.Viewer) -> None:
    # a post or comment shows the student's name and study to companies: only after the sign-up consent
    if viewer.kind == "student" and viewer.user.consent_at is None:
        raise HTTPException(403, "Avval ro'yxatdan o'tishni yakunlang")


async def _bump(session: Session, post_id: int, **delta: int) -> None:
    """Counters in SQL: two people reacting or commenting at the same moment must both count."""
    values = {}
    for name, d in delta.items():
        column = getattr(Post, name)
        values[name] = column + d if d > 0 else func.greatest(column + d, 0)
    await session.execute(update(Post).where(Post.id == post_id).values(**values)
                          .execution_options(synchronize_session=False))


async def _push_one(session: Session, user_id: int, kind: str, text: str, post_id: int, params: dict,
                    grouped: bool = False) -> None:
    """One notice with a link to the post in the recipient's own panel feed. Comment notices on one post collapse
    into one unread row (and one Telegram message per half hour), like chat threads (live test 2026-11-20)."""
    u = await session.get(User, user_id)
    if u is None:
        return
    # each panel opens the post in its own posts section (company /korxona/postlar, university /universitet/postlar)
    base = {"student": "/talaba/hamjamiyat", "employer": "/korxona/postlar", "university": "/universitet/postlar"}.get(u.account_type)
    link = f"{base}?post={post_id}" if base else ""
    if grouped:
        await inbox.push(session, [user_id], kind, text, link=link, params=params, group=f"post:{post_id}",
                         many=" · {count} ta yangi izoh")
    else:
        await inbox.push(session, [user_id], kind, text, link=link, params=params)


async def _page(session: Session, query, viewer_id: int, before: int | None, limit: int) -> dict:
    if before:
        query = query.where(Post.id < before)
    rows = (await session.execute(query.order_by(Post.id.desc()).limit(limit + 1))).scalars().all()
    items = list(rows[:limit])
    return {"items": await fd.posts_out(session, items, viewer_id), "next": items[-1].id if len(rows) > limit else None}


# --------------------------------------------------------------------------- reading

@router.get("/feed")
async def feed(viewer: Reader, session: Session,
               scope: Literal["all", "students", "university", "fields"] = Query(default="all"),
               before: int | None = Query(default=None, ge=1), limit: int = Query(default=20, ge=1, le=50)) -> dict:
    query = fd.visible_posts(viewer)
    if scope == "students":
        query = query.where(Post.author_kind == "student")
    elif scope == "university":
        if not viewer.university_id:
            return {"items": [], "next": None}
        query = query.where(Post.university_id == viewer.university_id)
    elif scope == "fields":
        fields = list(viewer.user.job_fields or [])
        if not fields:
            return {"items": [], "next": None}
        query = query.where(Post.author_kind == "student", User.job_fields.overlap(fields))
    return await _page(session, query, viewer.user.id, before, limit)


@router.get("/posts/{post_id}")
async def get_post(post_id: int, viewer: Reader, session: Session) -> dict:
    return await fd.post_out(session, await fd.get_seen(session, viewer, post_id), viewer.user.id)


@router.get("/people/{user_id}/posts")
async def person_posts(user_id: int, viewer: Reader, session: Session, before: int | None = Query(default=None, ge=1),
                       limit: int = Query(default=20, ge=1, le=50)) -> dict:
    """A person's posts for their profile ("Faoliyat"), under the same rules as the feed."""
    return await _page(session, fd.visible_posts(viewer).where(Post.author_id == user_id), viewer.user.id, before, limit)


@router.get("/me/posts")
async def my_posts(user: CurrentUser, session: Session, before: int | None = Query(default=None, ge=1),
                   limit: int = Query(default=20, ge=1, le=50)) -> dict:
    """The person's own posts, including those reports or an admin hid."""
    query = select(Post).where(Post.author_id == user.id, Post.status != "removed")
    return await _page(session, query, user.id, before, limit)


# --------------------------------------------------------------------------- writing

class PostIn(BaseModel):
    kind: PostKind
    text: str = Field(default="", max_length=4000)
    media_ids: list[int] = Field(default_factory=list, max_length=MAX_IMAGES)
    visibility: Visibility = "all"


class PostEditIn(BaseModel):
    kind: PostKind | None = None
    text: str | None = Field(default=None, max_length=4000)
    media_ids: list[int] | None = Field(default=None, max_length=MAX_IMAGES)
    visibility: Visibility | None = None


def _check(author_kind: str, kind: str, text: str, media: list[int], visibility: str, university_id: int | None) -> None:
    if len(text) > MAX_TEXT:
        raise HTTPException(422, f"Post matni {MAX_TEXT} belgidan oshmasin")
    if len(text) < 2 and not media:
        raise HTTPException(422, "Post matnini yozing yoki kamida bitta rasm qo'shing")
    if len(media) > MAX_IMAGES:
        raise HTTPException(422, f"Postga {MAX_IMAGES} tagacha rasm qo'shish mumkin")
    if kind == "news" and author_kind == "student":
        raise HTTPException(422, "«Yangilik» turi korxona va universitet postlari uchun")
    if visibility == "university" and not university_id:
        raise HTTPException(422, "Korxona posti hammaga ko'rinadi" if author_kind == "company"
                            else "«Faqat universitetim» uchun avval profilda universitetingizni belgilang")


def _unverified_university(viewer, visibility: str | None) -> None:
    """A student with a university in the profile but no verification yet cannot post «only my university»."""
    if (visibility == "university" and viewer.kind == "student" and viewer.user.university_id
            and viewer.user.verification != "verified"):
        raise HTTPException(422, "«Faqat universitetim» talabalik tasdiqlangach ochiladi: profilda tasdiq so'rang")


async def _claim(session: Session, user: User, media: list[int], post_id: int | None = None) -> None:
    """The images are the person's own uploads (PNG, JPG or WEBP), kept from now on."""
    if not media:
        return
    if await fd.live_images(session, user.id, post_id) + len(media) > fd.MAX_POST_IMAGES:
        raise HTTPException(409, "Postlaringizda rasmlar juda ko'p: eski postlarni o'chirib, keyin qo'shing")
    await pf.claim(session, user, media, pf.IMAGE_TYPES, "Rasm", cap=None)


@router.post("/posts", status_code=201)
async def create_post(body: PostIn, viewer: Reader, session: Session) -> dict:
    _may_write(viewer)
    user = viewer.user
    text, media = _clean(body.text), list(dict.fromkeys(i for i in body.media_ids if i))
    _unverified_university(viewer, body.visibility)
    _check(viewer.kind, body.kind, text, media, body.visibility, viewer.university_id)
    await _claim(session, user, media)
    ratelimit.limit(f"post:{user.id}", 10, 24 * 3600, "Bir kunda 10 tadan ortiq post joylab bo'lmaydi: ertaga davom eting")
    post = Post(author_id=user.id, author_kind=viewer.kind, company_id=viewer.company_id,
                university_id=viewer.university_id, kind=body.kind, text=text, media_ids=media, visibility=body.visibility)
    session.add(post)
    await session.commit()
    await session.refresh(post)
    return await fd.post_out(session, post, user.id)


async def _own_post(session: Session, user: User, post_id: int) -> Post:
    post = await session.get(Post, post_id)
    if post is None or post.status == "removed":
        raise HTTPException(404, "Post topilmadi")
    if post.author_id != user.id:
        raise HTTPException(403, "Postni faqat uning muallifi o'zgartira oladi")
    return post


@router.patch("/posts/{post_id}")
async def edit_post(post_id: int, body: PostEditIn, viewer: Reader, session: Session) -> dict:
    post = await _own_post(session, viewer.user, post_id)
    old = list(post.media_ids)
    text = _clean(body.text) if body.text is not None else post.text
    kind, visibility = body.kind or post.kind, body.visibility or post.visibility
    media = list(dict.fromkeys(i for i in body.media_ids if i)) if body.media_ids is not None else old
    if visibility != post.visibility:
        _unverified_university(viewer, visibility)
    _check(post.author_kind, kind, text, media, visibility, post.university_id)
    if (text, kind, visibility, media) != (post.text, post.kind, post.visibility, old):
        await _claim(session, viewer.user, media, post.id)
        post.text, post.kind, post.visibility, post.media_ids = text, kind, visibility, media
        post.edited_at = datetime.now(UTC)
        await session.flush()
        await pf.release(session, viewer.user, set(old) - set(media))      # dropped images stop being served
        await session.commit()
    return await fd.post_out(session, post, viewer.user.id)


@router.delete("/posts/{post_id}")
async def delete_post(post_id: int, user: CurrentUser, session: Session) -> dict:
    post = await _own_post(session, user, post_id)
    post.status, post.reports_open = "removed", 0
    await session.execute(update(PostReport).where(PostReport.post_id == post.id, PostReport.status == "open")
                          .values(status="resolved"))
    await session.flush()
    await pf.release(session, user, post.media_ids)                      # its image links stop working
    await session.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- reactions

class ReactionIn(BaseModel):
    kind: ReactionKind


async def _reactions(session: Session, post_id: int, user_id: int) -> dict:
    like, congrats = (await session.execute(select(Post.like_n, Post.congrats_n).where(Post.id == post_id))).one()
    mine = await session.scalar(select(PostReaction.kind).where(PostReaction.post_id == post_id, PostReaction.user_id == user_id))
    return {"reactions": {"like": like, "congrats": congrats}, "my_reaction": mine}


@router.put("/posts/{post_id}/reaction")
async def react(post_id: int, body: ReactionIn, viewer: Reader, session: Session) -> dict:
    post = await fd.get_seen(session, viewer, post_id)
    fd.require_live(post)
    uid = viewer.user.id
    added = (await session.execute(pg_insert(PostReaction).values(post_id=post.id, user_id=uid, kind=body.kind)
                                   .on_conflict_do_nothing(index_elements=["post_id", "user_id"])
                                   .returning(PostReaction.post_id))).first()
    if added:
        await _bump(session, post.id, **{COUNTER[body.kind]: 1})
    else:
        # one reaction per person: picking the other one moves it (the WHERE makes a repeat a no-op)
        switched = (await session.execute(update(PostReaction).where(
            PostReaction.post_id == post.id, PostReaction.user_id == uid, PostReaction.kind != body.kind)
            .values(kind=body.kind, created_at=func.now()).returning(PostReaction.post_id)
            .execution_options(synchronize_session=False))).first()
        if switched:
            other = "congrats" if body.kind == "like" else "like"
            await _bump(session, post.id, **{COUNTER[body.kind]: 1, COUNTER[other]: -1})
    await session.commit()
    return await _reactions(session, post.id, uid)


@router.delete("/posts/{post_id}/reaction")
async def unreact(post_id: int, viewer: Reader, session: Session) -> dict:
    post = await fd.get_seen(session, viewer, post_id)
    uid = viewer.user.id
    gone = (await session.execute(delete(PostReaction).where(PostReaction.post_id == post.id, PostReaction.user_id == uid)
                                  .returning(PostReaction.kind).execution_options(synchronize_session=False))).scalar_one_or_none()
    if gone:
        await _bump(session, post.id, **{COUNTER[gone]: -1})
    await session.commit()
    return await _reactions(session, post.id, uid)


# --------------------------------------------------------------------------- comments

class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    parent_id: int | None = None


@router.get("/posts/{post_id}/comments")
async def list_comments(post_id: int, viewer: Reader, session: Session) -> list[dict]:
    """Visible comments, oldest first. A reply whose top-level comment was hidden or removed goes with it."""
    post = await fd.get_seen(session, viewer, post_id)
    parent = aliased(PostComment)
    rows = (await session.execute(
        select(PostComment).join(User, User.id == PostComment.user_id)
        .outerjoin(parent, parent.id == PostComment.parent_id)
        .where(PostComment.post_id == post.id, PostComment.status == "visible", User.is_blocked.is_(False),
               or_(PostComment.parent_id.is_(None), parent.status == "visible"))
        .order_by(PostComment.id).limit(500))).scalars().all()
    return await fd.comments_out(session, list(rows), post.author_id, viewer.user.id)


@router.post("/posts/{post_id}/comments", status_code=201)
async def add_comment(post_id: int, body: CommentIn, viewer: Reader, session: Session) -> dict:
    _may_write(viewer)
    user = viewer.user
    post = await fd.get_seen(session, viewer, post_id)
    fd.require_live(post)
    text = _clean(body.text)
    if not text:
        raise HTTPException(422, "Izoh bo'sh")
    if len(text) > MAX_COMMENT:
        raise HTTPException(422, f"Izoh {MAX_COMMENT} belgidan oshmasin")
    reply_to = top = None
    if body.parent_id:
        reply_to = await session.get(PostComment, body.parent_id)
        top = await session.get(PostComment, reply_to.parent_id) if reply_to and reply_to.parent_id else reply_to
        if (reply_to is None or reply_to.post_id != post.id or reply_to.status != "visible"
                or top is None or top.status != "visible"):
            raise HTTPException(404, "Javob berilayotgan izoh topilmadi")
    ratelimit.limit(f"comment:{user.id}", 10, 60, "Juda tez yozyapsiz: bir daqiqadan keyin davom eting")
    ratelimit.limit(f"comment-day:{user.id}", COMMENTS_A_DAY, 24 * 3600,
                    f"Bir kunda {COMMENTS_A_DAY} tadan ortiq izoh yozib bo'lmaydi: ertaga davom eting")
    comment = PostComment(post_id=post.id, user_id=user.id, parent_id=top.id if top else None, text=text)
    session.add(comment)
    await _bump(session, post.id, comments_n=1)
    await session.commit()
    await session.refresh(comment)
    out = (await fd.comments_out(session, [comment], post.author_id, user.id))[0]

    name, snippet = out["author"]["name"], fd.short(text)
    params = {"name": name, "text": snippet, "post_id": post.id}
    told = {user.id}
    if reply_to is not None and reply_to.user_id not in told:
        await _push_one(session, reply_to.user_id, "comment_reply", f"{name} izohingizga javob berdi: «{snippet}»", post.id,
                        params, grouped=True)
        told.add(reply_to.user_id)
    if post.author_id not in told:            # the post's author replying gets one notice, not two
        await _push_one(session, post.author_id, "post_comment", f"{name} postingizga izoh yozdi: «{snippet}»", post.id,
                        params, grouped=True)
    return out


async def _set_comment(session: Session, comment_id: int, status: str) -> PostComment | None:
    """Hides, removes or restores a comment; comments_n follows what readers see (a top-level comment takes its
    visible replies along). The row is locked, so two clicks at once change the counter once."""
    c = (await session.execute(select(PostComment).where(PostComment.id == comment_id).with_for_update()
                               .execution_options(populate_existing=True))).scalar_one_or_none()
    if c is None or c.status == status or (c.status == "removed" and status != "removed"):
        return c
    shown_before = c.status == "visible"
    c.status = status
    if shown_before == (status == "visible"):
        return c                                                  # hidden → removed: nobody saw it either way
    if c.parent_id is None:
        replies = await session.scalar(select(func.count()).select_from(PostComment).where(
            PostComment.parent_id == c.id, PostComment.status == "visible"))
        n = 1 + (replies or 0)
    else:
        n = int(await session.scalar(select(PostComment.status).where(PostComment.id == c.parent_id)) == "visible")
    if n:
        await _bump(session, c.post_id, comments_n=n if status == "visible" else -n)
    return c


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: int, user: CurrentUser, session: Session) -> dict:
    c = await session.get(PostComment, comment_id)
    post = await session.get(Post, c.post_id) if c else None
    if c is None or post is None or c.status == "removed":
        raise HTTPException(404, "Izoh topilmadi")
    if user.id not in (c.user_id, post.author_id):
        raise HTTPException(403, "Izohni uning muallifi yoki post muallifi o'chira oladi")
    await _set_comment(session, c.id, "removed")
    await session.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- reports

class ReportIn(BaseModel):
    reason: Reason
    note: str = Field(default="", max_length=500)


def _report_limit(user_id: int) -> None:
    ratelimit.limit(f"post-report:{user_id}", 20, 24 * 3600, "Bir kunda 20 tadan ortiq shikoyat yuborib bo'lmaydi")


@router.post("/posts/{post_id}/report")
async def report_post(post_id: int, body: ReportIn, viewer: Reader, session: Session) -> dict:
    post = await fd.get_seen(session, viewer, post_id)
    uid = viewer.user.id
    if post.author_id == uid:
        raise HTTPException(422, "O'z postingizga shikoyat qila olmaysiz")
    _report_limit(uid)
    added = (await session.execute(pg_insert(PostReport).values(post_id=post.id, reporter_id=uid, reason=body.reason,
                                                                note=body.note.strip())
                                   .on_conflict_do_nothing(index_elements=["reporter_id", "post_id"])
                                   .returning(PostReport.id))).first()
    if added is None:                                    # reported before: one report per person
        return {"ok": True}
    await session.execute(update(Post).where(Post.id == post.id).values(reports_open=Post.reports_open + 1)
                          .execution_options(synchronize_session=False))
    hidden = None
    # every report reaches the admin queue, but only trusted people's reports hide a post (three fresh accounts
    # could otherwise hide anything; live test 2026-11-20)
    open_n = await fd.trusted_reports(session, post.id) if fd.trusted(viewer) else 0
    if open_n >= fd.REPORTS_TO_HIDE:
        hidden = (await session.execute(update(Post).where(Post.id == post.id, Post.status == "visible")
                                        .values(status="hidden").returning(Post.id)
                                        .execution_options(synchronize_session=False))).first()
    await session.commit()
    if hidden:
        await _push_one(session, post.author_id, "post_hidden",
                        "Postingiz shikoyatlar sababli vaqtincha yashirildi: admin ko'rib chiqadi.", post.id, {"post_id": post.id})
        author = (await fd.post_out(session, post, None))["author"]["name"]
        await admin_inbox.push(session, "complaints", "post_hidden",
                               f"Post {open_n} ta shikoyat sababli yashirildi: {author}, «{fd.short(post.text, 60)}».", "posts")
    return {"ok": True}


@router.post("/comments/{comment_id}/report")
async def report_comment(comment_id: int, body: ReportIn, viewer: Reader, session: Session) -> dict:
    c = await session.get(PostComment, comment_id)
    if c is None or c.status != "visible":
        raise HTTPException(404, "Izoh topilmadi")
    await fd.get_seen(session, viewer, c.post_id)
    uid = viewer.user.id
    if c.user_id == uid:
        raise HTTPException(422, "O'z izohingizga shikoyat qila olmaysiz")
    _report_limit(uid)
    added = (await session.execute(pg_insert(PostReport).values(comment_id=c.id, reporter_id=uid, reason=body.reason,
                                                                note=body.note.strip())
                                   .on_conflict_do_nothing(index_elements=["reporter_id", "comment_id"])
                                   .returning(PostReport.id))).first()
    await session.commit()
    if added is None:
        return {"ok": True}
    open_n = await session.scalar(select(func.count()).select_from(PostReport).where(
        PostReport.comment_id == c.id, PostReport.status == "open"))
    if open_n == fd.REPORTS_TO_HIDE:                   # the admin bell rings once; the queue lists every report
        who = await session.get(User, c.user_id)
        await admin_inbox.push(session, "complaints", "comment_reported",
                               f"Izohga {open_n} ta shikoyat tushdi: {who.full_name if who else ''}, «{fd.short(c.text, 60)}».",
                               "posts")
    return {"ok": True}


# --------------------------------------------------------------------------- admin queue

def _report_out(r: PostReport, reporter: str | None) -> dict:
    return {"reason": r.reason, "note": r.note, "reporter_name": reporter or "", "created_at": r.created_at, "status": r.status}


@admin_router.get("/posts")
async def admin_posts(_: AdminActor, session: Session,
                      status: Literal["reported", "hidden", "all"] = Query(default="reported")) -> list[dict]:
    """Posts waiting for a decision (open reports on the post or its comments), hidden ones, or all; newest first."""
    query = select(Post)
    if status == "reported":
        with_comment_reports = select(PostComment.post_id).join(PostReport, PostReport.comment_id == PostComment.id) \
            .where(PostReport.status == "open")
        query = query.where(Post.status != "removed", or_(Post.reports_open > 0, Post.id.in_(with_comment_reports)))
    elif status == "hidden":
        query = query.where(Post.status == "hidden")
    posts = list((await session.execute(query.order_by(Post.id.desc()).limit(200))).scalars().all())
    if not posts:
        return []
    ids = [p.id for p in posts]
    outs = await fd.posts_out(session, posts, None)
    reports: dict[int, list[dict]] = {}
    for r, name in (await session.execute(select(PostReport, User.full_name).outerjoin(User, User.id == PostReport.reporter_id)
                                          .where(PostReport.post_id.in_(ids)).order_by(PostReport.id.desc()))).all():
        reports.setdefault(r.post_id, []).append(_report_out(r, name))
    # reported comments, with their reports
    by_comment: dict[int, list[tuple[PostReport, str | None]]] = {}
    comments: dict[int, PostComment] = {}
    for r, c, name in (await session.execute(
            select(PostReport, PostComment, User.full_name).join(PostComment, PostComment.id == PostReport.comment_id)
            .outerjoin(User, User.id == PostReport.reporter_id).where(PostComment.post_id.in_(ids))
            .order_by(PostReport.id.desc()))).all():
        by_comment.setdefault(c.id, []).append((r, name))
        comments[c.id] = c
    shown = {o["id"]: o for o in await fd.comments_out(session, list(comments.values()), 0, None)}
    per_post: dict[int, list[dict]] = {}
    for cid, c in sorted(comments.items()):
        rows = by_comment[cid]
        per_post.setdefault(c.post_id, []).append({
            "comment": {**shown[cid], "status": c.status, "can_delete": False},
            "reports": [_report_out(r, name) for r, name in rows],
            "reports_open": sum(1 for r, _ in rows if r.status == "open")})
    return [{"post": o, "reports": reports.get(p.id, []), "reports_open": p.reports_open, "hidden_note": p.hidden_note,
             "comments": per_post.get(p.id, [])} for p, o in zip(posts, outs, strict=True)]


class DecisionIn(BaseModel):
    note: str = Field(default="", max_length=1000)


async def _resolve(session: Session, where) -> None:
    await session.execute(update(PostReport).where(where, PostReport.status == "open").values(status="resolved"))


@admin_router.post("/posts/{post_id}/hide")
async def admin_hide_post(post_id: int, body: DecisionIn, actor: AdminActor, session: Session) -> dict:
    post = await session.get(Post, post_id)
    if post is None or post.status == "removed":
        raise HTTPException(404, "Post topilmadi")
    note = body.note.strip()
    post.status, post.hidden_note, post.reports_open = "hidden", note, 0
    await _resolve(session, PostReport.post_id == post.id)
    audit(session, actor, "post.hide", f"post #{post.id}", note)
    await session.commit()
    await _push_one(session, post.author_id, "post_hidden_admin",
                    "Postingiz admin tomonidan yashirildi" + (f": {note}" if note else "."), post.id,
                    {"note": note, "post_id": post.id})
    return {"ok": True}


@admin_router.post("/posts/{post_id}/restore")
async def admin_restore_post(post_id: int, actor: AdminActor, session: Session) -> dict:
    """Shows the post again and closes its open reports (also the way to dismiss reports on a visible post)."""
    post = await session.get(Post, post_id)
    if post is None:
        raise HTTPException(404, "Post topilmadi")
    if post.status == "removed":
        raise HTTPException(409, "Muallif o'chirgan postni tiklab bo'lmaydi")
    was_hidden = post.status == "hidden"
    post.status, post.hidden_note, post.reports_open = "visible", "", 0
    await _resolve(session, PostReport.post_id == post.id)
    audit(session, actor, "post.restore", f"post #{post.id}")
    await session.commit()
    if was_hidden:
        await _push_one(session, post.author_id, "post_restored",
                        "Postingiz tekshiruvdan o'tdi va yana ko'rinmoqda.", post.id, {"post_id": post.id})
    return {"ok": True}


@admin_router.post("/comments/{comment_id}/hide")
async def admin_hide_comment(comment_id: int, body: DecisionIn, actor: AdminActor, session: Session) -> dict:
    c = await session.get(PostComment, comment_id)
    if c is None or c.status == "removed":
        raise HTTPException(404, "Izoh topilmadi")
    await _set_comment(session, c.id, "hidden")
    await _resolve(session, PostReport.comment_id == c.id)
    audit(session, actor, "comment.hide", f"comment #{c.id} (post #{c.post_id})", body.note.strip())
    await session.commit()
    return {"ok": True}


@admin_router.post("/comments/{comment_id}/restore")
async def admin_restore_comment(comment_id: int, actor: AdminActor, session: Session) -> dict:
    """Shows a hidden comment again and closes its open reports (also dismisses reports on a visible comment)."""
    c = await session.get(PostComment, comment_id)
    if c is None or c.status == "removed":
        raise HTTPException(404, "Izoh topilmadi")
    await _set_comment(session, c.id, "visible")
    await _resolve(session, PostReport.comment_id == c.id)
    audit(session, actor, "comment.restore", f"comment #{c.id} (post #{c.post_id})")
    await session.commit()
    return {"ok": True}
