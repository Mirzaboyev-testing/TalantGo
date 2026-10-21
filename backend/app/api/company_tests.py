"""Company tests and surveys.

A company writes a test (choice questions scored automatically, written answers it scores itself, or plain
survey questions worth no points). An admin approves it before students see it. Each student takes a test
once; the company sees the results ranked by score and grades the written answers.
"""
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, StringConstraints, model_validator
from sqlalchemy import func, select

from ..models import Application, CompanyTest, Job, Role, TestAttempt, TestQuestion, Track, User
from ..services import notify
from .deps import AdminActor, CurrentUser, Session, audit
from .employer import ApprovedEmployer, Employer
from .jobs import company_hr_ids

employer_router = APIRouter(prefix="/employer", tags=["company-tests"])
student_router = APIRouter(prefix="/tests", tags=["company-tests"])
admin_router = APIRouter(prefix="/admin/tests", tags=["company-tests"])

TASHKENT = ZoneInfo("Asia/Tashkent")
GRACE = timedelta(minutes=2)          # a slow connection at the last second still counts as on time
Text = Annotated[str, StringConstraints(strip_whitespace=True)]


def today() -> date:
    return datetime.now(TASHKENT).date()


# --------------------------------------------------------------------------- input

class QuestionIn(BaseModel):
    kind: Literal["single", "multi", "text"]
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=2000)]
    options: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]] = \
        Field(default_factory=list, max_length=12)
    correct: list[int] = Field(default_factory=list, max_length=12)
    points: int = Field(default=0, ge=0, le=100)

    @model_validator(mode="after")
    def _shape(self):
        if self.kind == "text":
            self.options, self.correct = [], []
            return self
        if len(self.options) < 2:
            raise ValueError(f"«{self.text[:40]}» savoliga kamida 2 ta variant yozing")
        self.correct = sorted(set(self.correct))
        if any(i < 0 or i >= len(self.options) for i in self.correct):
            raise ValueError("To'g'ri javob variantlar ichidan tanlanadi")
        if self.kind == "single" and len(self.correct) > 1:
            raise ValueError("Bitta javobli savolda faqat bitta to'g'ri javob bo'ladi")
        if self.points > 0 and not self.correct:
            raise ValueError(f"«{self.text[:40]}» savoliga ball qo'yilgan: to'g'ri javobni belgilang yoki ballni 0 qiling")
        return self


class TestIn(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=160)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=3000)] = ""
    job_id: int | None = None
    audience: Literal["all", "tracks", "applicants"] = "all"
    track_ids: list[int] = Field(default_factory=list, max_length=10)
    deadline: date | None = None
    time_limit_min: int | None = Field(default=None, ge=1, le=300)
    questions: list[QuestionIn] = Field(min_length=1, max_length=50)
    submit: bool = True                  # false: keep as a draft, true: send to the admin for approval

    @model_validator(mode="after")
    def _audience(self):
        if self.audience == "tracks" and not self.track_ids:
            raise ValueError("Test kimga ko'rinishini tanlang: kamida bitta yo'nalish")
        if self.audience == "applicants" and not self.job_id:
            raise ValueError("«Ariza berganlar uchun» test vakansiyaga bog'lanishi kerak")
        if self.audience != "tracks":
            self.track_ids = []
        return self


class GradeIn(BaseModel):
    question_id: int
    points: float = Field(ge=0, le=100)
    comment: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""


class GradingIn(BaseModel):
    grades: list[GradeIn] = Field(default_factory=list, max_length=50)
    feedback: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""


class AnswerIn(BaseModel):
    question_id: int
    choice: list[int] = Field(default_factory=list, max_length=12)
    text: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)] = ""


class SubmitIn(BaseModel):
    answers: list[AnswerIn] = Field(default_factory=list, max_length=50)


class DecisionIn(BaseModel):
    approve: bool
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""


# --------------------------------------------------------------------------- shaping output

def scored(q: TestQuestion) -> bool:
    """A question that counts toward the score (survey questions do not)."""
    return q.points > 0 and (q.kind == "text" or bool(q.correct))


def max_score(test: CompanyTest) -> int:
    return sum(q.points for q in test.questions if scored(q))


def question_out(q: TestQuestion, with_answers: bool) -> dict:
    out = {"id": q.id, "kind": q.kind, "text": q.text, "options": q.options, "points": q.points}
    if with_answers:
        out["correct"] = q.correct
    return out


def test_summary(t: CompanyTest, attempts: int = 0, to_grade: int = 0) -> dict:
    return {
        "id": t.id, "title": t.title, "description": t.description, "status": t.status, "review_note": t.review_note,
        "audience": t.audience, "track_ids": t.track_ids, "job_id": t.job_id, "job_title": t.job.title if t.job else None,
        "deadline": t.deadline, "time_limit_min": t.time_limit_min, "questions_count": len(t.questions),
        "max_score": max_score(t), "is_survey": max_score(t) == 0, "company": t.company.name,
        "company_industry": t.company.industry, "attempts": attempts, "to_grade": to_grade,
        "created_at": t.created_at, "updated_at": t.updated_at,
    }


def test_full(t: CompanyTest, **counts) -> dict:
    return {**test_summary(t, **counts), "questions": [question_out(q, True) for q in t.questions]}


def _student_brief(u: User) -> dict:
    return {"id": u.id, "full_name": u.full_name, "username": u.username, "photo_url": u.photo_url,
            "university": u.university_ref.short_name if u.university_ref else None, "faculty": u.faculty,
            "course": u.course, "group_name": u.group_name, "track": u.track.title if u.track else None,
            "points": u.points}


def attempt_out(a: TestAttempt, with_correct: bool) -> dict:
    """The attempt with each question next to the student's answer and the points it got."""
    by_q = {ans["question_id"]: ans for ans in a.answers}
    items = []
    for q in a.test.questions:
        ans = by_q.get(q.id, {})
        items.append({"question": question_out(q, with_correct), "scored": scored(q),
                      "choice": ans.get("choice", []), "text": ans.get("text", ""),
                      "points": ans.get("points"), "comment": ans.get("comment", "")})
    return {"id": a.id, "test_id": a.test_id, "title": a.test.title, "status": a.status, "score": a.score,
            "max_score": a.max_score, "late": a.late, "feedback": a.feedback, "started_at": a.started_at,
            "submitted_at": a.submitted_at, "graded_at": a.graded_at, "items": items}


# --------------------------------------------------------------------------- employer

async def _own_test(session: Session, user: User, test_id: int) -> CompanyTest:
    test = await session.get(CompanyTest, test_id)
    if test is None or test.company_id != user.company_id:
        raise HTTPException(404, "Test topilmadi")
    return test


async def _counts(session: Session, test_ids: list[int]) -> dict[int, tuple[int, int]]:
    if not test_ids:
        return {}
    rows = (await session.execute(
        select(TestAttempt.test_id, func.count(), func.count().filter(TestAttempt.status == "submitted"))
        .where(TestAttempt.test_id.in_(test_ids), TestAttempt.status != "in_progress")
        .group_by(TestAttempt.test_id))).all()
    return {tid: (n, g) for tid, n, g in rows}


async def _check_links(session: Session, user: User, body: TestIn) -> None:
    if body.job_id and not await session.scalar(select(Job.id).where(Job.id == body.job_id, Job.company_id == user.company_id)):
        raise HTTPException(404, "Vakansiya topilmadi")
    if body.track_ids:
        found = await session.scalar(select(func.count()).select_from(Track).where(Track.id.in_(body.track_ids)))
        if found != len(set(body.track_ids)):
            raise HTTPException(404, "Yo'nalish topilmadi")


def _fill(test: CompanyTest, body: TestIn) -> None:
    for field in ("title", "description", "job_id", "audience", "track_ids", "deadline", "time_limit_min"):
        setattr(test, field, getattr(body, field))
    test.questions = [TestQuestion(sort_order=i, kind=q.kind, text=q.text, options=q.options, correct=q.correct,
                                   points=q.points) for i, q in enumerate(body.questions)]
    test.status, test.review_note = ("pending" if body.submit else "draft"), ""


async def _notify_admins(session: Session, text: str) -> None:
    ids = (await session.execute(select(User.telegram_id).where(
        (User.role == Role.admin) | User.is_owner, User.is_blocked.is_(False)))).scalars().all()
    notify.send(list(ids), text)


@employer_router.get("/tests")
async def my_tests(user: Employer, session: Session) -> list[dict]:
    tests = (await session.execute(select(CompanyTest).where(CompanyTest.company_id == user.company_id)
                                   .order_by(CompanyTest.created_at.desc()))).scalars().all()
    counts = await _counts(session, [t.id for t in tests])
    return [test_summary(t, *counts.get(t.id, (0, 0))) for t in tests]


@employer_router.post("/tests", status_code=201)
async def create_test(body: TestIn, user: ApprovedEmployer, session: Session) -> dict:
    await _check_links(session, user, body)
    test = CompanyTest(company_id=user.company_id, created_by_id=user.id)
    _fill(test, body)
    session.add(test)
    await session.commit()
    await session.refresh(test)
    if test.status == "pending":
        await _notify_admins(session, f"Yangi test tekshiruvni kutmoqda: {user.company.name}, «{test.title}».")
    return test_full(test)


@employer_router.get("/tests/{test_id}")
async def get_test(test_id: int, user: Employer, session: Session) -> dict:
    test = await _own_test(session, user, test_id)
    n, g = (await _counts(session, [test.id])).get(test.id, (0, 0))
    return test_full(test, attempts=n, to_grade=g)


@employer_router.put("/tests/{test_id}")
async def edit_test(test_id: int, body: TestIn, user: ApprovedEmployer, session: Session) -> dict:
    test = await _own_test(session, user, test_id)
    if test.status == "closed":
        raise HTTPException(409, "Yopilgan testni tahrirlab bo'lmaydi")
    if await session.scalar(select(func.count()).where(TestAttempt.test_id == test.id)):
        raise HTTPException(409, "Testni talabalar ishlay boshlagan: savollarni o'zgartirib bo'lmaydi. Yangi test yarating.")
    await _check_links(session, user, body)
    _fill(test, body)                          # every change is checked again before students see it
    await session.commit()
    await session.refresh(test)
    if test.status == "pending":
        await _notify_admins(session, f"Test qayta tekshiruvni kutmoqda: {user.company.name}, «{test.title}».")
    return test_full(test)


@employer_router.post("/tests/{test_id}/close")
async def close_test(test_id: int, user: Employer, session: Session) -> dict:
    test = await _own_test(session, user, test_id)
    test.status = "closed"
    await session.commit()
    await session.refresh(test)               # updated_at is set by the database
    return test_summary(test)


@employer_router.delete("/tests/{test_id}", status_code=204)
async def delete_test(test_id: int, user: Employer, session: Session) -> None:
    test = await _own_test(session, user, test_id)
    if await session.scalar(select(func.count()).where(TestAttempt.test_id == test.id)):
        raise HTTPException(409, "Natijalari bor testni o'chirib bo'lmaydi: uni yoping")
    await session.delete(test)
    await session.commit()


@employer_router.get("/tests/{test_id}/results")
async def results(test_id: int, user: ApprovedEmployer, session: Session) -> dict:
    """Everyone who finished the test, best score first (equal scores share a place)."""
    test = await _own_test(session, user, test_id)
    attempts = (await session.execute(select(TestAttempt).where(
        TestAttempt.test_id == test.id, TestAttempt.status != "in_progress")
        .order_by(TestAttempt.score.desc(), TestAttempt.submitted_at))).scalars().all()
    rows, place, previous = [], 0, None
    for position, a in enumerate(attempts, start=1):
        if a.score != previous:
            place, previous = position, a.score
        rows.append({"attempt_id": a.id, "place": place, "student": _student_brief(a.user), "status": a.status,
                     "score": a.score, "max_score": a.max_score,
                     "percent": round(100 * a.score / a.max_score) if a.max_score else None,
                     "late": a.late, "submitted_at": a.submitted_at})
    return {"test": test_summary(test, len(attempts), sum(a.status == "submitted" for a in attempts)), "rows": rows}


async def _own_attempt(session: Session, user: User, attempt_id: int) -> TestAttempt:
    attempt = await session.get(TestAttempt, attempt_id)
    if attempt is None or attempt.test.company_id != user.company_id or attempt.status == "in_progress":
        raise HTTPException(404, "Natija topilmadi")
    return attempt


@employer_router.get("/test-attempts/{attempt_id}")
async def attempt_detail(attempt_id: int, user: ApprovedEmployer, session: Session) -> dict:
    attempt = await _own_attempt(session, user, attempt_id)
    return {**attempt_out(attempt, with_correct=True), "student": _student_brief(attempt.user)}


@employer_router.post("/test-attempts/{attempt_id}/grade")
async def grade(attempt_id: int, body: GradingIn, user: ApprovedEmployer, session: Session) -> dict:
    """Points for written answers (and, if the company wants, a correction of an automatic score)."""
    attempt = await _own_attempt(session, user, attempt_id)
    questions = {q.id: q for q in attempt.test.questions}
    answers = {a["question_id"]: dict(a) for a in attempt.answers}
    for g in body.grades:
        q = questions.get(g.question_id)
        if q is None:
            raise HTTPException(404, "Savol topilmadi")
        if not scored(q):
            continue                               # survey questions carry no points
        if g.points > q.points:
            raise HTTPException(422, f"«{q.text[:40]}» savoliga ko'pi bilan {q.points} ball qo'yish mumkin")
        ans = answers.setdefault(q.id, {"question_id": q.id, "choice": [], "text": ""})
        ans["points"], ans["comment"] = round(g.points, 1), g.comment
    attempt.answers = [answers.get(q.id, {"question_id": q.id, "choice": [], "text": "", "points": None})
                       for q in attempt.test.questions]
    attempt.score = round(sum((a.get("points") or 0) for a in attempt.answers
                              if questions.get(a["question_id"]) and scored(questions[a["question_id"]])), 1)
    attempt.feedback = body.feedback
    ungraded = [q for q in attempt.test.questions if scored(q) and answers.get(q.id, {}).get("points") is None]
    was_graded = attempt.status == "graded"
    if not ungraded:
        attempt.status, attempt.graded_at = "graded", datetime.now(UTC)
    await session.commit()
    if attempt.status == "graded" and not was_graded:
        notify.send([attempt.user.telegram_id],
                    f"«{attempt.test.title}» testingiz baholandi ({user.company.name}): {attempt.score:g} / {attempt.max_score} ball.")
    return {**attempt_out(attempt, with_correct=True), "student": _student_brief(attempt.user)}


# --------------------------------------------------------------------------- students

async def _can_take(session: Session, user: User, test: CompanyTest) -> bool:
    if test.status != "approved" or test.company.status != "approved" or user.account_type != "student":
        return False
    if test.audience == "tracks":
        return user.track_id in test.track_ids
    if test.audience == "applicants":
        return bool(await session.scalar(select(Application.id).where(
            Application.job_id == test.job_id, Application.user_id == user.id)))
    return True


def _student_card(t: CompanyTest, attempt: TestAttempt | None) -> dict:
    out = test_summary(t)
    for key in ("attempts", "to_grade", "review_note", "track_ids"):
        out.pop(key, None)
    out["my_attempt"] = None if attempt is None else {
        "id": attempt.id, "status": attempt.status, "score": attempt.score, "max_score": attempt.max_score,
        "submitted_at": attempt.submitted_at}
    out["open"] = t.deadline is None or t.deadline >= today()
    return out


@student_router.get("")
async def student_tests(user: CurrentUser, session: Session) -> list[dict]:
    """Tests the student may take now, and every test they already took."""
    mine = {a.test_id: a for a in (await session.execute(select(TestAttempt).where(TestAttempt.user_id == user.id))).scalars()}
    tests = (await session.execute(select(CompanyTest).where(CompanyTest.status.in_(("approved", "closed")))
                                   .order_by(CompanyTest.created_at.desc()).limit(200))).scalars().all()
    out = []
    for t in tests:
        attempt = mine.get(t.id)
        if attempt is not None or (t.status == "approved" and (t.deadline is None or t.deadline >= today())
                                   and await _can_take(session, user, t)):
            out.append(_student_card(t, attempt))
    return out


async def _test_for_student(session: Session, user: User, test_id: int) -> tuple[CompanyTest, TestAttempt | None]:
    test = await session.get(CompanyTest, test_id)
    attempt = await session.scalar(select(TestAttempt).where(TestAttempt.test_id == test_id, TestAttempt.user_id == user.id))
    if test is None or (attempt is None and not await _can_take(session, user, test)):
        raise HTTPException(404, "Test topilmadi")
    return test, attempt


def _ends_at(test: CompanyTest, attempt: TestAttempt) -> datetime | None:
    return attempt.started_at + timedelta(minutes=test.time_limit_min) if test.time_limit_min else None


@student_router.get("/{test_id}")
async def student_test(test_id: int, user: CurrentUser, session: Session) -> dict:
    test, attempt = await _test_for_student(session, user, test_id)
    return _student_card(test, attempt)


@student_router.post("/{test_id}/start")
async def start(test_id: int, user: CurrentUser, session: Session) -> dict:
    """Opens the questions (without the right answers) and starts the clock. Calling it again resumes."""
    test, attempt = await _test_for_student(session, user, test_id)
    if attempt is not None and attempt.status != "in_progress":
        raise HTTPException(409, "Bu testni allaqachon topshirgansiz")
    if attempt is None:
        if test.status != "approved" or (test.deadline and test.deadline < today()):
            raise HTTPException(409, "Test muddati tugagan")
        attempt = TestAttempt(test_id=test.id, user_id=user.id, max_score=max_score(test), answers=[])
        session.add(attempt)
        await session.commit()
        await session.refresh(attempt)
    ends = _ends_at(test, attempt)
    return {**_student_card(test, attempt), "attempt_id": attempt.id, "started_at": attempt.started_at,
            "ends_at": ends, "questions": [question_out(q, False) for q in test.questions]}


@student_router.post("/{test_id}/submit")
async def submit(test_id: int, body: SubmitIn, user: CurrentUser, session: Session) -> dict:
    test, attempt = await _test_for_student(session, user, test_id)
    if attempt is None:
        raise HTTPException(409, "Avval testni boshlang")
    if attempt.status != "in_progress":
        raise HTTPException(409, "Bu testni allaqachon topshirgansiz")
    given = {a.question_id: a for a in body.answers}
    answers, score, needs_grading = [], 0.0, False
    for q in test.questions:
        a = given.get(q.id)
        choice = sorted({i for i in (a.choice if a else []) if 0 <= i < len(q.options)})
        if q.kind == "single":
            choice = choice[:1]
        item = {"question_id": q.id, "choice": choice if q.kind != "text" else [],
                "text": (a.text if a else "") if q.kind == "text" else "", "points": None, "comment": ""}
        if scored(q):
            if q.kind == "text":
                if item["text"]:
                    needs_grading = True
                else:
                    item["points"] = 0          # nothing written: nothing to grade
            else:
                item["points"] = float(q.points) if choice == sorted(q.correct) else 0.0
                score += item["points"]
        answers.append(item)
    now = datetime.now(UTC)
    ends = _ends_at(test, attempt)
    attempt.answers, attempt.score, attempt.max_score = answers, round(score, 1), max_score(test)
    attempt.submitted_at, attempt.late = now, bool(ends and now > ends + GRACE)
    attempt.status = "submitted" if needs_grading else "graded"
    if not needs_grading:
        attempt.graded_at = now
    await session.commit()
    if needs_grading:
        notify.send(await company_hr_ids(session, test.company_id),
                    f"«{test.title}» testini {user.full_name} topshirdi: yozma javoblarni baholang.")
    return _my_result(attempt)


def _my_result(attempt: TestAttempt) -> dict:
    """What the student sees: their answers, points and comments, but never the right answers
    (companies reuse their tests)."""
    return attempt_out(attempt, with_correct=False)


@student_router.get("/{test_id}/result")
async def my_result(test_id: int, user: CurrentUser, session: Session) -> dict:
    _, attempt = await _test_for_student(session, user, test_id)
    if attempt is None or attempt.status == "in_progress":
        raise HTTPException(404, "Natija hali yo'q")
    return _my_result(attempt)


# --------------------------------------------------------------------------- admin moderation

@admin_router.get("")
async def admin_tests(_: AdminActor, session: Session, status: str | None = None) -> list[dict]:
    query = select(CompanyTest)
    if status:
        query = query.where(CompanyTest.status == status)
    tests = (await session.execute(query.order_by(CompanyTest.updated_at.desc()).limit(300))).scalars().all()
    counts = await _counts(session, [t.id for t in tests])
    return [test_full(t, attempts=counts.get(t.id, (0, 0))[0], to_grade=counts.get(t.id, (0, 0))[1]) for t in tests]


@admin_router.post("/{test_id}/review")
async def review_test(test_id: int, body: DecisionIn, actor: AdminActor, session: Session) -> dict:
    test = await session.get(CompanyTest, test_id)
    if test is None:
        raise HTTPException(404, "Test topilmadi")
    if test.status == "draft":
        raise HTTPException(409, "Kompaniya bu testni hali tekshiruvga yubormagan")
    if body.approve and test.company.status != "approved":
        raise HTTPException(409, "Avval kompaniyani tasdiqlang")
    if not body.approve and not body.note:
        raise HTTPException(422, "Rad etish sababini yozing: u kompaniyaga yuboriladi")
    was_live = test.status == "approved"
    test.status, test.review_note = ("approved" if body.approve else "rejected"), body.note
    audit(session, actor, "test.review", f"{test.company.name}: {test.title}", f"{test.status} {body.note}")
    await session.commit()
    await session.refresh(test)
    notify.send(await company_hr_ids(session, test.company_id),
                f"«{test.title}» testi tasdiqlandi va talabalarga ko'rinmoqda." if body.approve
                else f"«{test.title}» testi qaytarildi. Izoh: {body.note}")
    if body.approve and not was_live:
        await _announce(session, test)
    return test_full(test)


async def _announce(session: Session, test: CompanyTest) -> None:
    """Tells the students the test is meant for that it is open."""
    query = select(User.telegram_id).where(User.account_type == "student", User.role == Role.student,
                                           User.is_blocked.is_(False), User.track_id.isnot(None))
    if test.audience == "tracks":
        query = query.where(User.track_id.in_(test.track_ids))
    elif test.audience == "applicants":
        query = query.join(Application, Application.user_id == User.id).where(Application.job_id == test.job_id)
    ids = (await session.execute(query)).scalars().all()
    deadline = f" Muddat: {test.deadline.strftime('%d.%m.%Y')}." if test.deadline else ""
    notify.send(list(ids), f"{test.company.name} yangi test e'lon qildi: «{test.title}».{deadline} "
                           "Ilovadagi «Vakansiyalar» > «Testlar» bo'limida ishlang.")
