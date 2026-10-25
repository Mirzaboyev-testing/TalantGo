"""Employment outcomes and the university statistics built on them.

Decision (user, 2026-10-26): for now a university is measured only by how many of its students got a job
or went to an internship, not by quality measures (field match, employer feedback). Definitions shown to
universities next to every number:
- Students counted: verified students of the university (account not blocked); optionally one faculty or
  one graduation year.
- Placed: at least one CONFIRMED outcome (a hire on the platform, or confirmed by the company or the
  university) recorded while the student belonged to this university: a job (full_time, part_time,
  dual_education) or an internship. Each student is counted once, under the strongest outcome.
- A share is shown only when at least MIN_SAMPLE students are behind it; otherwise "not enough data".
- What students only reported themselves is counted apart and never mixed into the confirmed figures.
"""
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Application, EmploymentOutcome, Partnership, User

MIN_SAMPLE = 10
JOB_KINDS = ("full_time", "part_time", "dual_education")
STRENGTH = ("full_time", "part_time", "dual_education", "internship")           # strongest first
JOB_KIND_TO_OUTCOME = {"internship": "internship", "part_time": "part_time", "junior": "full_time", "project": "part_time"}


def record_hire(session: AsyncSession, app: Application) -> None:
    """A hire on the platform is a confirmed outcome (once per application)."""
    session.add(EmploymentOutcome(
        student_id=app.user_id, university_id=app.user.university_id, company_id=app.job.company_id,
        company_name=app.job.company.name, position=app.job.title, kind=JOB_KIND_TO_OUTCOME.get(app.job.kind, "full_time"),
        started_on=date.today(), source="application", application_id=app.id, confirmed=True, confirmed_by="company"))


def share(part: int, whole: int) -> int | None:
    return round(100 * part / whole) if whole >= MIN_SAMPLE else None


async def university_stats(session: AsyncSession, university_id: int, cohort: int | None = None,
                           faculty: str | None = None) -> dict:
    students = (select(User.id, User.graduation_year, User.open_to_work)
                .where(User.university_id == university_id, User.account_type == "student",
                       User.verification == "verified", User.is_blocked.is_(False)))
    if faculty:
        students = students.where(User.faculty == faculty)
    all_rows = (await session.execute(students)).all()
    rows = [r for r in all_rows if r.graduation_year == cohort] if cohort else all_rows
    ids = [r.id for r in rows]

    outcomes: dict[int, list[EmploymentOutcome]] = {i: [] for i in ids}
    if ids:
        for o in (await session.execute(select(EmploymentOutcome).where(
                EmploymentOutcome.student_id.in_(ids), EmploymentOutcome.university_id == university_id))).scalars():
            outcomes[o.student_id].append(o)

    def best(student_id: int, confirmed: bool) -> str | None:
        kinds = {o.kind for o in outcomes[student_id] if o.confirmed == confirmed}
        return next((k for k in STRENGTH if k in kinds), None)

    where: dict[str, int] = {"full_time": 0, "part_time": 0, "dual_education": 0, "internship": 0, "seeking": 0, "unknown": 0}
    for r in rows:
        kind = best(r.id, True)
        where[kind or ("seeking" if r.open_to_work else "unknown")] += 1
    employed = sum(where[k] for k in JOB_KINDS)
    interned = where["internship"]
    placed = employed + interned
    self_reported = sum(1 for r in rows if best(r.id, True) is None and best(r.id, False) is not None)

    companies: dict[str, int] = {}
    for items in outcomes.values():
        for o in items:
            if o.confirmed:
                companies[o.company_name] = companies.get(o.company_name, 0) + 1
    hires = sum(1 for items in outcomes.values() for o in items if o.source == "application")
    partners = await session.scalar(select(func.count()).select_from(Partnership).where(
        Partnership.university_id == university_id, Partnership.status == "accepted"))

    return {
        "min_sample": MIN_SAMPLE,
        "students": len(rows),
        "with_graduation_year": sum(1 for r in rows if r.graduation_year),
        "placed": placed,
        "employed": employed,
        "interned": interned,
        "placement_rate": share(placed, len(rows)),
        "employed_rate": share(employed, len(rows)),
        "intern_rate": share(interned, len(rows)),
        "where": where,
        "self_reported": self_reported,
        "hires_on_platform": hires,
        "top_employers": [{"name": n, "count": c} for n, c in sorted(companies.items(), key=lambda x: (-x[1], x[0]))[:10]],
        "partners": partners,
        "cohorts": sorted({r.graduation_year for r in all_rows if r.graduation_year}, reverse=True),
    }
