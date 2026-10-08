from fastapi import APIRouter
from sqlalchemy import func, select

from ..models import ReviewKind, Submission, Task, TaskQuestion, Track
from ..schemas import FileOut, QueueItem, ReviewIn, ReviewOut, SubmissionOut, SubmitIn, TaskOut, TrackOut
from ..services import files, progress
from ..services.rules import Rules, get_rules
from .deps import CurrentUser, Session

router = APIRouter(tags=["learning"])


def submission_out(sub: Submission) -> SubmissionOut:
    return SubmissionOut(
        id=sub.id, task_id=sub.task_id, proof_url=sub.proof_url, note=sub.note, status=sub.status,
        round=sub.round, points_awarded=sub.points_awarded, created_at=sub.created_at,
        verified_at=sub.verified_at, ai_state=sub.ai_state, ai_note=sub.ai_note,
        files=[FileOut(**files.file_out(f)) for f in sub.current_files],
        reviews=[ReviewOut(reviewer_name=r.reviewer_name, kind=r.kind, approved=r.approved,
                           comment=r.comment, created_at=r.created_at) for r in sub.current_reviews])


@router.get("/rules", response_model=Rules)
async def rules(session: Session) -> Rules:
    """The review rules students see in the app (how many approvals, points per review)."""
    return await get_rules(session)


@router.get("/tracks", response_model=list[TrackOut])
async def tracks(session: Session) -> list[Track]:
    return list((await session.execute(select(Track).where(Track.is_active).order_by(Track.sort_order))).scalars())


@router.get("/tracks/{track_id}/tasks", response_model=list[TaskOut])
async def track_tasks(track_id: int, user: CurrentUser, session: Session) -> list[TaskOut]:
    tasks = (await session.execute(select(Task).where(Task.track_id == track_id, Task.is_active)
                                   .order_by(Task.sort_order))).scalars().all()
    mine = {s.task_id: s for s in (await session.execute(
        select(Submission).where(Submission.user_id == user.id,
                                 Submission.task_id.in_([t.id for t in tasks])))).scalars()}
    questions = dict((await session.execute(
        select(TaskQuestion.task_id, func.count()).where(TaskQuestion.task_id.in_([t.id for t in tasks]))
        .group_by(TaskQuestion.task_id))).all())
    return [TaskOut(id=t.id, track_id=t.track_id, week=t.week, title=t.title, description=t.description,
                    proof_hint=t.proof_hint, points=t.points, kind=t.kind, criteria=t.criteria,
                    questions=questions.get(t.id, 0),
                    mentor=t.created_by.full_name if t.created_by else None,
                    submission=submission_out(mine[t.id]) if t.id in mine else None) for t in tasks]


@router.post("/tasks/{task_id}/submit", response_model=SubmissionOut, status_code=201)
async def submit(task_id: int, body: SubmitIn, user: CurrentUser, session: Session) -> SubmissionOut:
    return submission_out(await progress.submit(session, user, task_id, body.proof_url, body.note.strip(),
                                                body.file_ids))


@router.post("/tasks/{task_id}/complete-profile", response_model=SubmissionOut, status_code=201)
async def complete_profile(task_id: int, user: CurrentUser, session: Session) -> SubmissionOut:
    return submission_out(await progress.complete_profile_task(session, user, task_id))


@router.get("/reviews/queue", response_model=list[QueueItem])
async def review_queue(user: CurrentUser, session: Session) -> list[QueueItem]:
    return [QueueItem(submission_id=s.id, status=s.status, task_title=s.task.title,
                      track_title=s.task.track.title, proof_hint=s.task.proof_hint, proof_url=s.proof_url,
                      note=s.note, author_name=s.user.full_name, criteria=s.task.criteria,
                      peer_reviews=sum(r.kind in (ReviewKind.peer, ReviewKind.ai) for r in s.current_reviews),
                      files=[FileOut(**files.file_out(f)) for f in s.current_files],
                      submitted_at=s.updated_at)
            for s in await progress.review_queue(session, user)]


@router.post("/submissions/{submission_id}/reviews", response_model=SubmissionOut, status_code=201)
async def add_review(submission_id: int, body: ReviewIn, user: CurrentUser, session: Session) -> SubmissionOut:
    sub = await progress.review(session, user, submission_id, body.approved, body.comment.strip())
    return submission_out(sub)
