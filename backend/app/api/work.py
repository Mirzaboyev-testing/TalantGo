"""Doing a task inside the app: uploading files for a submission, opening them, asking the mentor."""
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..core.security import read_token
from ..models import Role, SubmissionFile, Task, TaskQuestion, User
from ..services import files, inbox
from .challenges import Mentor
from .deps import CurrentUser, Session

router = APIRouter(tags=["work"])
MAX_PENDING_UPLOADS = 20


# --------------------------------------------------------------------------- files

@router.post("/uploads", status_code=201)
async def upload(file: UploadFile, user: CurrentUser, session: Session) -> dict:
    """Step one of a file submission: the file is stored, then attached when the work is submitted."""
    from datetime import UTC, datetime, timedelta
    pending = await session.scalar(select(func.count()).select_from(SubmissionFile).where(
        SubmissionFile.user_id == user.id, SubmissionFile.submission_id.is_(None),
        SubmissionFile.created_at > datetime.now(UTC) - timedelta(hours=6)))   # older leftovers no longer block
    if pending >= MAX_PENDING_UPLOADS:
        raise HTTPException(429, "Topshirilmagan fayllar juda ko'p: avval ishni yuboring")
    row = await files.save(user.id, file)
    session.add(row)
    await session.commit()
    return files.file_out(row)


@router.get("/files/{file_id}/{name}", include_in_schema=False)
async def open_file(file_id: int, name: str, t: str, session: Session) -> FileResponse:
    # the signed link is the permission: it is only handed to people the app shows the work to
    if read_token(t, "file") != str(file_id):
        raise HTTPException(403, "Havola eskirgan: faylni ilovadan qayta oching")
    row = await session.get(SubmissionFile, file_id)
    path = files.root() / row.stored_name if row else None
    if row is None or not path.is_file():
        raise HTTPException(404, "Fayl topilmadi")
    inline = row.mime in files.INLINE_TYPES
    return FileResponse(path, media_type=row.mime if inline else "application/octet-stream", filename=row.filename,
                        content_disposition_type="inline" if inline else "attachment",
                        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox",
                                 "Cache-Control": "private, max-age=3600"})


# --------------------------------------------------------------------------- questions about a task

class QuestionIn(BaseModel):
    text: str = Field(min_length=5, max_length=1000)


class AnswerIn(BaseModel):
    answer: str = Field(min_length=2, max_length=2000)


def question_out(q: TaskQuestion, viewer: User) -> dict:
    return {"id": q.id, "task_id": q.task_id, "task_title": q.task.title, "track": q.task.track.title,
            "text": q.text, "author": q.user.full_name, "is_mine": q.user_id == viewer.id, "answer": q.answer,
            "answered_by": q.answered_by.full_name if q.answered_by else None,
            "created_at": q.created_at, "answered_at": q.answered_at}


async def _visible_task(session: Session, user: User, task_id: int) -> Task:
    task = await session.get(Task, task_id)
    if task is None or not task.is_active:
        raise HTTPException(404, "Topshiriq topilmadi")
    if user.role is Role.student and task.track_id != user.track_id:
        raise HTTPException(403, "Bu topshiriq sizning yo'lingizda emas")
    return task


@router.get("/tasks/{task_id}/questions")
async def task_questions(task_id: int, user: CurrentUser, session: Session) -> list[dict]:
    await _visible_task(session, user, task_id)
    rows = (await session.execute(select(TaskQuestion).where(TaskQuestion.task_id == task_id)
                                  .order_by(TaskQuestion.created_at))).scalars()
    return [question_out(q, user) for q in rows]


@router.post("/tasks/{task_id}/questions", status_code=201)
async def ask(task_id: int, body: QuestionIn, user: CurrentUser, session: Session) -> dict:
    task = await _visible_task(session, user, task_id)
    open_count = await session.scalar(select(func.count()).select_from(TaskQuestion).where(
        TaskQuestion.user_id == user.id, TaskQuestion.answer == ""))
    if open_count >= 10:
        raise HTTPException(429, "Javob kutayotgan savollaringiz ko'p: avval javob kelsin")
    q = TaskQuestion(task_id=task.id, user_id=user.id, text=body.text.strip())
    session.add(q)
    await session.commit()
    # the task's author answers first; tasks without one go to every mentor
    if task.created_by_id:
        to = [task.created_by_id]
    else:
        to = list((await session.execute(select(User.id).where(
            User.role.in_([Role.mentor, Role.admin]), User.is_blocked.is_(False)))).scalars())
    await inbox.push(session, to, "question_new",
                     f"Savol «{task.title}» bo'yicha, {user.full_name}: {q.text[:300]}\n\n"
                     "Mentor panelidagi «Savollar» bo'limida javob bering.",
                     link="/talaba/tekshirish", params={"task": task.title, "student": user.full_name})
    return question_out(await _reload(session, q.id), user)


async def _reload(session: Session, question_id: int) -> TaskQuestion:
    session.expire_all()
    return (await session.execute(select(TaskQuestion).where(TaskQuestion.id == question_id))).scalar_one()


@router.get("/mentor/questions")
async def mentor_questions(user: Mentor, session: Session, open_only: bool = True) -> list[dict]:
    query = select(TaskQuestion).join(Task)
    if open_only:
        query = query.where(TaskQuestion.answer == "")
    # questions on the mentor's own tasks first
    query = query.order_by((Task.created_by_id == user.id).desc().nulls_last(), TaskQuestion.created_at.desc())
    return [question_out(q, user) for q in (await session.execute(query.limit(100))).scalars()]


@router.post("/questions/{question_id}/answer")
async def answer(question_id: int, body: AnswerIn, user: Mentor, session: Session) -> dict:
    q = await session.get(TaskQuestion, question_id)
    if q is None:
        raise HTTPException(404, "Savol topilmadi")
    if q.answer and q.answered_by_id not in (None, user.id):
        raise HTTPException(409, "Bu savolga boshqa mentor javob bergan")
    q.answer, q.answered_by_id, q.answered_at = body.answer.strip(), user.id, datetime.now(UTC)
    await session.commit()
    q = await _reload(session, question_id)
    await inbox.push(session, [q.user_id], "question_answered",
                     f"Mentor «{q.task.title}» bo'yicha savolingizga javob berdi: {q.answer[:500]}",
                     link="/talaba/yol", params={"task": q.task.title})
    return question_out(q, user)
