"""Additive schema changes for databases created by an earlier version.

create_all() makes missing tables but never alters existing ones. Each statement here is idempotent,
so it is safe on a fresh database (where the columns already exist) and on every restart.
Switch to Alembic once a change is not purely additive.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from ..models import APPLICATION_STATES


def _states(values: tuple[str, ...]) -> str:
    return ", ".join(repr(v) for v in values)


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
    # a CHECK constraint cannot be altered in place: drop and re-create it with the longer state list
    "ALTER TABLE applications DROP CONSTRAINT IF EXISTS application_status_valid",
    f"ALTER TABLE applications ADD CONSTRAINT application_status_valid CHECK (status IN ({_states(APPLICATION_STATES)}))",
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
]


async def upgrade(conn: AsyncConnection) -> None:
    for statement in STATEMENTS:
        await conn.execute(text(statement))
