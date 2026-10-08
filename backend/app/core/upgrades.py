"""Additive schema changes for databases created by an earlier version.

create_all() makes missing tables but never alters existing ones. Each statement here is idempotent,
so it is safe on a fresh database (where the columns already exist) and on every restart.
Switch to Alembic once a change is not purely additive.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

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
]


async def upgrade(conn: AsyncConnection) -> None:
    for statement in STATEMENTS:
        await conn.execute(text(statement))
