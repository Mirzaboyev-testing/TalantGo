"""Additive schema changes for databases created by an earlier version.

create_all() makes missing tables but never alters existing ones. Each statement here is idempotent,
so it is safe on a fresh database (where the columns already exist) and on every restart.
Switch to Alembic once a change is not purely additive.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from ..models import ADMIN_ROLES, APPLICATION_STATES, TEST_AUDIENCES


def _states(values: tuple[str, ...]) -> str:
    return ", ".join(repr(v) for v in values)


def _replace_check(table: str, name: str, column: str, values: tuple[str, ...], newest: str) -> str:
    """Drops and re-adds a CHECK constraint only if its definition does not mention `newest` yet."""
    return (f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{name}' "
            f"AND pg_get_constraintdef(oid) LIKE '%''{newest}''%') THEN "
            f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}; "
            f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({column} IN ({_states(values)})); END IF; END $$")


STATEMENTS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz",
    "ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true",
    # career profile, employers and universities (Handshake-style features)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type varchar(16) NOT NULL DEFAULT 'student'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_at timestamptz",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS university_id integer REFERENCES universities(id) ON DELETE SET NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS faculty varchar(120) NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS course integer",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year integer",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS gpa double precision",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS gpa_scale integer NOT NULL DEFAULT 5",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS student_number varchar(32) NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS skills varchar(40)[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS languages varchar(40)[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS job_types varchar(16)[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS city varchar(60) NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS open_to_work boolean NOT NULL DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification varchar(16) NOT NULL DEFAULT 'none'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_by varchar(160) NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at timestamptz",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_note text NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_university_id integer REFERENCES universities(id) ON DELETE SET NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_status varchar(16) NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_position varchar(120) NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone varchar(20) NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_phone boolean NOT NULL DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_id integer REFERENCES users(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS ix_users_referred_by_id ON users (referred_by_id)",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'submission'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS headline varchar(120) NOT NULL DEFAULT ''",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by_id integer REFERENCES users(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS ix_users_university_id ON users (university_id)",
    "CREATE INDEX IF NOT EXISTS ix_users_company_id ON users (company_id)",
    "CREATE INDEX IF NOT EXISTS ix_users_skills ON users USING gin (skills)",
    # file submissions, task questions and the AI first pass
    "ALTER TYPE review_kind ADD VALUE IF NOT EXISTS 'ai'",
    "ALTER TABLE reviews ALTER COLUMN reviewer_id DROP NOT NULL",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS criteria text NOT NULL DEFAULT ''",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_state varchar(16) NOT NULL DEFAULT ''",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_note text NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS name_set_by_user boolean NOT NULL DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_nudged_at timestamptz",
    # the product was renamed from CareerFlow to TalantGo (2026-10-09)
    "UPDATE groups SET name = 'TalantGo hamjamiyati' WHERE auto_join_all AND name = 'CareerFlow hamjamiyati'",
    "UPDATE users SET verified_by = 'TalantGo' WHERE verified_by = 'CareerFlow'",
    # TalantGo became Careerup (2026-11-17): the names stored in the data follow
    "UPDATE groups SET name = 'Careerup hamjamiyati' WHERE auto_join_all AND name = 'TalantGo hamjamiyati'",
    "UPDATE users SET verified_by = 'Careerup' WHERE verified_by IN ('TalantGo', 'CareerFlow')",
    # two-way sign-up (job seeker / employer) and company tests (2026-10-13)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_version integer NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS work_industries varchar(24)[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title varchar(120) NOT NULL DEFAULT ''",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_form varchar(24) NOT NULL DEFAULT ''",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS size varchar(16) NOT NULL DEFAULT ''",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS telegram varchar(128) NOT NULL DEFAULT ''",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS address varchar(200) NOT NULL DEFAULT ''",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS email varchar(120) NOT NULL DEFAULT ''",
    # website sign-in with email and password, accounts without Telegram (2026-10-20)
    "ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email varchar(160)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash varchar(255) NOT NULL DEFAULT ''",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_unique ON users (email)",
    # website sign-in through the bot needs a PIN typed on the site (2026-10-21)
    "ALTER TABLE login_requests ADD COLUMN IF NOT EXISTS pin varchar(6) NOT NULL DEFAULT ''",
    "ALTER TABLE login_requests ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0",
    "ALTER TABLE login_requests ADD COLUMN IF NOT EXISTS tg_username varchar(64)",
    # three panels (student / company / university): application pipeline, inbox, language (2026-10-26)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS language varchar(5) NOT NULL DEFAULT 'uz'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS visible_to_employers boolean NOT NULL DEFAULT true",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_at timestamptz",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_place varchar(300) NOT NULL DEFAULT ''",
    # a CHECK constraint cannot be altered in place: re-create it, but only when it lacks the newest value
    _replace_check("applications", "application_status_valid", "status", APPLICATION_STATES, "withdrawn"),
    # company tasks reuse challenges (2026-10-26)
    "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE CASCADE",
    "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS audience varchar(12) NOT NULL DEFAULT 'all'",
    "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS university_id integer REFERENCES universities(id) ON DELETE SET NULL",
    "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS invited_ids integer[] NOT NULL DEFAULT '{}'",
    "CREATE INDEX IF NOT EXISTS ix_challenges_company_id ON challenges (company_id)",
    # university panel: public profile fields (2026-10-26)
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS website varchar(256) NOT NULL DEFAULT ''",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS region varchar(60) NOT NULL DEFAULT ''",
    # admin roles: moderator and analyst (2026-10-26)
    _replace_check("admin_accounts", "admin_role_valid", "role", ADMIN_ROLES, "analyst"),
    # company sign-up in steps: role, documents, logo, what the company wants from students (2026-11-17)
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS ownership varchar(16) NOT NULL DEFAULT ''",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_role varchar(16) NOT NULL DEFAULT ''",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS cooperation varchar(16)[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS wanted_track_ids integer[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_as_partner boolean NOT NULL DEFAULT false",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS registration_doc_id integer REFERENCES submission_files(id) ON DELETE SET NULL",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS authority_doc_id integer REFERENCES submission_files(id) ON DELETE SET NULL",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_file_id integer REFERENCES submission_files(id) ON DELETE SET NULL",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS submitted_at timestamptz",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS reviewed_at timestamptz",
    # university panel v2: staff request details, team roles, university contacts and files (2026-11-17)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_role varchar(12) NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_department varchar(120) NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_work_email varchar(120) NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_doc_id integer REFERENCES submission_files(id) ON DELETE SET NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_extra jsonb NOT NULL DEFAULT '{}'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_review_note text NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_reviewed_by varchar(160) NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_submitted_at timestamptz",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_reviewed_at timestamptz",
    # staff approved before roles existed: the earliest approved person of each university leads it
    "UPDATE users SET staff_role = 'lead' WHERE id IN (SELECT DISTINCT ON (staff_university_id) id FROM users "
    "WHERE staff_status = 'approved' AND staff_university_id IS NOT NULL ORDER BY staff_university_id, id) "
    "AND staff_role = ''",
    "UPDATE users SET staff_role = 'member' WHERE staff_status = 'approved' AND staff_role = ''",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS telegram varchar(128) NOT NULL DEFAULT ''",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS social varchar(256) NOT NULL DEFAULT ''",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS email varchar(120) NOT NULL DEFAULT ''",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS phone varchar(20) NOT NULL DEFAULT ''",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS address varchar(200) NOT NULL DEFAULT ''",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS founded_year integer",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS students_total integer",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS cooperation varchar(24)[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS show_as_partner boolean NOT NULL DEFAULT false",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS logo_file_id integer REFERENCES submission_files(id) ON DELETE SET NULL",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS mou_file_id integer REFERENCES submission_files(id) ON DELETE SET NULL",
    # student panel v2 (2026-11-17): job functions for students and vacancies, faculties per university
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS job_fields varchar(24)[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_fields varchar(24)[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE universities ADD COLUMN IF NOT EXISTS faculties varchar(120)[] NOT NULL DEFAULT '{}'",
    # student panel v2, phase 2: photo, cover, experience details, files kept on the profile, portfolio count
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_file_id integer REFERENCES submission_files(id) ON DELETE SET NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_file_id integer REFERENCES submission_files(id) ON DELETE SET NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio_n integer NOT NULL DEFAULT 0",
    "ALTER TABLE employment_outcomes ADD COLUMN IF NOT EXISTS ended_on date",
    "ALTER TABLE employment_outcomes ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''",
    "ALTER TABLE submission_files ADD COLUMN IF NOT EXISTS kept boolean NOT NULL DEFAULT false",
    # the count is recomputed on every start, so it heals if a write path ever missed it
    "UPDATE users u SET portfolio_n = (SELECT count(*) FROM portfolio_items p WHERE p.user_id = u.id) "
    "+ (SELECT count(*) FROM employment_outcomes o WHERE o.student_id = u.id) "
    "WHERE u.account_type = 'student'",
    # student panel v2, phase 3: files on company task entries, company events (create_all makes the chat tables)
    "ALTER TABLE challenge_entries ADD COLUMN IF NOT EXISTS file_ids integer[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE university_events ALTER COLUMN university_id DROP NOT NULL",
    "ALTER TABLE university_events ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE CASCADE",
    "CREATE INDEX IF NOT EXISTS ix_university_events_company_id ON university_events (company_id)",
    # TalantGo became Careerup (2026-11-17): university staff decided by the platform admin
    "UPDATE users SET staff_reviewed_by = 'Careerup' WHERE staff_reviewed_by = 'TalantGo'",
    # per-account permissions switched on and off by the owner (2026-11-18); null keeps the role's defaults
    "ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS permissions jsonb",
    # notifications and password recovery (2026-11-19); create_all makes the new tables
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false",
    # notifications phase 2 (2026-11-19): collapsing threads, interview and deadline reminders, announcements in the bell
    "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS group_key varchar(60) NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS ix_notifications_unread_group ON notifications (user_id, group_key) "
    "WHERE read_at IS NULL AND group_key <> ''",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_reminded_for timestamptz",
    "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS deadline_reminded_at timestamptz",
    "ALTER TABLE company_tests ADD COLUMN IF NOT EXISTS deadline_reminded_at timestamptz",
    "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS in_app integer NOT NULL DEFAULT 0",
    # notifications phase 3 (2026-11-19): bot settings, unreachable people, admin accounts on Telegram
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_prefs jsonb NOT NULL DEFAULT '{}'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS tg_blocked_at timestamptz",
    "ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS telegram_id bigint UNIQUE",
    "ALTER TABLE login_requests ADD COLUMN IF NOT EXISTS link_admin_id integer REFERENCES admin_accounts(id) ON DELETE CASCADE",
    _replace_check("login_requests", "login_request_purpose_valid", "purpose", ("login", "link", "admin"), "admin"),

    # company tests and tasks aimed at job functions instead of a track (2026-11-19)
    "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS job_fields varchar(24)[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE company_tests ADD COLUMN IF NOT EXISTS job_fields varchar(24)[] NOT NULL DEFAULT '{}'",
    _replace_check("company_tests", "company_test_audience_valid", "audience", TEST_AUDIENCES, "fields"),
    # university announcements with photos, to students, partner companies and the public page (2026-11-19)
    "ALTER TABLE university_announcements ADD COLUMN IF NOT EXISTS channels varchar(12)[] NOT NULL DEFAULT '{students}'",
    "ALTER TABLE university_announcements ADD COLUMN IF NOT EXISTS category varchar(16) NOT NULL DEFAULT 'news'",
    "ALTER TABLE university_announcements ADD COLUMN IF NOT EXISTS photo_ids integer[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE university_announcements ADD COLUMN IF NOT EXISTS company_recipients integer NOT NULL DEFAULT 0",
    "ALTER TABLE university_announcements ADD COLUMN IF NOT EXISTS status varchar(12) NOT NULL DEFAULT 'published'",
    # live test fixes (2026-11-19): peers see a Telegram username only with the student's consent;
    # an admin given a temporary password must replace it before using the admin site
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_telegram boolean NOT NULL DEFAULT false",
    "ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false",
]


async def upgrade(conn: AsyncConnection) -> None:
    for statement in STATEMENTS:
        await conn.execute(text(statement))
